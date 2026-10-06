import fs from 'node:fs';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { inspectionLogger, logger } from '../bootstrap/logger.js';

export interface SniffResult {
  detectedExt: string;
  mime: string;
  isAudio: boolean;
  magicMatched: boolean;
}

/**
 * 二进制 Magic Bytes 魔数嗅探器
 * 绕过文件后缀欺骗，直接探测真实音频容器魔数
 */
export async function sniffAudioFormat(filePath: string): Promise<SniffResult> {
  const fileExt = path.extname(filePath).toLowerCase().replace('.', '');

  try {
    const fileType = await fileTypeFromFile(filePath);
    if (fileType) {
      const isAudio =
        fileType.mime.startsWith('audio/') ||
        fileType.mime === 'video/mp4' || // 部分 m4a 被识别为 video/mp4 容器
        fileType.mime === 'video/ogg' ||
        fileType.ext === 'flac' ||
        fileType.ext === 'mp3' ||
        fileType.ext === 'wav' ||
        fileType.ext === 'ogg' ||
        fileType.ext === 'm4a';

      return {
        detectedExt: fileType.ext,
        mime: fileType.mime,
        isAudio,
        magicMatched: true,
      };
    }
  } catch (err) {
    logger.debug(
      { filePath, err },
      '[Sniffer] fileTypeFromFile 解析发生异常，进入底层二进制回退探测'
    );
  }

  // 底层逐字节魔数回退探测 (针对头部存在轻微脏填充或标准库未覆盖的场景)
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(32);
  fs.readSync(fd, buffer, 0, 32, 0);
  fs.closeSync(fd);

  // 1. FLAC: 'fLaC' (0x66 0x4C 0x61 0x43)
  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    return { detectedExt: 'flac', mime: 'audio/flac', isAudio: true, magicMatched: true };
  }

  // 2. WAV: 'RIFF' .... 'WAVE'
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { detectedExt: 'wav', mime: 'audio/wav', isAudio: true, magicMatched: true };
  }

  // 3. MP3: ID3 标签头 (0x49 0x44 0x33) 或 MPEG 同步字 (0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xF2)
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    return { detectedExt: 'mp3', mime: 'audio/mpeg', isAudio: true, magicMatched: true };
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return { detectedExt: 'mp3', mime: 'audio/mpeg', isAudio: true, magicMatched: true };
  }

  // 4. OGG: 'OggS' (0x4F 0x67 0x67 0x53)
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return { detectedExt: 'ogg', mime: 'audio/ogg', isAudio: true, magicMatched: true };
  }

  // 无法通过前 32 字节识别，标记未知
  inspectionLogger.warn(
    { filePath, declaredExt: fileExt },
    '[Sniffer] 无法通过前 32 字节魔数判定音频容器'
  );

  return {
    detectedExt: fileExt || 'unknown',
    mime: 'application/octet-stream',
    isAudio: false,
    magicMatched: false,
  };
}
