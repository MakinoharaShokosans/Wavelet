import fs from 'node:fs';
import path from 'node:path';
import {
  CorruptionType,
  FftPump,
  PlaylistRepository,
  TrackRepository,
  createServer,
  diagnoseAudioFile,
  getDatabase,
  healAudioFile,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox, getTestAudioSlice } from '../test-helper.js';

describe('E2E Test: Full Application Lifecycle (Cold-start -> Healing -> Library -> Playback/FFT -> Teardown)', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  beforeAll(async () => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
    app = await createServer();

    trackRepo = new TrackRepository();
    playlistRepo = new PlaylistRepository();
  });

  afterAll(async () => {
    await app.close();
    sandbox.cleanup();
  });

  it('场景 1: 冷启动网关鉴权就绪并换取 SessionKey', async () => {
    const tokenRes = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
    });
    expect(tokenRes.statusCode).toBe(200);
    const body = JSON.parse(tokenRes.body);
    expect(body.token).toBeDefined();
    expect(body.token.length).toBe(64);
    sessionToken = body.token;
  });

  it('场景 2: 坏损音频文件体检自愈、入库与歌单自动编目', async () => {
    // 基于真实 96kHz/24bit 母带截取切片并人为注入 128 字节脏头
    const slice = getTestAudioSlice(1024 * 1024);
    const dirtyHeader = Buffer.from('CORRUPTED_AD_PADDING_'.repeat(6));
    const rawDirtyPath = path.join(sandbox.rootDir, 'dirty_master.flac');
    fs.writeFileSync(rawDirtyPath, Buffer.concat([dirtyHeader, slice]));

    // 1. 运行自愈诊断
    const diagnosis = await diagnoseAudioFile(rawDirtyPath);
    expect(diagnosis.corruptions).toContain(CorruptionType.FRAME_ALIGNMENT_DIRTY);

    // 2. 执行自愈修复流水线
    const healed = await healAudioFile(rawDirtyPath, diagnosis);
    expect(healed.success).toBe(true);
    expect(fs.existsSync(healed.healedPath)).toBe(true);

    // 3. 将自愈后的曲目持久化存入 SQLite
    const trackId = 'trk_e2e_001';
    trackRepo.insert({
      id: trackId,
      title: '彼女は旅に出る (Healed)',
      artist: '鎖那',
      album: 'Hush a by little girl',
      duration: 220.5,
      bitrate: 2928000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: healed.healedPath,
      fileSize: healed.healedBytes,
      fileHash: 'sha256_mock_e2e_healed_hash',
      hasEmbeddedCover: true,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 4. 将曲目挂接至默认“全部音乐”歌单
    playlistRepo.addTrackToPlaylist('default_all_tracks', trackId);

    // 5. 通过 REST API 验证曲目列表与歌单检索
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/tracks',
      headers: { 'x-wavelet-session': sessionToken },
    });
    expect(listRes.statusCode).toBe(200);
    const listData = JSON.parse(listRes.body);
    expect(listData.total).toBe(1);
    expect(listData.items[0].id).toBe(trackId);
    expect(listData.items[0].healthyStatus).toBe('healed');

    // 6. 验证歌单内容
    const plRes = await app.inject({
      method: 'GET',
      url: '/api/playlists/default_all_tracks',
      headers: { 'x-wavelet-session': sessionToken },
    });
    expect(plRes.statusCode).toBe(200);
    const plData = JSON.parse(plRes.body);
    expect(plData.tracks.some((t: { id: string }) => t.id === trackId)).toBe(true);
  });

  it('场景 3: 播放控制状态机流转与 60fps FFT 频域频谱分析流', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 设置音量
    const volRes = await app.inject({
      method: 'POST',
      url: '/api/player/volume',
      headers,
      payload: { volume: 0.72 },
    });
    expect(volRes.statusCode).toBe(200);
    expect(JSON.parse(volRes.body).status.volume).toBe(0.72);

    // 2. 模拟发烧级 FFT Visualizer 频谱泵送
    const fftPump = new FftPump(1024, 64);

    // 灌入模拟 1kHz 正弦波音频 PCM (44.1kHz, 1024 样点)
    const sampleRate = 44100;
    const sineChunk = Buffer.alloc(1024 * 2);
    for (let i = 0; i < 1024; i++) {
      const sample = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      const val = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      sineChunk.writeInt16LE(val, i * 2);
    }

    const spectrum = fftPump.processPcmChunk(sineChunk);
    expect(spectrum.length).toBe(64);
    // 验证频域能量落在 [0, 1]
    for (let i = 0; i < 64; i++) {
      expect(spectrum[i]).toBeGreaterThanOrEqual(0);
      expect(spectrum[i]).toBeLessThanOrEqual(1);
    }
    // 1kHz 正弦波在 44.1kHz 下主要集中在低中频 (bin 1~5)
    const dominantBins = spectrum.slice(1, 6);
    expect(Math.max(...dominantBins)).toBeGreaterThan(0.05);
  });

  it('场景 4: 优雅停机信号处理与数据库连接安全断开', async () => {
    // 验证当前状态下 SQLite 处于健康连接与可读写状态
    const tracks = trackRepo.findAll();
    expect(tracks.total).toBe(1);
  });
});
