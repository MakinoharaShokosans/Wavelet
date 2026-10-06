import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@wavelet/backend';
import type { WaveletConfig } from '@wavelet/shared';

export const TEST_AUDIO_PATH = '/home/Skualeilu/Projects/Wavelet/temp/鎖那 - 彼女は旅に出る.flac';

export interface TestSandbox {
  rootDir: string;
  config: WaveletConfig;
  configPath: string;
  cleanup: () => void;
}

/**
 * 创建完全隔离的临时测试沙箱环境
 * 保证测试零污染 ~/.wavelet 或真实物理母库
 */
export function createTestSandbox(): TestSandbox {
  const rootDir = path.join(
    os.tmpdir(),
    `wavelet_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(rootDir, { recursive: true });

  const dataDir = path.join(rootDir, '.wavelet');
  const libraryDir = path.join(rootDir, 'Music');
  const quarantineDir = path.join(dataDir, 'quarantine');
  const cacheDir = path.join(dataDir, 'cache');
  const logsDir = path.join(dataDir, 'logs');
  const databaseFile = path.join(dataDir, 'wavelet.db');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.mkdirSync(quarantineDir, { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'covers'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'temp'), { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const config: WaveletConfig = {
    version: 1,
    server: {
      host: '127.0.0.1',
      port: 23334 + Math.floor(Math.random() * 5000), // 随机测试端口避免碰撞
      corsOrigins: ['*'],
    },
    storage: {
      dataDir,
      libraryDir,
      quarantineDir,
      cacheDir,
      logsDir,
      databaseFile,
    },
    audio: {
      outputMode: 'web',
      outputDevice: 'default',
      bufferSize: 4096,
      defaultVolume: 0.8,
    },
    transcoder: {
      maxConcurrency: 2,
      compressionLevel: 5,
      customFfmpegPath: '',
    },
    logging: {
      level: 'debug',
      maxFileSizeMB: 10,
      maxFiles: 3,
      consolePretty: false,
    },
  };

  const configPath = path.join(dataDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  const cleanup = () => {
    try {
      closeDatabase();
      if (fs.existsSync(rootDir)) {
        fs.rmSync(rootDir, { recursive: true, force: true });
      }
    } catch {
      // 忽略清理异常
    }
  };

  return { rootDir, config, configPath, cleanup };
}

/**
 * 基于真实音频样本切片构造测试用例
 */
export function getTestAudioSlice(maxBytes = 2 * 1024 * 1024): Buffer {
  const fd = fs.openSync(TEST_AUDIO_PATH, 'r');
  const buffer = Buffer.alloc(maxBytes);
  const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
  fs.closeSync(fd);
  return buffer.subarray(0, bytesRead);
}
