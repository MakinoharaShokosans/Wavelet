import fs from 'node:fs';
import path from 'node:path';
import {
  TrackRepository,
  backfillRepairedCache,
  getDatabase,
  healedCache,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
} from '@wavelet/backend';
import type { Track } from '@wavelet/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Healed Cache (自愈缓存模块化与生命周期一致性)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;

  beforeAll(() => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    const db = getDatabase();
    runMigrations(db);
    trackRepo = new TrackRepository(db);
  });

  afterAll(() => {
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  describe('1. 确定性物理路径与原子持久化 (persist & findCacheFile)', () => {
    it('persist 应当将临时自愈音频原子移动至 cache/healed 确定性路径并清理临时文件', () => {
      const trackId = 'trk_healed_test_01';
      const tempFile = path.join(sandbox.config.storage.cacheDir, 'temp', 'temp_repair_01.flac');
      fs.writeFileSync(tempFile, 'healed-audio-content');

      const savedPath = healedCache.persist(trackId, tempFile, '.flac');
      expect(savedPath).toBe(
        path.join(sandbox.config.storage.cacheDir, 'healed', `${trackId}.flac`)
      );
      expect(fs.existsSync(savedPath)).toBe(true);
      expect(fs.readFileSync(savedPath, 'utf-8')).toBe('healed-audio-content');
      // 原临时文件已被清理
      expect(fs.existsSync(tempFile)).toBe(false);

      // findCacheFile 能够直接定位
      const found = healedCache.findCacheFile(trackId);
      expect(found).toBe(savedPath);
    });

    it('findCacheFile 对未缓存曲目应当安全返回 null', () => {
      expect(healedCache.findCacheFile('non_existent_track')).toBeNull();
    });
  });

  describe('2. 缓存失效与清理 (invalidate)', () => {
    it('invalidate 应当安全删除物理缓存文件', () => {
      const trackId = 'trk_healed_test_02';
      const tempFile = path.join(sandbox.config.storage.cacheDir, 'temp', 'temp_repair_02.flac');
      fs.writeFileSync(tempFile, 'temporary-audio');
      const savedPath = healedCache.persist(trackId, tempFile, '.flac');
      expect(fs.existsSync(savedPath)).toBe(true);

      healedCache.invalidate(trackId);
      expect(fs.existsSync(savedPath)).toBe(false);
      expect(healedCache.findCacheFile(trackId)).toBeNull();
    });
  });

  describe('3. 直通播放路径解析与外部修改自动失效 (resolvePlayablePath)', () => {
    it('健康曲目 (healthy) 始终返回原物理文件路径', () => {
      const track: Track = {
        id: 'trk_healthy_01',
        title: 'Healthy Track',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        filePath: '/music/healthy.flac',
        fileSize: 1000,
        fileHash: 'hash_healthy',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'healthy',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(healedCache.resolvePlayablePath(track)).toBe('/music/healthy.flac');
    });

    it('已修复曲目 (repaired) 存在未过期缓存时返回自愈缓存物理路径', () => {
      const trackId = 'trk_repaired_01';
      const rawAudioPath = path.join(sandbox.config.storage.libraryDir, 'raw_track.flac');
      fs.writeFileSync(rawAudioPath, 'raw-audio');

      // 制造一个自愈缓存
      const tempFile = path.join(sandbox.config.storage.cacheDir, 'temp', 'temp_repaired_01.flac');
      fs.writeFileSync(tempFile, 'healed-audio');
      const cachedPath = healedCache.persist(trackId, tempFile, '.flac');

      const track: Track = {
        id: trackId,
        title: 'Repaired Track',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        filePath: rawAudioPath,
        fileSize: 1000,
        fileHash: 'hash_repaired',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'repaired',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(healedCache.resolvePlayablePath(track)).toBe(cachedPath);
    });

    it('当母盘原始文件 mtime 晚于缓存时间 (外部修改) 时，自愈缓存应自动失效并回退原文件', async () => {
      const trackId = 'trk_repaired_modified_01';
      const rawAudioPath = path.join(sandbox.config.storage.libraryDir, 'modified_track.flac');
      fs.writeFileSync(rawAudioPath, 'initial-raw-content');

      // 建立自愈缓存
      const tempFile = path.join(sandbox.config.storage.cacheDir, 'temp', 'temp_mod_01.flac');
      fs.writeFileSync(tempFile, 'healed-content');
      const cachedPath = healedCache.persist(trackId, tempFile, '.flac');

      // 等待 10ms 并修改原文件，使原文件 mtime 明显大于缓存
      await new Promise((r) => setTimeout(r, 20));
      fs.appendFileSync(rawAudioPath, '-updated-by-user');

      const track: Track = {
        id: trackId,
        title: 'Repaired But Modified',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        bitrate: 320000,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        filePath: rawAudioPath,
        fileSize: 1000,
        fileHash: 'hash_repaired_mod',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'repaired',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 此时解析播放路径应当自动丢弃过期自愈缓存，回退原文件
      const resolved = healedCache.resolvePlayablePath(track);
      expect(resolved).toBe(rawAudioPath);
      // 确认旧缓存已被自动物理删除
      expect(fs.existsSync(cachedPath)).toBe(false);
    });
  });

  describe('4. 历史自愈曲目缺失缓存轻量回填 (backfillRepairedCache)', () => {
    it('对数据库中标记为 repaired 但缺少物理缓存的曲目进行自愈回填修复', async () => {
      const trackId = 'trk_backfill_01';
      const sampleAudioPath = path.join(sandbox.config.storage.libraryDir, 'backfill_sample.flac');
      // 构造一个带有头部脏字节的破损音频 (触发 FrameAlignHealer 帧对齐自愈)
      const validAudio = fs.readFileSync(TEST_AUDIO_PATH);
      const corruptAudio = Buffer.concat([Buffer.from('DIRTY_HEADER_123'), validAudio]);
      fs.writeFileSync(sampleAudioPath, corruptAudio);

      trackRepo.insert({
        id: trackId,
        title: '待回填自愈曲目',
        artist: 'Artist',
        album: 'Album',
        duration: 224,
        bitrate: 1000000,
        sampleRate: 96000,
        bitDepth: 24,
        channels: 2,
        filePath: sampleAudioPath,
        fileSize: corruptAudio.length,
        fileHash: 'hash_backfill_corrupt_01',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'repaired',
        repairDetails: '尾部冗余脏数据清洗',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 此时物理缓存不存在
      expect(healedCache.findCacheFile(trackId)).toBeNull();

      // 执行回填
      const backfilledCount = await backfillRepairedCache(trackRepo, 20);
      expect(backfilledCount).toBe(1);

      // 验证物理缓存已成功生成落盘
      const cacheFile = healedCache.findCacheFile(trackId);
      expect(cacheFile).not.toBeNull();
      expect(fs.existsSync(cacheFile!)).toBe(true);
    });
  });
});
