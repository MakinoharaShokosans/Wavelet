export interface StreamInfoHealResult {
  needsHeal: boolean;
  healedBuffer?: Buffer;
  estimatedSampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

const SAMPLE_RATE_MAP: Record<number, number> = {
  1: 88200,
  2: 176400,
  3: 192000,
  4: 8000,
  5: 16000,
  6: 22050,
  7: 24000,
  8: 32000,
  9: 44100,
  10: 48000,
  11: 96000,
};

const BIT_DEPTH_MAP: Record<number, number> = {
  1: 8,
  2: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
};

/**
 * FLAC STREAMINFO 逆向推导与头部重建器
 * 针对场景 2: FLAC 缺失 34 字节 STREAMINFO 引导块，但后续帧流完好的情况
 */
export function healFlacStreamInfo(buffer: Buffer): StreamInfoHealResult {
  // 1. 如果已有合法的 'fLaC' 且紧跟 STREAMINFO 头 (0x00 0x00 0x00 0x22 或 0x80 0x00 0x00 0x22)，无需修复
  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    const blockType = buffer[4] & 0x7f;
    const blockLen = (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];
    if (blockType === 0 && blockLen === 34) {
      return { needsHeal: false };
    }
  }

  // 2. 搜寻第一个帧同步字 0xFFF8 / 0xFFF9
  let frameOffset = -1;
  for (let i = 0; i < Math.min(buffer.length - 4, 131072); i++) {
    if (buffer[i] === 0xff && (buffer[i + 1] === 0xf8 || buffer[i + 1] === 0xf9)) {
      frameOffset = i;
      break;
    }
  }

  if (frameOffset === -1) {
    return { needsHeal: false };
  }

  // 3. 从帧头提取采样率、声道数与位深
  const frameByte2 = buffer[frameOffset + 2];
  const frameByte3 = buffer[frameOffset + 3];

  const srCode = (frameByte2 >> 4) & 0x0f;
  const sampleRate = SAMPLE_RATE_MAP[srCode] || 44100;

  const chanCode = (frameByte3 >> 4) & 0x0f;
  const channels = chanCode < 8 ? chanCode + 1 : 2;

  const bitCode = (frameByte3 >> 1) & 0x07;
  const bitDepth = BIT_DEPTH_MAP[bitCode] || 16;

  // 4. 合成标准 STREAMINFO (34 字节)
  const streamInfo = Buffer.alloc(34);
  // min / max block size (4096)
  streamInfo.writeUInt16BE(4096, 0);
  streamInfo.writeUInt16BE(4096, 2);
  // min / max frame size (留空为 0)
  streamInfo.writeUIntBE(0, 4, 3);
  streamInfo.writeUIntBE(0, 7, 3);

  // 采样率 (20 bits), 声道-1 (3 bits), 位深-1 (5 bits), 总样点数 (36 bits)
  // 打包高位
  const srHigh = (sampleRate >> 12) & 0xff;
  const srMid = (sampleRate >> 4) & 0xff;
  const srLow = (sampleRate & 0x0f) << 4;
  const chBits = (channels - 1) << 1;
  const bdHigh = (bitDepth - 1) >> 4;

  streamInfo[10] = srHigh;
  streamInfo[11] = srMid;
  streamInfo[12] = srLow | chBits | bdHigh;
  streamInfo[13] = ((bitDepth - 1) & 0x0f) << 4; // 总样点设为未知或 0

  // 5. 组合头部: 'fLaC' (4B) + BlockHeader (0x80 表示最后一元数据块, 0x000022 表示34字节) + STREAMINFO + 裸帧数据
  const flacHeader = Buffer.from([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 0x22]);
  const healedBuffer = Buffer.concat([flacHeader, streamInfo, buffer.subarray(frameOffset)]);

  return {
    needsHeal: true,
    healedBuffer,
    estimatedSampleRate: sampleRate,
    channels,
    bitDepth,
  };
}
