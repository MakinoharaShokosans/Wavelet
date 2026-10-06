import fs from 'node:fs';
import path from 'node:path';
import {
  closeDatabase,
  extractWaveformPeaks,
  getDatabase,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Waveform Peak Extractor (整轨波形振幅峰值抽取与缓存)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeAll(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
  });

  afterAll(() => {
    closeDatabase();
    sandbox.cleanup();
  });

  it('应当对真实 FLAC 母带提取 128 个归一化振幅峰值并持久化缓存', async () => {
    expect(fs.existsSync(TEST_AUDIO_PATH)).toBe(true);

    const fileHash = 'hash_waveform_test_01';
    const duration = 224;

    const t0 = Date.now();
    const result = await extractWaveformPeaks(TEST_AUDIO_PATH, fileHash, duration, 128);
    const extractDuration = Date.now() - t0;

    // 1. 结构与维度断言
    expect(result.trackId).toBe(fileHash);
    expect(result.duration).toBe(duration);
    expect(Array.isArray(result.peaks)).toBe(true);
    expect(result.peaks.length).toBe(128);

    // 2. 峰值范围断言 [0.0 ~ 1.0]
    for (const peak of result.peaks) {
      expect(typeof peak).toBe('number');
      expect(peak).toBeGreaterThanOrEqual(0.0);
      expect(peak).toBeLessThanOrEqual(1.0);
    }

    // 真实音频非纯静音，必有高于 0.1 的动态峰值
    const maxPeak = Math.max(...result.peaks);
    expect(maxPeak).toBeGreaterThan(0.2);

    // 3. 验证本地磁盘缓存文件已建立
    const cacheFile = path.join(sandbox.config.storage.cacheDir, 'waveforms', `${fileHash}.json`);
    expect(fs.existsSync(cacheFile)).toBe(true);

    // 4. 第二次抽取应当毫秒级命中缓存
    const tCached = Date.now();
    const cachedResult = await extractWaveformPeaks(TEST_AUDIO_PATH, fileHash, duration, 128);
    const cacheReadDuration = Date.now() - tCached;

    expect(cachedResult.peaks).toEqual(result.peaks);
    expect(cacheReadDuration).toBeLessThan(50);
  });
});
