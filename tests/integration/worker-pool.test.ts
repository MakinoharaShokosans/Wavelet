import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, standardizeToFlac } from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Integration Test: Transcoder & Worker Pool Standardization', () => {
  it('应当成功将真实音频标准化归档至母库拓扑并提取 500x500 WebP 封面', async () => {
    const sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);

    try {
      let progressReported = false;
      const track = await standardizeToFlac(TEST_AUDIO_PATH, true, (_percent) => {
        progressReported = true;
      });

      expect(track).toBeDefined();
      expect(track.artist).toBe('鎖那');
      expect(track.title).toBe('彼女は旅に出る');
      expect(track.album).toBe('Hush a by little girl');
      expect(track.sampleRate).toBe(96000);
      expect(track.bitDepth).toBe(24);
      expect(track.hasEmbeddedCover).toBe(true);

      // 验证物理母库目录结构已按 {Artist}/{Album}/{Title}.flac 生成
      expect(fs.existsSync(track.filePath)).toBe(true);
      expect(track.filePath).toContain('鎖那');
      expect(track.filePath).toContain('Hush a by little girl');

      // 验证 WebP 封面缩略图已成功缓存
      const coverPath = path.join(
        sandbox.config.storage.cacheDir,
        'covers',
        `${track.fileHash}.webp`
      );
      expect(fs.existsSync(coverPath)).toBe(true);
      const coverStat = fs.statSync(coverPath);
      expect(coverStat.size).toBeGreaterThan(1000);
    } finally {
      sandbox.cleanup();
    }
  });
});
