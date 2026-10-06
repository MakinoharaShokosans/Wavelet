import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '@wavelet/shared';
import { getConfig, resolveHome } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { broadcastTaskProgress } from '../gateway/ws/broadcaster.js';
import { diagnoseAudioFile, executeHealingPipeline } from '../inspector/pipeline.js';
import { extractWaveformPeaks } from '../inspector/waveform-extractor.js';
import { computeFileHash } from '../transcoder/flac-standardizer.js';
import { cacheCoverArt, parseAudioMetadata } from '../transcoder/metadata-writer.js';
import { PlaylistRepository } from './repositories/playlist.repository.js';
import { TrackRepository } from './repositories/track.repository.js';

export const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.ape',
  '.alac',
  '.aiff',
  '.wma',
  '.webm',
]);

export function findAudioFilesRecursively(dirPath: string): string[] {
  const results: string[] = [];
  function walk(current: string) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(dirPath);
  return results;
}

export function linkTrackToPlaylists(playlistRepo: PlaylistRepository, trackId: string): void {
  const defaultPlaylist = playlistRepo.findDefault();
  if (defaultPlaylist) {
    playlistRepo.addTrackToPlaylist(defaultPlaylist.id, trackId);
  }
  const unintegrated = playlistRepo.findUnintegrated();
  if (unintegrated) {
    playlistRepo.addTrackToPlaylist(unintegrated.id, trackId);
  }
}

/**
 * 原地扫描音频文件并建立曲库索引 (原地保留文件，不向母库冗余复制)
 */
export async function processSingleAudioFile(
  filePath: string,
  trackRepo: TrackRepository,
  playlistRepo: PlaylistRepository,
  taskId: string
): Promise<{ track?: Track; error?: string }> {
  try {
    // 1. 体检阶段
    broadcastTaskProgress({
      taskId,
      stage: 'diagnosing',
      percent: 20,
      message: `正在诊断: ${path.basename(filePath)}`,
    });
    const diagnosis = await diagnoseAudioFile(filePath);

    // 2. 自愈修复预检
    let activeAudioPath = filePath;
    if (diagnosis.corruptions.length > 0) {
      broadcastTaskProgress({
        taskId,
        stage: 'healing',
        percent: 45,
        message: `检测到音频轻微破损，正在自愈: ${path.basename(filePath)}`,
      });
      const healingResult = await executeHealingPipeline(diagnosis);
      if (!healingResult.success) {
        broadcastTaskProgress({
          taskId,
          stage: 'quarantined',
          percent: 100,
          message: '音频存在致命损坏且无法自愈，已移交隔离区',
        });
        return { error: '音频存在致命损坏且无法自愈，已自动移交隔离区' };
      }
      activeAudioPath = healingResult.healedPath;
    }

    // 3. 原地抽取元数据与封面/波形缓存
    broadcastTaskProgress({
      taskId,
      stage: 'indexing',
      percent: 70,
      message: `正在提取元数据与波形: ${path.basename(filePath)}`,
    });

    const stat = fs.statSync(filePath);
    const fileHash = computeFileHash(filePath);

    // 检查曲库中是否已存在该曲目 (若哈希或文件路径已存在则安全复用，保证幂等)
    const existingTrack = trackRepo.findByHash(fileHash) || trackRepo.findByPath(filePath);
    if (existingTrack) {
      linkTrackToPlaylists(playlistRepo, existingTrack.id);
      return { track: existingTrack };
    }

    const metadata = await parseAudioMetadata(activeAudioPath);

    if (metadata.hasEmbeddedCover && metadata.coverBuffer) {
      cacheCoverArt(metadata.coverBuffer, fileHash);
    }

    // 异步抽取 128 点整轨波形并持久化缓存
    try {
      await extractWaveformPeaks(activeAudioPath, fileHash, metadata.duration);
    } catch {
      // 波形抽取失败不阻断入库
    }

    const title = metadata.title || path.basename(filePath, path.extname(filePath));
    const now = Date.now();

    const track: Track = {
      id: `trk_${fileHash.slice(0, 16)}`,
      title,
      artist: metadata.artist || '未知艺术家',
      album: metadata.album || '未知专辑',
      albumArtist: metadata.albumArtist || metadata.artist || '未知艺术家',
      duration: metadata.duration || 0,
      bitrate: metadata.bitrate || 0,
      sampleRate: metadata.sampleRate || 44100,
      bitDepth: metadata.bitDepth || 16,
      channels: metadata.channels || 2,
      filePath, // 原地索引，绝对不产生额外文件拷贝！
      fileSize: stat.size,
      fileHash,
      hasEmbeddedCover: metadata.hasEmbeddedCover,
      hasEmbeddedLyrics: Boolean(metadata.rawLyrics),
      healthyStatus: diagnosis.corruptions.length > 0 ? 'repaired' : 'healthy',
      playCount: 0,
      isFavorite: false,
      repairDetails:
        diagnosis.corruptions.length > 0
          ? diagnosis.corruptions.map((c) => ({
              type: c,
              description: diagnosis.details.join('; '),
              repairedAt: now,
            }))
          : undefined,
      createdAt: Math.round(stat.birthtimeMs || now),
      updatedAt: now,
    };

    trackRepo.insert(track);
    linkTrackToPlaylists(playlistRepo, track.id);

    broadcastTaskProgress({
      taskId,
      stage: 'completed',
      percent: 100,
      message: `原地索引完成: ${track.title}`,
    });

    return { track };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * 严格锁定 musics/ 目录并执行就地增量同步：
 * 1. 移除非当前 musics/ 目录或磁盘已删除的历史条目，维持纯净单一来源
 * 2. 扫描 musics/ 下所有音频并建立索引
 */
export async function syncMusicsDirectory(dirPath?: string): Promise<{
  scanned: number;
  imported: number;
  tracks: Track[];
}> {
  const config = getConfig();
  const targetDir = dirPath ? resolveHome(dirPath) : config.storage.libraryDir;
  const trackRepo = new TrackRepository();
  const playlistRepo = new PlaylistRepository();

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  logger.info({ targetDir }, `[曲库同步] 正在扫描 musics 物理目录: ${targetDir}`);

  // 1. 严格作用域控制：仅识别 targetDir (musics/) 内的音乐
  // 清理数据库中所有不在 targetDir 范围内的历史曲目，或磁盘上已被删除的曲目
  const allFiles = trackRepo.getAllFilePaths();
  let prunedCount = 0;
  for (const t of allFiles) {
    if (!t.filePath.startsWith(targetDir) || !fs.existsSync(t.filePath)) {
      trackRepo.delete(t.id);
      prunedCount++;
    }
  }
  if (prunedCount > 0) {
    logger.info(`[曲库同步] 已隔离并移除 ${prunedCount} 首非 musics 目录的历史孤立曲目`);
  }

  // 2. 递归检索当前 musics 目录下的所有音频
  const audioFiles = findAudioFilesRecursively(targetDir);
  const importedTracks: Track[] = [];
  const taskId = `sync_musics_${Date.now()}`;

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];
    broadcastTaskProgress({
      taskId,
      stage: 'directory_scanning',
      percent: Math.round(((i + 1) / (audioFiles.length || 1)) * 100),
      message: `正在索引 (${i + 1}/${audioFiles.length}): ${path.basename(filePath)}`,
    });

    const res = await processSingleAudioFile(filePath, trackRepo, playlistRepo, `${taskId}_${i}`);
    if (res.track) {
      importedTracks.push(res.track);
    }
  }

  logger.info(
    `[曲库同步] 扫描完成: 共检测到 ${audioFiles.length} 首音频，本次成功增量入库 ${importedTracks.length} 首`
  );

  return {
    scanned: audioFiles.length,
    imported: importedTracks.length,
    tracks: importedTracks,
  };
}
