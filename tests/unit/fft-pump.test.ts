import { FftPump } from '@wavelet/backend';
import { describe, expect, it } from 'vitest';

describe('Unit Test: FftPump & Log-Spectrum Downsampling', () => {
  it('静音 PCM 数据输入时，64 维频域能量数组输出全为 0', () => {
    const pump = new FftPump(1024, 64);
    // 构造 1024 样点的 16-bit 全零 PCM 缓冲 (2048 字节)
    const silentBuffer = Buffer.alloc(2048, 0);

    const spectrum = pump.processPcmChunk(silentBuffer);
    expect(spectrum.length).toBe(64);
    for (const bin of spectrum) {
      expect(bin).toBe(0);
    }
  });

  it('针对标准 1kHz 单频正弦波输入，中频段应当激发出能量峰值', () => {
    const pump = new FftPump(1024, 64);
    const sampleRate = 44100;
    const frequency = 1000; // 1kHz 正弦波
    const samples = 1024;
    const buffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const val = Math.sin(2 * Math.PI * frequency * t);
      const sample16 = Math.round(val * 32000);
      buffer.writeInt16LE(sample16, i * 2);
    }

    const spectrum = pump.processPcmChunk(buffer);
    expect(spectrum.length).toBe(64);

    // 验证 1kHz 对应的频段 (bin 1~5) 能量显著高于超高频
    const peakEnergy = Math.max(...spectrum.slice(1, 5));
    const highEnergy = Math.max(...spectrum.slice(50, 64));

    expect(peakEnergy).toBeGreaterThan(0.5);
    expect(peakEnergy).toBeGreaterThan(highEnergy);
  });

  it('无论输入多大动态范围，64 个频段输出必须严格归一化在 [0.0, 1.0] 区间', () => {
    const pump = new FftPump(1024, 64);
    // 构造极端最大振幅方波冲击
    const fullScaleSquare = Buffer.alloc(2048);
    for (let i = 0; i < 1024; i++) {
      const val = i % 2 === 0 ? 32767 : -32768;
      fullScaleSquare.writeInt16LE(val, i * 2);
    }

    const spectrum = pump.processPcmChunk(fullScaleSquare);
    for (const bin of spectrum) {
      expect(bin).toBeGreaterThanOrEqual(0.0);
      expect(bin).toBeLessThanOrEqual(1.0);
    }
  });
});
