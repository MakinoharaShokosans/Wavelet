import fs from 'node:fs';
import path from 'node:path';
import {
  PlaybackRouter,
  TrackRepository,
  closeDatabase,
  createServer,
  getDatabase,
  getDirectPlayer,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
} from '@wavelet/backend';
import type { Track } from '@wavelet/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Unit Test: Playback Physical File Missing Defense (ISSUE-01: 物理文件丢失防御与自动跳播)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let router: PlaybackRouter;
  let trackRepo: TrackRepository;
  let app: FastifyInstance;
  let sessionToken: string;

  let normalTrack1: Track;
  let normalTrack2: Track;
  let missingTrack1: Track;
  let missingTrack2: Track;
  let missingTrack3: Track;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository();

    // 1. 创建真实物理文件曲目
    const normalPath1 = path.join(sandbox.config.storage.libraryDir, 'normal_01.flac');
    const normalPath2 = path.join(sandbox.config.storage.libraryDir, 'normal_02.flac');
    fs.writeFileSync(normalPath1, 'fake-flac-normal-1');
    fs.writeFileSync(normalPath2, 'fake-flac-normal-2');

    normalTrack1 = {
      id: 'trk_normal_01',
      title: '正常曲目 1',
      artist: 'Artist A',
      album: 'Album A',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: normalPath1,
      fileSize: 1000,
      fileHash: 'hash_norm_1',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    normalTrack2 = {
      id: 'trk_normal_02',
      title: '正常曲目 2',
      artist: 'Artist B',
      album: 'Album B',
      duration: 200,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: normalPath2,
      fileSize: 1000,
      fileHash: 'hash_norm_2',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 2. 创建元数据在数据库中，但磁盘上不存在/已被物理删除的曲目
    const ghostPath1 = path.join(sandbox.config.storage.libraryDir, 'ghost_01.flac');
    const ghostPath2 = path.join(sandbox.config.storage.libraryDir, 'ghost_02.flac');
    const ghostPath3 = path.join(sandbox.config.storage.libraryDir, 'ghost_03.flac');

    missingTrack1 = {
      id: 'trk_ghost_01',
      title: '丢失曲目 1',
      artist: 'Ghost A',
      album: 'Ghost Album',
      duration: 150,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: ghostPath1,
      fileSize: 1000,
      fileHash: 'hash_ghost_1',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    missingTrack2 = {
      id: 'trk_ghost_02',
      title: '丢失曲目 2',
      artist: 'Ghost B',
      album: 'Ghost Album',
      duration: 160,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: ghostPath2,
      fileSize: 1000,
      fileHash: 'hash_ghost_2',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    missingTrack3 = {
      id: 'trk_ghost_03',
      title: '丢失曲目 3',
      artist: 'Ghost C',
      album: 'Ghost Album',
      duration: 170,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: ghostPath3,
      fileSize: 1000,
      fileHash: 'hash_ghost_3',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    trackRepo.insert(normalTrack1);
    trackRepo.insert(normalTrack2);
    trackRepo.insert(missingTrack1);
    trackRepo.insert(missingTrack2);
    trackRepo.insert(missingTrack3);

    router = new PlaybackRouter();
    app = await createServer();

    // 握手获取 Session Token
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
    });
    sessionToken = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('预检拦截：尝试播放物理丢失文件时，应当拦截播放并不自增播放指标 (零污染)', async () => {
    // 确保物理文件确实不存在
    expect(fs.existsSync(missingTrack1.filePath)).toBe(false);

    await router.play(missingTrack1.id, 0);

    // 1. 播放状态应当为 stopped，不得伪装为 playing
    const status = router.getStatus();
    expect(status.state).toBe('stopped');

    // 2. 数据库中的播放指标 play_count 与 last_played_at 不得被污染
    const dbTrack = trackRepo.findById(missingTrack1.id);
    expect(dbTrack?.playCount).toBe(0);
    expect(dbTrack?.lastPlayedAt).toBeUndefined();
  });

  it('Direct 模式跳播：播放队列中遇物理文件丢失，应当在毫秒级内自动跳播至下一首正常曲目', async () => {
    router.setOutputMode('direct');

    // 队列结构: [丢失曲目 1, 正常曲目 1]
    await router.setQueue([missingTrack1, normalTrack1], 0);

    // 此时第一首丢失，应计划在 ~120ms 跳到第二首
    await new Promise((resolve) => setTimeout(resolve, 200));

    const queueStatus = router.getQueue();
    expect(queueStatus.currentIndex).toBe(1);
    expect(queueStatus.currentTrack?.id).toBe(normalTrack1.id);
  });

  it('连续丢失级联跳播：队列中连续 2 首丢失，应当级联自动跳入第 3 首可用正常曲目', async () => {
    router.setOutputMode('direct');

    // 队列结构: [丢失曲目 1, 丢失曲目 2, 正常曲目 2]
    await router.setQueue([missingTrack1, missingTrack2, normalTrack2], 0);

    // 第一首跳第二首 (120ms)，第二首跳第三首 (120ms)，总计约 240ms
    await new Promise((resolve) => setTimeout(resolve, 350));

    const queueStatus = router.getQueue();
    expect(queueStatus.currentIndex).toBe(2);
    expect(queueStatus.currentTrack?.id).toBe(normalTrack2.id);
  });

  it('熔断器机制：当队列内所有曲目均物理丢失时，应当在触发熔断后停止跳播，绝不产生无限死循环', async () => {
    router.setOutputMode('direct');

    // 队列结构: 全部丢失 [丢失 1, 丢失 2, 丢失 3]
    await router.setQueue([missingTrack1, missingTrack2, missingTrack3], 0);

    // 等待跳播与熔断器生效
    await new Promise((resolve) => setTimeout(resolve, 500));

    const status = router.getStatus();
    // 熔断后状态机必须平稳停止
    expect(status.state).toBe('stopped');
  });

  it('DirectPcmPlayer 硬件防爆：物理文件不存在时 play() 应当安全拦截并不启动解码子进程', async () => {
    const directPlayer = getDirectPlayer();
    await directPlayer.play(missingTrack1, 0);

    expect(directPlayer.getStatus().state).toBe('stopped');
  });

  it('HTTP Stream 端点 404：GET /api/stream/:trackId 请求已丢失曲目时应当返回 404 与明确错误信息', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    const res = await app.inject({
      method: 'GET',
      url: `/api/stream/${missingTrack1.id}`,
      headers,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('曲目不存在或物理文件已断链');
  });
});
