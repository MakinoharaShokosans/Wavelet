export interface WavHeaderHealResult {
  needsHeal: boolean;
  healedBuffer: Buffer;
  recalculatedDataSize?: number;
}

/**
 * WAV / PCM 容器头自愈重构器
 * 针对场景 6: 录音未正常闭合，RIFF 或 data chunk size 为 0xFFFFFFFF 或 0
 */
export function healWavHeader(buffer: Buffer): WavHeaderHealResult {
  if (buffer.length < 44) {
    return { needsHeal: false, healedBuffer: buffer };
  }

  // 1. 检查是否为 RIFF WAVE 容器
  const riff = buffer.subarray(0, 4).toString('ascii');
  const wave = buffer.subarray(8, 12).toString('ascii');
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return { needsHeal: false, healedBuffer: buffer };
  }

  const outBuffer = Buffer.from(buffer);
  let modified = false;

  // 2. 检查 RIFF Chunk Size (字节 4..7)
  const currentRiffSize = outBuffer.readUInt32LE(4);
  const expectedRiffSize = outBuffer.length - 8;
  if (
    currentRiffSize === 0 ||
    currentRiffSize === 0xffffffff ||
    currentRiffSize !== expectedRiffSize
  ) {
    outBuffer.writeUInt32LE(expectedRiffSize, 4);
    modified = true;
  }

  // 3. 寻找 'data' chunk
  const dataOffset = outBuffer.indexOf(Buffer.from('data', 'ascii'));
  if (dataOffset !== -1 && dataOffset + 8 <= outBuffer.length) {
    const currentDataSize = outBuffer.readUInt32LE(dataOffset + 4);
    const expectedDataSize = outBuffer.length - (dataOffset + 8);

    if (
      currentDataSize === 0 ||
      currentDataSize === 0xffffffff ||
      currentDataSize !== expectedDataSize
    ) {
      outBuffer.writeUInt32LE(expectedDataSize, dataOffset + 4);
      modified = true;
      return {
        needsHeal: true,
        healedBuffer: outBuffer,
        recalculatedDataSize: expectedDataSize,
      };
    }
  }

  return { needsHeal: modified, healedBuffer: outBuffer };
}
