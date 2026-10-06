import fs from 'node:fs';
import path from 'node:path';
import { CorruptionType, diagnoseAudioFile, healAudioFile, loadConfig } from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox, getTestAudioSlice } from '../test-helper.js';

describe('Integration Test: Inspection & Self-Healing Pipeline', () => {
  it('真实音频母带样本初检应当评定为健康无损状态', async () => {
    const diagnosis = await diagnoseAudioFile(TEST_AUDIO_PATH);
    expect(diagnosis.realFormat).toBe('flac');
    expect(diagnosis.corruptions.length).toBe(0);
    expect(diagnosis.canHeal).toBe(true);
  });

  it('针对注入脏广告头的损坏音频，流水线应准确诊断并自愈恢复至完全健康', async () => {
    const sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);

    try {
      const slice = getTestAudioSlice(512 * 1024);
      const dirtyHeader = Buffer.from('SPAM_SPONSOR_AD_HEAD_'.repeat(8));
      const corruptedPath = path.join(sandbox.rootDir, 'dirty_sample.flac');
      fs.writeFileSync(corruptedPath, Buffer.concat([dirtyHeader, slice]));

      // 1. 初检诊断
      const diagnosis = await diagnoseAudioFile(corruptedPath);
      expect(diagnosis.corruptions).toContain(CorruptionType.FRAME_ALIGNMENT_DIRTY);

      // 2. 流水线自愈执行
      const healingResult = await healAudioFile(corruptedPath, diagnosis);
      expect(healingResult.success).toBe(true);
      expect(healingResult.fixedCorruptions).toContain(CorruptionType.FRAME_ALIGNMENT_DIRTY);
      expect(fs.existsSync(healingResult.healedPath)).toBe(true);

      // 3. 复检自愈后的音频
      const reCheck = await diagnoseAudioFile(healingResult.healedPath);
      expect(reCheck.corruptions.length).toBe(0);
      expect(reCheck.realFormat).toBe('flac');
    } finally {
      sandbox.cleanup();
    }
  });
});
