import fs from 'node:fs';
import path from 'node:path';
import {
  BackupManager,
  PlaylistRepository,
  TrackRepository,
  applyFilenameDerivedFields,
  closeDatabase,
  createServer,
  getDatabase,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import type { Track } from '@wavelet/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('T2 (ISSUE-14): Manual Metadata Edit Field Locks Unit Tests', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository(getDatabase());
    app = await createServer();

    // 获取会话 Token 用于请求受保护的网关路由
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
    });
    token = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  describe('applyFilenameDerivedFields 纯函数单元测试', () => {
    const baseTrack: Track = {
      id: 'trk_dummy',
      title: 'Original Title',
      artist: 'Original Artist',
      album: 'Album',
      duration: 100,
      bitrate: 1411,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/Artist - New Title.flac',
      fileSize: 1000,
      fileHash: 'dummyhash',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('未锁定时：应当正常派生并更新标题与歌手', () => {
      const res = applyFilenameDerivedFields(
        { ...baseTrack, titleLocked: false, artistLocked: false },
        { title: 'New Title', artist: 'New Artist' },
        'smart'
      );
      expect(res.title).toBe('New Title');
      expect(res.artist).toBe('New Artist');
    });

    it('标题锁定 (titleLocked=true)：应当保留原标题，仅更新歌手', () => {
      const res = applyFilenameDerivedFields(
        { ...baseTrack, titleLocked: true, artistLocked: false },
        { title: 'New Title', artist: 'New Artist' },
        'smart'
      );
      expect(res.title).toBe('Original Title');
      expect(res.artist).toBe('New Artist');
    });

    it('艺术家锁定 (artistLocked=true)：应当保留原艺术家，仅更新标题', () => {
      const res = applyFilenameDerivedFields(
        { ...baseTrack, titleLocked: false, artistLocked: true },
        { title: 'New Title', artist: 'New Artist' },
        'smart'
      );
      expect(res.title).toBe('New Title');
      expect(res.artist).toBe('Original Artist');
    });

    it('双重锁定：标题与艺术家均保持用户编辑值，不被覆盖', () => {
      const res = applyFilenameDerivedFields(
        { ...baseTrack, titleLocked: true, artistLocked: true },
        { title: 'New Title', artist: 'New Artist' },
        'smart'
      );
      expect(res.title).toBe('Original Title');
      expect(res.artist).toBe('Original Artist');
    });
  });

  describe('网关 PATCH /api/tracks/:id 字段锁行为与同步防御集成测试', () => {
    let testAudioFile: string;
    let testTrackId: string;

    beforeAll(async () => {
      testAudioFile = path.join(
        sandbox.config.storage.libraryDir,
        '折戸伸治 - 鳥の詩 (AIR OP).flac'
      );
      fs.writeFileSync(
        testAudioFile,
        Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('lock_test_seed_1')])
      );

      // 初次同步入库
      const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(syncRes.imported).toBeGreaterThanOrEqual(1);

      const track = trackRepo.findByPath(testAudioFile);
      expect(track).not.toBeNull();
      testTrackId = track!.id;
      expect(track?.title).toBe('鳥の詩 (AIR OP)');
      expect(track?.artist).toBe('折戸伸治');
      expect(track?.titleLocked).toBe(false);
      expect(track?.artistLocked).toBe(false);
    });

    it('提交与当前相同的值：不触发锁定', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tracks/${testTrackId}`,
        headers: { 'x-wavelet-session': token },
        payload: {
          title: '鳥の詩 (AIR OP)',
        },
      });

      expect(res.statusCode).toBe(200);
      const updated = trackRepo.findById(testTrackId);
      expect(updated?.titleLocked).toBe(false);
    });

    it('用户手动修改标题：PATCH 请求成功，自动标记 titleLocked = true', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/tracks/${testTrackId}`,
        headers: { 'x-wavelet-session': token },
        payload: {
          title: '【用户手改】A Thousand Birds',
        },
      });

      expect(res.statusCode).toBe(200);
      const updated = trackRepo.findById(testTrackId);
      expect(updated?.title).toBe('【用户手改】A Thousand Birds');
      expect(updated?.titleLocked).toBe(true);
      expect(updated?.artistLocked).toBe(false);
    });

    it('启动与增量同步：被锁定的标题不会被物理文件名覆盖', async () => {
      // 再次执行启动增量同步
      const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(syncRes.scanned).toBeGreaterThanOrEqual(1);

      const trackAfterSync = trackRepo.findById(testTrackId);
      expect(trackAfterSync?.title).toBe('【用户手改】A Thousand Birds');
      expect(trackAfterSync?.titleLocked).toBe(true);
      expect(trackAfterSync?.artist).toBe('折戸伸治');
    });

    it('重命名物理文件：迁移寻回时同样严格保护被锁定的字段', async () => {
      const newAudioFile = path.join(
        sandbox.config.storage.libraryDir,
        'Lia - Tori no Uta (Remastered).flac'
      );
      fs.renameSync(testAudioFile, newAudioFile);

      // 执行同步寻回迁移
      const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(syncRes.migrated).toBe(1);

      const migratedTrack = trackRepo.findById(testTrackId);
      expect(migratedTrack?.filePath).toBe(newAudioFile);
      // 标题被锁，保持原手改值
      expect(migratedTrack?.title).toBe('【用户手改】A Thousand Birds');
      expect(migratedTrack?.titleLocked).toBe(true);
      // 歌手未锁，自动对齐新文件名中的 Lia
      expect(migratedTrack?.artist).toBe('Lia');
      expect(migratedTrack?.artistLocked).toBe(false);

      testAudioFile = newAudioFile;
    });

    it('POST /api/tracks/:id/reset-metadata：重置标题锁定并恢复为文件名派生歌名', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/tracks/${testTrackId}/reset-metadata`,
        headers: { 'x-wavelet-session': token },
        payload: {
          fields: ['title'],
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.success).toBe(true);
      expect(data.track.titleLocked).toBe(false);
      // 文件名当前为 'Lia - Tori no Uta (Remastered).flac'
      expect(data.track.title).toBe('Tori no Uta (Remastered)');

      const dbTrack = trackRepo.findById(testTrackId);
      expect(dbTrack?.titleLocked).toBe(false);
      expect(dbTrack?.title).toBe('Tori no Uta (Remastered)');
    });

    it('备份导出与导入往返测试：锁状态 (title_locked/artist_locked) 完整保留', async () => {
      // 先手动锁定 artist
      await app.inject({
        method: 'PATCH',
        url: `/api/tracks/${testTrackId}`,
        headers: { 'x-wavelet-session': token },
        payload: {
          artist: 'Key Sounds Label (Locked)',
        },
      });

      const beforeBackup = trackRepo.findById(testTrackId);
      expect(beforeBackup?.artistLocked).toBe(true);

      const backupManager = new BackupManager();
      const backupPath = path.join(sandbox.rootDir, 'backup_test.zip');
      await backupManager.exportBackup({ targetZipPath: backupPath, includeAudio: false });
      expect(fs.existsSync(backupPath)).toBe(true);

      // 人为解除锁定，测试还原后能精准复原锁定状态与值
      trackRepo.update(testTrackId, { artistLocked: false, artist: 'Temporary Reset' });
      expect(trackRepo.findById(testTrackId)?.artistLocked).toBe(false);

      // 模拟还原备份
      await backupManager.importBackup(backupPath);

      const afterRestore = trackRepo.findById(testTrackId);
      expect(afterRestore?.artistLocked).toBe(true);
      expect(afterRestore?.artist).toBe('Key Sounds Label (Locked)');
    });
  });
});
