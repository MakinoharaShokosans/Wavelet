export interface FrameAlignResult {
  needsAlignment: boolean;
  cleanOffset: number;
  healedBuffer?: Buffer;
}

/**
 * 帧头对齐与头部脏数据切除修复器
 * 针对场景 3: 头部被外部注入垃圾广告字节，导致标准解码器报错
 */
export function alignFrameHeader(fileBuffer: Buffer): FrameAlignResult {
  // 1. 如果开头就是合法的 Magic Number，无需修复
  const magic4 = fileBuffer.subarray(0, 4).toString('ascii');
  if (
    magic4 === 'fLaC' ||
    magic4 === 'RIFF' ||
    fileBuffer.subarray(0, 3).toString('ascii') === 'ID3'
  ) {
    return { needsAlignment: false, cleanOffset: 0 };
  }

  // 2. 滑动窗口寻找 'fLaC' 标记
  const flacIndex = fileBuffer.indexOf(Buffer.from('fLaC', 'ascii'));
  if (flacIndex > 0 && flacIndex < 65536) {
    return {
      needsAlignment: true,
      cleanOffset: flacIndex,
      healedBuffer: fileBuffer.subarray(flacIndex),
    };
  }

  // 3. 滑动窗口寻找 'RIFF' 标记
  const riffIndex = fileBuffer.indexOf(Buffer.from('RIFF', 'ascii'));
  if (riffIndex > 0 && riffIndex < 65536) {
    return {
      needsAlignment: true,
      cleanOffset: riffIndex,
      healedBuffer: fileBuffer.subarray(riffIndex),
    };
  }

  // 4. 滑动窗口寻找 FLAC 裸音频帧同步字 (0xFFF8 / 0xFFF9)
  for (let i = 0; i < Math.min(fileBuffer.length - 2, 65536); i++) {
    if (fileBuffer[i] === 0xff && (fileBuffer[i + 1] === 0xf8 || fileBuffer[i + 1] === 0xf9)) {
      return {
        needsAlignment: true,
        cleanOffset: i,
        healedBuffer: fileBuffer.subarray(i),
      };
    }
  }

  return { needsAlignment: false, cleanOffset: 0 };
}
