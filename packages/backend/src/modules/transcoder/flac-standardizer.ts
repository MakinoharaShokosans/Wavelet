import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '@wavelet/shared';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { cacheCoverArt, parseAudioMetadata } from './metadata-writer.js';
import { TranscodeWorkerPool } from './worker-pool.js';

let sharedPool: TranscodeWorkerPool | null = null;

export function getWorkerPool(): TranscodeWorkerPool {
  if (!sharedPool) {
    sharedPool = new TranscodeWorkerPool();
  }
  return sharedPool;
}

export function computeFileHash(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * 音频无损标准化归档
 * 将输入音频 (WAV/MP3/AAC/修复后音频) 统一转为母带级健康 FLAC 并归档至用户音乐库
 */
export async function standardizeToFlac(
  inputPath: string,
  isAlreadyHealthyFlac = false,
  onProgress?: (percent: number) => void
): Promise<Track> {
  const config = getConfig();
  const pool = getWorkerPool();

  const metadata = await parseAudioMetadata(inputPath);
  const safeArtist = metadata.artist.replace(/[\\/:*?"<>|]/g, '_');
  const safeAlbum = metadata.album.replace(/[\\/:*?"<>|]/g, '_');
  const safeTitle = metadata.title.replace(/[\\/:*?"<>|]/g, '_');

  const targetDir = path.join(config.storage.libraryDir, safeArtist, safeAlbum);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFlacPath = path.join(targetDir, `${safeTitle}.flac`);

  if (isAlreadyHealthyFlac) {
    // 已经是健康 FLAC，直接复制到库中，避免重复编码
    fs.copyFileSync(inputPath, targetFlacPath);
  } else {
    // 调用 Worker 线程池无损封装为 FLAC
    const tempOutputPath = path.join(
      config.storage.cacheDir,
      'temp',
      `std_${Date.now()}_${safeTitle}.flac`
    );

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await pool.submit({
      id: taskId,
      inputPath,
      outputPath: tempOutputPath,
      onProgress,
    });

    // 移动至物理目标母库
    fs.copyFileSync(tempOutputPath, targetFlacPath);
    try {
      fs.unlinkSync(tempOutputPath);
    } catch {
      // 忽略清理失败
    }
  }

  const stat = fs.statSync(targetFlacPath);
  const fileHash = computeFileHash(targetFlacPath);

  // 提取并缓存封面
  if (metadata.hasEmbeddedCover && metadata.coverBuffer) {
    cacheCoverArt(metadata.coverBuffer, fileHash);
  }

  const now = Date.now();
  const track: Track = {
    id: `trk_${fileHash.slice(0, 16)}`,
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    albumArtist: metadata.albumArtist,
    duration: metadata.duration,
    bitrate: metadata.bitrate,
    sampleRate: metadata.sampleRate,
    bitDepth: metadata.bitDepth,
    channels: metadata.channels,
    filePath: targetFlacPath,
    fileSize: stat.size,
    fileHash,
    hasEmbeddedCover: metadata.hasEmbeddedCover,
    hasEmbeddedLyrics: Boolean(metadata.rawLyrics),
    healthyStatus: 'healthy',
    createdAt: now,
    updatedAt: now,
  };

  logger.info(
    { title: track.title, artist: track.artist, targetFlacPath },
    '[Standardizer] 音频已成功无损标准化归档'
  );

  return track;
}
