export interface TailCleanResult {
  needsTruncation: boolean;
  truncatedBytes: number;
  healedBuffer: Buffer;
}

/**
 * 尾部非标准截断与广告填充切除器
 * 针对场景 5: 下载器在文件末尾注入的广告文本、未闭合垃圾数据
 */
export function cleanTrailingGarbage(fileBuffer: Buffer): TailCleanResult {
  const len = fileBuffer.length;
  if (len < 512) {
    return { needsTruncation: false, truncatedBytes: 0, healedBuffer: fileBuffer };
  }

  // 1. 扫描末尾是否存在异常的纯文本广告或全 0 / 全 FF 填充
  let cleanEnd = len;

  // 检查最后 256 字节是否包含非音频 ASCII 字符串 (如 http://, www., .com)
  const tailSlice = fileBuffer.subarray(len - 256).toString('binary');
  const adKeywords = ['http://', 'https://', 'www.', '.com', '.cn', 'downloaded'];

  for (const kw of adKeywords) {
    const idx = tailSlice.indexOf(kw);
    if (idx !== -1) {
      // 定位到广告文本前
      cleanEnd = Math.min(cleanEnd, len - 256 + idx);
    }
  }

  // 检查末尾多余的全 0 或全 0xFF 垃圾填充 (超过 128 个连续字节)
  let paddingCount = 0;
  for (let i = len - 1; i >= Math.max(0, len - 4096); i--) {
    if (fileBuffer[i] === 0x00 || fileBuffer[i] === 0xff) {
      paddingCount++;
    } else {
      break;
    }
  }

  if (paddingCount > 128) {
    cleanEnd = Math.min(cleanEnd, len - paddingCount);
  }

  if (cleanEnd < len) {
    return {
      needsTruncation: true,
      truncatedBytes: len - cleanEnd,
      healedBuffer: fileBuffer.subarray(0, cleanEnd),
    };
  }

  return { needsTruncation: false, truncatedBytes: 0, healedBuffer: fileBuffer };
}
