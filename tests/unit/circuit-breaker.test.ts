import fs from 'node:fs';
import path from 'node:path';
import {
  TrackRepository,
  closeDatabase,
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

describe('Unit Test: Storage Disconnect / 0-File Circuit Breaker (ISSUE-04: 0 文件防空门熔断保护)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let app: FastifyInstance;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
    trackRepo = new TrackRepository();
    app = await createServer();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：目录被误清空或移走 (0个物理文件) 时触发熔断，保护全库不被置灰或清除', async () => {
    // 1. 准备两首初始曲目
    const track1 = path.join(sandbox.config.storage.libraryDir, 'breaker_01.flac');
    const track2 = path.join(sandbox.config.storage.libraryDir, 'breaker_02.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, track1);
    fs.writeFileSync(
      track2,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('breaker_02_data')])
    );

    const initialSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(initialSync.scanned).toBe(2);
    expect(initialSync.imported).toBe(2);
    expect(initialSync.circuitBreakerTriggered).toBeFalsy();

    // 2. 模拟目录被移走或清空 (物理文件变为 0 个)
    const backupDir = path.join(sandbox.rootDir, 'breaker_backup');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.renameSync(track1, path.join(backupDir, 'breaker_01.flac'));
    fs.renameSync(track2, path.join(backupDir, 'breaker_02.flac'));

    // 3. 执行同步扫描：此时应当触发 0 文件熔断
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.circuitBreakerTriggered).toBe(true);
    expect(syncRes.scanned).toBe(0);
    expect(syncRes.imported).toBe(0);
    expect(syncRes.missing).toBe(0);

    // 4. 验证数据库中存量歌曲完全冻结保护，没有被标记为软缺失 (is_missing 仍为 false)
    const dbTrack1 = trackRepo.findByPath(track1);
    const dbTrack2 = trackRepo.findByPath(track2);
    expect(dbTrack1).not.toBeNull();
    expect(dbTrack2).not.toBeNull();
    expect(dbTrack1?.isMissing).toBeFalsy();
    expect(dbTrack2?.isMissing).toBeFalsy();
  });

  it('场景 2：常规单曲删除时 (仍有文件在席) 不误触熔断，正常触发软缺失标记', async () => {
    // 1. 将其中一首曲目移回，此时物理目录只有 1 首，另一首仍缺失
    const track1 = path.join(sandbox.config.storage.libraryDir, 'breaker_01.flac');
    const backupDir = path.join(sandbox.rootDir, 'breaker_backup');
    fs.renameSync(path.join(backupDir, 'breaker_01.flac'), track1);

    // 2. 触发同步
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.circuitBreakerTriggered).toBeFalsy();
    expect(syncRes.scanned).toBe(1);
    expect(syncRes.missing).toBe(1); // 只有 track2 缺失

    const dbTrack1 = trackRepo.findByPath(track1);
    const track2Path = path.join(sandbox.config.storage.libraryDir, 'breaker_02.flac');
    const dbTrack2 = trackRepo.findByPath(track2Path);
    expect(dbTrack1?.isMissing).toBeFalsy();
    expect(dbTrack2?.isMissing).toBe(true);
  });

  it('场景 3：逃生舱 force: true 显式跳过熔断', async () => {
    // 1. 再次清空目录
    const track1 = path.join(sandbox.config.storage.libraryDir, 'breaker_01.flac');
    const backupDir = path.join(sandbox.rootDir, 'breaker_backup');
    fs.renameSync(track1, path.join(backupDir, 'breaker_01.flac'));

    // 2. 显式以 force: true 触发同步
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir, { force: true });
    expect(syncRes.circuitBreakerTriggered).toBeFalsy();
    expect(syncRes.scanned).toBe(0);
    expect(syncRes.missing).toBe(1); // track1 也被标记为缺失

    const dbTrack1 = trackRepo.findByPath(track1);
    expect(dbTrack1?.isMissing).toBe(true);
  });

  it('场景 4：REST 接口 /api/import/musics 联动熔断响应', async () => {
    // 换取单次运行时的会话密钥
    const tokenRes = await app.inject({ method: 'GET', url: '/api/auth/token' });
    const sessionToken = JSON.parse(tokenRes.body).token;

    // 当前目录仍然为空，数据库中有存量曲目
    const response = await app.inject({
      method: 'POST',
      url: '/api/import/musics',
      headers: { 'x-wavelet-session': sessionToken },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.payload);
    expect(payload.success).toBe(false);
    expect(payload.circuitBreakerTriggered).toBe(true);
    expect(payload.message).toContain('熔断保护');
  });
});
