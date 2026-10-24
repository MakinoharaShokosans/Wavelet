import fs from 'node:fs';
import path from 'node:path';
import {
  TrackRepository,
  findProjectRoot,
  getDatabase,
  getDefaultConfig,
  loadConfig,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Unit Test: musics/ Directory Isolation & Portable Library', () => {
  it('应当能正确探测到包含 package.json 的工程根目录', () => {
    const root = findProjectRoot();
    expect(root).toBeDefined();
    expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
  });

  it('默认配置中的 libraryDir 应当指向工程根目录下的 musics 目录', () => {
    const root = findProjectRoot();
    const defaults = getDefaultConfig();
    expect(defaults.storage.libraryDir).toBe(path.join(root, 'musics'));
  });

  it('读取旧版配置或相对路径 ./musics 时，应当自动迁移并解析为工程根目录下的 musics', () => {
    const sandbox = createTestSandbox();
    const root = findProjectRoot();
    try {
      const legacyConfig = {
        version: 1,
        server: sandbox.config.server,
        storage: {
          ...sandbox.config.storage,
          libraryDir: '~/Music/Wavelet_Library',
        },
      };
      fs.writeFileSync(sandbox.configPath, JSON.stringify(legacyConfig, null, 2), 'utf-8');

      const config = loadConfig(sandbox.configPath);
      expect(config.storage.libraryDir).toBe(path.join(root, 'musics'));
    } finally {
      sandbox.cleanup();
    }
  });

  it('syncMusicsDirectory 应当将不在任何曲库根内的历史曲目标记为软缺失 (isMissing=true)', async () => {
    const sandbox = createTestSandbox();
    try {
      loadConfig(sandbox.configPath);
      runMigrations(getDatabase());
      const trackRepo = new TrackRepository();

      // 在 sandbox 外部构造伪曲目
      const outsideDir = path.join(sandbox.rootDir, 'outside');
      fs.mkdirSync(outsideDir, { recursive: true });
      const outsideFile = path.join(outsideDir, 'outside.flac');
      fs.writeFileSync(outsideFile, 'dummy-flac-data');

      trackRepo.insert({
        id: 'trk_outside_001',
        title: 'Outside Song',
        artist: 'Unknown',
        album: 'Unknown',
        albumArtist: 'Unknown',
        duration: 120,
        bitrate: 1411,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        filePath: outsideFile,
        fileSize: 100,
        fileHash: 'outsidehash00112233',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'healthy',
        playCount: 0,
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(trackRepo.findById('trk_outside_001')).toBeDefined();

      // 在独立的专用 musics 目录中执行 sync
      const dedicatedMusicsDir = path.join(sandbox.rootDir, 'isolated_musics');
      fs.mkdirSync(dedicatedMusicsDir, { recursive: true });

      const syncRes = await syncMusicsDirectory(dedicatedMusicsDir);
      expect(syncRes.scanned).toBe(0);
      expect(syncRes.imported).toBe(0);

      // T4 (ISSUE-11): 不在任何曲库根内的历史曲目不再自动物理/数据库硬删除，而是安全标记为软缺失 (is_missing=1)
      const outsideTrack = trackRepo.findById('trk_outside_001');
      expect(outsideTrack).not.toBeNull();
      expect(outsideTrack?.isMissing).toBe(true);
    } finally {
      sandbox.cleanup();
    }
  });
});
