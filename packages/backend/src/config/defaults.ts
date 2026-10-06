import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WaveletConfig } from '@wavelet/shared';

/**
 * 探测定位工程根目录 (包含 pnpm-workspace.yaml 或 wavelet.sh)
 */
export function findProjectRoot(): string {
  if (process.env.WAVELET_PROJECT_ROOT) {
    return path.resolve(process.env.WAVELET_PROJECT_ROOT);
  }
  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(current, 'wavelet.sh'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

/**
 * 展开以 ~ 开头的路径为真实用户主目录绝对路径
 */
export function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
}

/**
 * 生成默认配置对象
 * 预留 1 个 CPU 核心给主线程与音频播放，其余核用于转码 Worker
 */
export function getDefaultConfig(): WaveletConfig {
  const cpus = os.cpus().length;
  const optimalConcurrency = Math.max(1, cpus - 1);
  const root = findProjectRoot();

  return {
    version: 1,
    server: {
      host: '127.0.0.1',
      port: 23333,
      corsOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    },
    storage: {
      dataDir: resolveHome('~/.wavelet'),
      libraryDir: path.resolve(root, 'musics'),
      quarantineDir: resolveHome('~/.wavelet/quarantine'),
      cacheDir: resolveHome('~/.wavelet/cache'),
      logsDir: resolveHome('~/.wavelet/logs'),
      databaseFile: resolveHome('~/.wavelet/wavelet.db'),
    },
    audio: {
      outputMode: 'web',
      outputDevice: 'default',
      bufferSize: 4096,
      defaultVolume: 0.8,
    },
    transcoder: {
      maxConcurrency: optimalConcurrency,
      compressionLevel: 5,
      customFfmpegPath: '',
    },
    logging: {
      level: 'info',
      maxFileSizeMB: 10,
      maxFiles: 3,
      consolePretty: true,
    },
  };
}
