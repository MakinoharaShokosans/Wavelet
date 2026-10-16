import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../bootstrap/logger.js';

export interface SidecarCoverResult {
  buffer: Buffer;
  filePath: string;
}

const SUPPORTED_COVER_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const STANDARD_COVER_NAMES = ['cover', 'folder', 'front', 'album', 'artwork'];

/**
 * 探查音频同级目录下的外挂伴随歌词文件 (.lrc 或 .txt)
 */
export function findSidecarLyrics(audioFilePath: string): string | null {
  try {
    const dir = path.dirname(audioFilePath);
    if (!fs.existsSync(dir)) return null;

    const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
    const entries = fs.readdirSync(dir);

    // 优先匹配同名 .lrc 文件 (大小写不敏感)，次优先匹配同名 .txt 文件
    let matchedTxt: string | null = null;

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      const name = path.basename(entry, path.extname(entry));
      if (name.toLowerCase() === baseName.toLowerCase()) {
        if (ext === '.lrc') {
          const lrcPath = path.join(dir, entry);
          const raw = fs.readFileSync(lrcPath, 'utf-8');
          return raw.replace(/^\uFEFF/, '').trim();
        }
        if (ext === '.txt' && !matchedTxt) {
          matchedTxt = path.join(dir, entry);
        }
      }
    }

    if (matchedTxt) {
      const raw = fs.readFileSync(matchedTxt, 'utf-8');
      return raw.replace(/^\uFEFF/, '').trim();
    }

    return null;
  } catch (err) {
    logger.debug({ err, audioFilePath }, '[SidecarDetector] 探查伴随歌词失败');
    return null;
  }
}

function findTrackSpecificCover(
  dir: string,
  baseName: string,
  entries: string[]
): SidecarCoverResult | null {
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!SUPPORTED_COVER_EXTS.has(ext)) continue;
    const name = path.basename(entry, path.extname(entry));
    if (name.toLowerCase() === baseName.toLowerCase()) {
      const coverPath = path.join(dir, entry);
      return { buffer: fs.readFileSync(coverPath), filePath: coverPath };
    }
  }
  return null;
}

function findAlbumStandardCover(dir: string, entries: string[]): SidecarCoverResult | null {
  for (const stdName of STANDARD_COVER_NAMES) {
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!SUPPORTED_COVER_EXTS.has(ext)) continue;
      const name = path.basename(entry, path.extname(entry));
      if (name.toLowerCase() === stdName) {
        const coverPath = path.join(dir, entry);
        return { buffer: fs.readFileSync(coverPath), filePath: coverPath };
      }
    }
  }
  return null;
}

/**
 * 探查音频同级目录下的伴随封面图片 (单曲专属封面 或 专辑共用 cover/folder/front)
 */
export function findSidecarCover(audioFilePath: string): SidecarCoverResult | null {
  try {
    const dir = path.dirname(audioFilePath);
    if (!fs.existsSync(dir)) return null;

    const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
    const entries = fs.readdirSync(dir);

    return findTrackSpecificCover(dir, baseName, entries) || findAlbumStandardCover(dir, entries);
  } catch (err) {
    logger.debug({ err, audioFilePath }, '[SidecarDetector] 探查同级外挂封面失败');
    return null;
  }
}

/**
 * 嗅探图片 Buffer 的实际 MIME 类型 (用于 HTTP 响应标头)
 */
export function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  return 'image/jpeg';
}
