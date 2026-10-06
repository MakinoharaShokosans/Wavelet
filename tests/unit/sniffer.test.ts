import fs from 'node:fs';
import path from 'node:path';
import { sniffAudioFormat } from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Magic Bytes Sniffer & Format Detection', () => {
  it('应当对真实音频样本准确识别为 FLAC 格式与 MIME 类型', async () => {
    const sniff = await sniffAudioFormat(TEST_AUDIO_PATH);
    expect(sniff).not.toBeNull();
    expect(sniff?.detectedExt).toBe('flac');
    expect(sniff?.mime).toBe('audio/x-flac');
    expect(sniff?.isAudio).toBe(true);
    expect(sniff?.magicMatched).toBe(true);
  });

  it('应当对伪装扩展名的真实音频文件成功纠偏 (Fake Extension)', async () => {
    const sandbox = createTestSandbox();
    try {
      // 将真实 FLAC 复制并命名为伪装的 .mp3 文件
      const fakeExtPath = path.join(sandbox.rootDir, 'fake_disguised.mp3');
      fs.copyFileSync(TEST_AUDIO_PATH, fakeExtPath);

      const sniff = await sniffAudioFormat(fakeExtPath);
      expect(sniff).not.toBeNull();
      // 魔数检测应精准纠正其真实格式为 flac，而不是被 .mp3 误导
      expect(sniff?.detectedExt).toBe('flac');
      expect(sniff?.isAudio).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  });

  it('对非音频的纯文本或二进制文件应当阻断并标记非音频', async () => {
    const sandbox = createTestSandbox();
    try {
      const textFilePath = path.join(sandbox.rootDir, 'dummy.txt');
      fs.writeFileSync(textFilePath, 'This is just a plain text file, not music.', 'utf-8');

      const sniff = await sniffAudioFormat(textFilePath);
      expect(sniff?.isAudio).toBe(false);
    } finally {
      sandbox.cleanup();
    }
  });
});
