import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';

export interface ExtractedMetadata {
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  duration: number;
  bitrate: number;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  hasEmbeddedCover: boolean;
  coverBuffer?: Buffer;
  coverMime?: string;
  rawLyrics?: string;
}

/**
 * 流式解析音频元数据与内嵌封面
 * 采用 music-metadata 纯 TypeScript 原生解析器
 */
export async function parseAudioMetadata(filePath: string): Promise<ExtractedMetadata> {
  const metadata = await parseFile(filePath, { duration: true });

  const common = metadata.common;
  const format = metadata.format;

  const title = common.title || path.basename(filePath, path.extname(filePath));
  const artist = common.artist || 'Unknown';
  const album = common.album || 'Unknown';
  const albumArtist = common.albumartist;

  let coverBuffer: Buffer | undefined;
  let coverMime: string | undefined;

  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    coverBuffer = Buffer.from(pic.data);
    coverMime = pic.format;
  }

  // 提取歌词 (Vorbis Comment LYRICS 字段或 ID3 USLT 标签)
  const rawLyrics = common.lyrics ? common.lyrics.join('\n') : undefined;

  return {
    title,
    artist,
    album,
    albumArtist,
    duration: format.duration || 0,
    bitrate: format.bitrate || 0,
    sampleRate: format.sampleRate || 44100,
    bitDepth: format.bitsPerSample || 16,
    channels: format.numberOfChannels || 2,
    hasEmbeddedCover: Boolean(coverBuffer),
    coverBuffer,
    coverMime,
    rawLyrics,
  };
}

/**
 * 缓存内嵌封面图片至本地 cache/covers/
 */
export function cacheCoverArt(coverBuffer: Buffer, fileHash: string): string {
  const config = getConfig();
  const coverPath = path.join(config.storage.cacheDir, 'covers', `${fileHash}.webp`);

  if (!fs.existsSync(coverPath)) {
    fs.writeFileSync(coverPath, coverBuffer);
    logger.debug({ coverPath }, '[MetadataWriter] 专辑封面已缓存至本地');
  }

  return coverPath;
}
