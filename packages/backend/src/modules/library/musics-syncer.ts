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
      if (existingTrack.filePath !== filePath) {
        trackRepo.update(existingTrack.id, {
          filePath,
          fileSize: stat.size,
        });
        existingTrack.filePath = filePath;
        existingTrack.fileSize = stat.size;
        logger.info(
          { trackId: existingTrack.id, oldPath: existingTrack.filePath, newPath: filePath },
          '[曲库同步] 追踪到曲目路径迁移，已更新物理存储位置'
        );
      }
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

interface MissingPool {
  existingPathMap: Map<string, Track>;
  missingTracksByHash: Map<string, Track>;
  missingTracksById: Map<string, Track>;
  prunedCount: number;
}

/**
 * 探查曲库现状：划分在席物理曲目与失联待挽救候选池
 */
function partitionDbTracks(
  allDbTracks: Track[],
  targetDir: string,
  diskPathsSet: Set<string>,
  trackRepo: TrackRepository
): MissingPool {
  const existingPathMap = new Map<string, Track>();
  const missingTracksByHash = new Map<string, Track>();
  const missingTracksById = new Map<string, Track>();
  let prunedCount = 0;

  for (const t of allDbTracks) {
    if (!t.filePath.startsWith(targetDir)) {
      trackRepo.delete(t.id);
      prunedCount++;
    } else if (diskPathsSet.has(t.filePath)) {
      existingPathMap.set(t.filePath, t);
    } else {
      missingTracksByHash.set(t.fileHash, t);
      missingTracksById.set(t.id, t);
    }
  }

  return { existingPathMap, missingTracksByHash, missingTracksById, prunedCount };
}

/**
 * 尝试通过 SHA-256 哈希寻回重命名或挪入新目录的曲目 (ISSUE-02)
 */
function resolveTrackMigration(
  filePath: string,
  missingTracksByHash: Map<string, Track>,
  missingTracksById: Map<string, Track>,
  trackRepo: TrackRepository
): Track | null {
  const stat = fs.statSync(filePath);
  const fileHash = computeFileHash(filePath);

  const migratedTrack = missingTracksByHash.get(fileHash);
  if (migratedTrack) {
    trackRepo.update(migratedTrack.id, {
      filePath,
      fileSize: stat.size,
      updatedAt: Date.now(),
    });
    migratedTrack.filePath = filePath;
    migratedTrack.fileSize = stat.size;

    missingTracksByHash.delete(fileHash);
    missingTracksById.delete(migratedTrack.id);

    logger.info(
      {
        trackId: migratedTrack.id,
        title: migratedTrack.title,
        oldPath: migratedTrack.filePath,
        newPath: filePath,
      },
      '[曲库同步] 成功识别曲目移动/重命名 (Hash Matching)，保活歌单与红心关联'
    );
    return migratedTrack;
  }

  const existingByHash = trackRepo.findByHash(fileHash);
  if (existingByHash && !fs.existsSync(existingByHash.filePath)) {
    trackRepo.update(existingByHash.id, {
      filePath,
      fileSize: stat.size,
      updatedAt: Date.now(),
    });
    existingByHash.filePath = filePath;
    existingByHash.fileSize = stat.size;
    return existingByHash;
  }

  return null;
}

/**
 * 严格锁定 musics/ 目录并执行就地增量同步：
 * 1. 递归检索 musics/ 下所有音频并建立磁盘路径集合
 * 2. 提取失联曲目候选池，暂缓删除以备指纹追踪 (ISSUE-02)
 * 3. 采用零哈希快径直通在席曲目；对新路径文件计算哈希对齐迁移曲目，保活歌单、红心与播放统计
 * 4. 仅注销经全盘比对后仍未能寻回的历史孤立曲目
 */
export async function syncMusicsDirectory(dirPath?: string): Promise<{
  scanned: number;
  imported: number;
  migrated: number;
  pruned: number;
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

  // 1. 递归检索当前物理磁盘上的所有音频文件
  const diskAudioFiles = findAudioFilesRecursively(targetDir);
  const diskPathsSet = new Set(diskAudioFiles);

  // 2. 探查数据库，划分在席文件与失联候选池
  const allDbTracks = trackRepo.getAllTracks(true);
  const {
    existingPathMap,
    missingTracksByHash,
    missingTracksById,
    prunedCount: initialPruned,
  } = partitionDbTracks(allDbTracks, targetDir, diskPathsSet, trackRepo);
  let prunedCount = initialPruned;

  if (missingTracksById.size > 0) {
    logger.info(
      `[曲库同步] 检测到 ${missingTracksById.size} 首曲目原路径失联，进入指纹比对保活检索...`
    );
  }

  // 3. 遍历磁盘文件：快径直通 vs 哈希对齐保活 vs 全新入库
  const importedTracks: Track[] = [];
  let migratedCount = 0;
  const taskId = `sync_musics_${Date.now()}`;

  for (let i = 0; i < diskAudioFiles.length; i++) {
    const filePath = diskAudioFiles[i];

    broadcastTaskProgress({
      taskId,
      stage: 'directory_scanning',
      percent: Math.round(((i + 1) / (diskAudioFiles.length || 1)) * 100),
      message: `正在索引 (${i + 1}/${diskAudioFiles.length}): ${path.basename(filePath)}`,
    });

    // 快径：原路径未变更
    const existing = existingPathMap.get(filePath);
    if (existing) {
      importedTracks.push(existing);
      continue;
    }

    // 尝试寻回重命名或路径迁移
    const migrated = resolveTrackMigration(
      filePath,
      missingTracksByHash,
      missingTracksById,
      trackRepo
    );
    if (migrated) {
      importedTracks.push(migrated);
      migratedCount++;
      continue;
    }

    // 确认系全新曲目，走标准化诊断与入库流程
    const res = await processSingleAudioFile(filePath, trackRepo, playlistRepo, `${taskId}_${i}`);
    if (res.track) {
      importedTracks.push(res.track);
    }
  }

  // 4. 收尾清理：经全盘扫描后仍未能寻回的孤立条目，最终执行注销
  for (const orphan of missingTracksById.values()) {
    trackRepo.delete(orphan.id);
    prunedCount++;
    logger.info(
      { trackId: orphan.id, title: orphan.title, filePath: orphan.filePath },
      '[曲库同步] 物理文件已彻底在磁盘移除且无匹配新文件，从曲库安全注销'
    );
  }

  logger.info(
    `[曲库同步] 扫描完成: 共检测到 ${diskAudioFiles.length} 首物理文件，入库/保活 ${importedTracks.length} 首 (其中路径迁移保活 ${migratedCount} 首)，注销物理失联 ${prunedCount} 首`
  );

  return {
    scanned: diskAudioFiles.length,
    imported: importedTracks.length,
    migrated: migratedCount,
    pruned: prunedCount,
    tracks: importedTracks,
  };
}
