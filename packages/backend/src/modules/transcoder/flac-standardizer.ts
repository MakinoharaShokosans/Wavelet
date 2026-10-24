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

export interface ComputeHashOptions {
  signal?: AbortSignal;
  chunkSize?: number;
}

/**
 * @deprecated Use computeFileHashAsync instead to avoid blocking the event loop on large audio files.
 */
export function computeFileHash(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * 流式异步计算文件的 SHA-256 哈希
 * 通过 ReadableStream 逐块更新哈希（默认 1MB 分块），避免一次性载入大文件导致事件循环被同步阻塞
 */
export function computeFileHashAsync(
  filePath: string,
  options?: ComputeHashOptions
): Promise<string> {
  const chunkSize = options?.chunkSize ?? 1024 * 1024; // 1 MiB

  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      return reject(options.signal.reason ?? new Error('Aborted'));
    }

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });

    let settled = false;

    const cleanup = () => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      stream.destroy();
      reject(options?.signal?.reason ?? new Error('Aborted'));
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(hash.digest('hex'));
    });

    stream.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
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
  const fileHash = await computeFileHashAsync(targetFlacPath);

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
