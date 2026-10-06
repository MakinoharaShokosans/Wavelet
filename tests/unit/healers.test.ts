import {
  alignFrameHeader,
  cleanTrailingGarbage,
  healFlacStreamInfo,
  healWavHeader,
  interpolateSampleGlitches,
} from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { getTestAudioSlice } from '../test-helper.js';

describe('Unit Test: Audio Corruption Healers', () => {
  it('应当成功识别并剥除头部注入的脏广告字节 (Frame Alignment Healer)', () => {
    const rawSlice = getTestAudioSlice(64 * 1024);
    // 注入 128 字节的前置垃圾广告文本
    const dirtyHeader = Buffer.from('ADVERTISEMENT_GARBAGE_PADDING_'.repeat(4));
    const corruptedBuffer = Buffer.concat([dirtyHeader, rawSlice]);

    const result = alignFrameHeader(corruptedBuffer);
    expect(result.needsAlignment).toBe(true);
    expect(result.cleanOffset).toBe(dirtyHeader.length);
    expect(result.healedBuffer).toBeDefined();

    // 修复后的前 4 字节必须是合法 FLAC 魔数
    const magic = result.healedBuffer?.subarray(0, 4).toString('ascii');
    expect(magic).toBe('fLaC');
  });

  it('原样健康的音频切片无需帧头对齐', () => {
    const rawSlice = getTestAudioSlice(64 * 1024);
    const result = alignFrameHeader(rawSlice);
    expect(result.needsAlignment).toBe(false);
    expect(result.cleanOffset).toBe(0);
  });

  it('应当成功检测并剥离文件末尾附加的垃圾填充 (Tail Cleaner)', () => {
    const rawSlice = getTestAudioSlice(64 * 1024);
    // 在尾部附加 2048 字节非标准垃圾填充
    const trailingJunk = Buffer.alloc(2048, 0xff);
    const corruptedBuffer = Buffer.concat([rawSlice, trailingJunk]);

    const result = cleanTrailingGarbage(corruptedBuffer);
    expect(result.needsTruncation).toBe(true);
    expect(result.truncatedBytes).toBe(2048);
    expect(result.healedBuffer.length).toBe(rawSlice.length);
  });

  it('应当成功重构未闭合或长度损坏的 WAV/RIFF 容器头 (WAV Header Healer)', () => {
    // 构造损坏的 44 字节 WAV 头 (RIFF 长度与 Data Chunk 大小被置为 0)
    const pcmDataSize = 8820;
    const corruptedWav = Buffer.alloc(44 + pcmDataSize);
    corruptedWav.write('RIFF', 0);
    corruptedWav.writeUInt32LE(0, 4); // 损坏的 RIFF 长度
    corruptedWav.write('WAVE', 8);
    corruptedWav.write('fmt ', 12);
    corruptedWav.writeUInt32LE(16, 16);
    corruptedWav.writeUInt16LE(1, 20); // PCM
    corruptedWav.writeUInt16LE(2, 22); // Stereo
    corruptedWav.writeUInt32LE(44100, 24); // 44.1kHz
    corruptedWav.writeUInt32LE(176400, 28);
    corruptedWav.writeUInt16LE(4, 32);
    corruptedWav.writeUInt16LE(16, 34); // 16bit
    corruptedWav.write('data', 36);
    corruptedWav.writeUInt32LE(0, 40); // 损坏的 Data 长度

    const result = healWavHeader(corruptedWav);
    expect(result.needsHeal).toBe(true);
    expect(result.recalculatedDataSize).toBe(pcmDataSize);
    expect(result.healedBuffer.readUInt32LE(40)).toBe(pcmDataSize);
  });

  it('应当利用埃尔米特样条插值平滑修复脉冲坏样点 (CRC Sample Interpolator)', () => {
    // 构造包含极端单点脉冲坏损 (Glitch) 的 16-bit PCM 缓冲
    const pcm = Buffer.alloc(100 * 2);
    for (let i = 0; i < 100; i++) {
      pcm.writeInt16LE(1000, i * 2);
    }
    // 注入极端爆音跳变
    pcm.writeInt16LE(30000, 50 * 2);

    const result = interpolateSampleGlitches(pcm, 16);
    expect(result.glitchesDetected).toBeGreaterThanOrEqual(1);
    // 修复后的样点应被插值拉平，远低于 30000
    const healedSample = result.healedBuffer.readInt16LE(50 * 2);
    expect(healedSample).toBeLessThan(10000);
  });

  it('对标准真实音频样本，STREAMINFO 检测应当正常判定无需自愈', () => {
    const rawSlice = getTestAudioSlice(64 * 1024);
    const result = healFlacStreamInfo(rawSlice);
    expect(result.needsHeal).toBe(false);
  });
});
