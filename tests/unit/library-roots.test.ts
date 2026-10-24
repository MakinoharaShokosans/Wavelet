import fs from 'node:fs';
import path from 'node:path';
import {
  LibraryRootRepository,
  TrackRepository,
  createServer,
  getDatabase,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit & Integration Test: Library Roots (多曲库根管理与库外曲目保活)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let rootRepo: LibraryRootRepository;
  let trackRepo: TrackRepository;
  let app: FastifyInstance;
  let sessionToken: string;
  let externalMusicDir: string;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    const db = getDatabase();
    runMigrations(db);

    rootRepo = new LibraryRootRepository(db);
    trackRepo = new TrackRepository(db);

    // 创建外部音乐目录
    externalMusicDir = path.join(sandbox.rootDir, 'ExternalMusic');
    fs.mkdirSync(externalMusicDir, { recursive: true });

    // 复制测试音频到主曲库和外部曲库 (保证具有不同 SHA-256 哈希以符合 tracks.file_hash 唯一约束)
    const audioData = fs.readFileSync(TEST_AUDIO_PATH);
    fs.writeFileSync(path.join(sandbox.config.storage.libraryDir, 'track_primary.flac'), audioData);
    const extAudioData = Buffer.concat([audioData, Buffer.from([0x00, 0x00])]);
    fs.writeFileSync(path.join(externalMusicDir, 'track_external.flac'), extAudioData);

    app = await createServer();
    const authRes = await app.inject({ method: 'GET', url: '/api/auth/token' });
    sessionToken = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  describe('1. LibraryRootRepository 基础能力', () => {
    it('登记主曲库与外部曲库根目录', () => {
      rootRepo.upsertRoot(sandbox.config.storage.libraryDir, 'primary');
      rootRepo.upsertRoot(externalMusicDir, 'imported');

      const allRoots = rootRepo.getAllRoots();
      expect(allRoots.length).toBe(2);

      const primary = rootRepo.getRoot(sandbox.config.storage.libraryDir);
      expect(primary).not.toBeNull();
      expect(primary?.kind).toBe('primary');

      const imported = rootRepo.getRoot(externalMusicDir);
      expect(imported).not.toBeNull();
      expect(imported?.kind).toBe('imported');

      const paths = rootRepo.getAllRootPaths();
      expect(paths).toContain(sandbox.config.storage.libraryDir);
      expect(paths).toContain(externalMusicDir);
    });
  });

  describe('2. 多曲库根同步与库外曲目软失联保活 (ISSUE-11 核心防卫)', () => {
    it('同步主曲库时，属于外部曲库根的曲目绝不被删除', async () => {
      // 1. 同步外部曲库录入 track_external
      const extSync = await syncMusicsDirectory(externalMusicDir);
      expect(extSync.imported).toBe(1);

      // 2. 验证外部曲目已入库
      const allTracksBefore = trackRepo.getAllTracks(true);
      const extTrack = allTracksBefore.find((t) => t.filePath.includes('track_external.flac'));
      expect(extTrack).toBeDefined();
      expect(extTrack?.isMissing).toBeFalsy();

      // 3. 此时执行主曲库 syncMusicsDirectory(primaryLibraryDir)
      const primarySync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(primarySync.imported).toBe(1);

      // 4. 关键断言：外部曲目的记录依然存在且保持健康 (未被 partitionDbTracks 误删)
      const allTracksAfter = trackRepo.getAllTracks(true);
      const extTrackAfter = allTracksAfter.find((t) => t.filePath.includes('track_external.flac'));
      expect(extTrackAfter).toBeDefined();
      expect(extTrackAfter?.isMissing).toBeFalsy();
    });

    it('所有已知曲库根之外的野孤曲目，只标记为软失效 (is_missing=1)，绝不物理删除', async () => {
      // 插入一条不在任何已登记根目录下的曲目
      const orphanPath = path.join(sandbox.rootDir, 'OrphanMusic', 'orphan.flac');
      fs.mkdirSync(path.dirname(orphanPath), { recursive: true });
      fs.copyFileSync(TEST_AUDIO_PATH, orphanPath);

      trackRepo.insert({
        id: 'trk_orphan_01',
        title: '孤儿曲目',
        artist: '测试',
        album: '测试',
        duration: 100,
        bitrate: 320000,
        sampleRate: 44100,
        bitDepth: 16,
        channels: 2,
        filePath: orphanPath,
        fileSize: 1000,
        fileHash: 'hash_orphan_test',
        hasEmbeddedCover: false,
        hasEmbeddedLyrics: false,
        healthyStatus: 'healthy',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // 执行主曲库同步
      await syncMusicsDirectory(sandbox.config.storage.libraryDir);

      // 孤儿曲目必须依然存在于数据库中，但被置为 is_missing = 1
      const orphanTrack = trackRepo.findById('trk_orphan_01');
      expect(orphanTrack).not.toBeNull();
      expect(orphanTrack?.isMissing).toBe(true);
      expect(orphanTrack?.missingAt).toBeDefined();
    });
  });

  describe('3. REST 接口 /api/import/roots 与 /api/import/directory 安全防护', () => {
    it('GET /api/import/roots 获取全部登记根', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/import/roots',
        headers: { 'x-wavelet-session': sessionToken },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.roots)).toBe(true);
      expect(data.roots.some((r: { kind: string }) => r.kind === 'primary')).toBe(true);
    });

    it('POST /api/import/directory 拒绝导入敏感系统目录与 dataDir', async () => {
      // 尝试导入 /etc
      const etcRes = await app.inject({
        method: 'POST',
        url: '/api/import/directory',
        headers: { 'x-wavelet-session': sessionToken },
        payload: { directoryPath: '/etc' },
      });
      expect(etcRes.statusCode).toBe(400);
      expect(JSON.parse(etcRes.body).error).toContain('系统');

      // 尝试导入 ~/.wavelet
      const dataDirRes = await app.inject({
        method: 'POST',
        url: '/api/import/directory',
        headers: { 'x-wavelet-session': sessionToken },
        payload: { directoryPath: sandbox.config.storage.dataDir },
      });
      expect(dataDirRes.statusCode).toBe(400);
      expect(JSON.parse(dataDirRes.body).error).toContain('Wavelet 数据');
    });

    it('POST /api/import/directory 成功导入外部目录并自动注册为 imported 根', async () => {
      const newImportDir = path.join(sandbox.rootDir, 'NewImportDir');
      fs.mkdirSync(newImportDir, { recursive: true });
      fs.copyFileSync(TEST_AUDIO_PATH, path.join(newImportDir, 'song.flac'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/import/directory',
        headers: { 'x-wavelet-session': sessionToken },
        payload: { directoryPath: newImportDir },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.importedCount).toBe(1);

      // 验证新目录已自动作为 imported 登记在 library_roots
      const registered = rootRepo.getRoot(newImportDir);
      expect(registered).not.toBeNull();
      expect(registered?.kind).toBe('imported');
    });

    it('DELETE /api/import/roots 禁止删除 primary 主曲库根，允许删除 imported 根', async () => {
      // 尝试删除 primary 根
      const delPrimaryRes = await app.inject({
        method: 'DELETE',
        url: '/api/import/roots',
        headers: { 'x-wavelet-session': sessionToken },
        payload: { path: sandbox.config.storage.libraryDir },
      });
      expect(delPrimaryRes.statusCode).toBe(400);
      expect(JSON.parse(delPrimaryRes.body).error).toContain('主曲库根目录禁止移除');

      // 删除 imported 根
      const delImportedRes = await app.inject({
        method: 'DELETE',
        url: '/api/import/roots',
        headers: { 'x-wavelet-session': sessionToken },
        payload: { path: externalMusicDir },
      });
      expect(delImportedRes.statusCode).toBe(200);
      expect(rootRepo.getRoot(externalMusicDir)).toBeNull();
    });
  });
});
