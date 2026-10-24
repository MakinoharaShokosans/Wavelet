import fs from 'node:fs';
import path from 'node:path';
import {
  TrackRepository,
  createServer,
  getDatabase,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
} from '@wavelet/backend';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Integration Test: Gateway Web API Extensions (Web 前端网关扩展接口)', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;
  let sampleTrackId: string;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    // 复制真实母带到沙箱作为可用曲目
    const copiedAudioPath = path.join(sandbox.config.storage.libraryDir, 'master.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, copiedAudioPath);

    sampleTrackId = 'trk_gw_web_01';
    new TrackRepository(getDatabase()).insert({
      id: sampleTrackId,
      title: '彼女は旅に出る',
      artist: '鎖那',
      album: 'Hush a by little girl',
      duration: 224,
      bitrate: 1000000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: copiedAudioPath,
      fileSize: 80000000,
      fileHash: 'hash_master_flac_test',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    app = await createServer();

    // 获取会话密钥
    const authRes = await app.inject({ method: 'GET', url: '/api/auth/token' });
    sessionToken = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('GET /api/stats 应当秒级返回看板聚合统计指标', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats',
      headers: { 'x-wavelet-session': sessionToken },
    });

    expect(res.statusCode).toBe(200);
    const stats = JSON.parse(res.body);
    expect(stats.trackCount).toBe(1);
    expect(stats.playlistCount).toBeGreaterThanOrEqual(3);
    expect(stats.avgDurationFormatted).toBe('03:44');
    expect(stats.totalDurationFormatted).toBe('3 分钟');
  });

  it('播放队列接口: GET / POST /next /previous /play-mode 应当工作正常', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. GET /api/player/queue
    const getRes = await app.inject({ method: 'GET', url: '/api/player/queue', headers });
    expect(getRes.statusCode).toBe(200);

    // 2. POST /api/player/queue 设置队列
    const setRes = await app.inject({
      method: 'POST',
      url: '/api/player/queue',
      headers,
      payload: {
        tracks: [
          {
            id: sampleTrackId,
            title: 'Song 1',
            artist: 'A',
            album: 'A',
            duration: 100,
            bitrate: 100,
            sampleRate: 44100,
            bitDepth: 16,
            channels: 2,
            filePath: '/m.flac',
            fileSize: 100,
            fileHash: 'h1',
            hasEmbeddedCover: false,
            hasEmbeddedLyrics: false,
            healthyStatus: 'healthy',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        startIndex: 0,
      },
    });
    expect(setRes.statusCode).toBe(200);
    const setData = JSON.parse(setRes.body);
    expect(setData.queue.queue.length).toBe(1);

    // 3. POST /api/player/play-mode 切换播放模式
    const modeRes = await app.inject({
      method: 'POST',
      url: '/api/player/play-mode',
      headers,
      payload: { mode: 'repeat-list' },
    });
    expect(modeRes.statusCode).toBe(200);
    expect(JSON.parse(modeRes.body).queue.playMode).toBe('repeat-list');

    // 4. POST /api/player/next
    const nextRes = await app.inject({
      method: 'POST',
      url: '/api/player/next',
      headers,
    });
    expect(nextRes.statusCode).toBe(200);
  });

  it('POST /api/tracks/:id/favorite 应当支持一键切换心动收藏状态', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 收藏
    const fav1 = await app.inject({
      method: 'POST',
      url: `/api/tracks/${sampleTrackId}/favorite`,
      headers,
    });
    expect(fav1.statusCode).toBe(200);
    expect(JSON.parse(fav1.body).isFavorite).toBe(true);

    // 2. 取消收藏
    const fav2 = await app.inject({
      method: 'POST',
      url: `/api/tracks/${sampleTrackId}/favorite`,
      headers,
    });
    expect(fav2.statusCode).toBe(200);
    expect(JSON.parse(fav2.body).isFavorite).toBe(false);
  });

  it('GET /api/tracks/:id/waveform 应当返回整轨 128 点归一化波形峰值', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    const res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${sampleTrackId}/waveform`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const waveform = JSON.parse(res.body);
    expect(waveform.trackId).toBe('hash_master_flac_test');
    expect(waveform.peaks.length).toBe(128);
    expect(waveform.duration).toBe(224);
  });

  it('GET /api/playlists/:id/tracks 应当成功返回歌单内挂载的曲目数组及收藏状态', async () => {
    const { PlaylistRepository } = await import('@wavelet/backend');
    const playlistRepo = new PlaylistRepository(getDatabase());
    playlistRepo.addTrackToPlaylist('default_unintegrated_tracks', sampleTrackId);

    const headers = { 'x-wavelet-session': sessionToken };
    const res = await app.inject({
      method: 'GET',
      url: '/api/playlists/default_unintegrated_tracks/tracks',
      headers,
    });

    expect(res.statusCode).toBe(200);
    const tracks = JSON.parse(res.body);
    expect(Array.isArray(tracks)).toBe(true);
    expect(tracks.length).toBeGreaterThanOrEqual(1);
    const found = tracks.find((t: { id: string }) => t.id === sampleTrackId);
    expect(found).toBeDefined();
    expect(found.title).toBe('彼女は旅に出る');
    expect(found.isFavorite).toBeDefined();
  });

  it('音频流式接口：GET /api/stream/:trackId 应当支持整轨读取与 HTTP 206 Range 分片检索', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 全量流式读取 (HTTP 200)
    const fullRes = await app.inject({
      method: 'GET',
      url: `/api/stream/${sampleTrackId}`,
      headers,
    });
    expect(fullRes.statusCode).toBe(200);
    expect(fullRes.headers['content-type']).toBe('audio/flac');
    expect(fullRes.headers['accept-ranges']).toBe('bytes');
    expect(Number(fullRes.headers['content-length'])).toBeGreaterThan(0);

    // 2. HTTP 206 Partial Content 分片检索
    const rangeRes = await app.inject({
      method: 'GET',
      url: `/api/stream/${sampleTrackId}`,
      headers: {
        ...headers,
        range: 'bytes=0-1023',
      },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['content-range']).toContain('bytes 0-1023/');
    expect(rangeRes.rawPayload.length).toBe(1024);

    // 3. 不存在曲目应当返回 404
    const notFoundRes = await app.inject({
      method: 'GET',
      url: '/api/stream/non_existent_trk',
      headers,
    });
    expect(notFoundRes.statusCode).toBe(404);
  });

  it('Bit-Perfect 接口：POST /api/player/bit-perfect 应当支持平滑切换输出模式', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 开启 Bit-Perfect 直通
    const bpOn = await app.inject({
      method: 'POST',
      url: '/api/player/bit-perfect',
      headers,
      payload: { enabled: true, deviceName: 'default' },
    });
    expect(bpOn.statusCode).toBe(200);
    expect(JSON.parse(bpOn.body).status.mode).toBe('direct');

    // 关闭 Bit-Perfect 直通 (回退为 Web 模式)
    const bpOff = await app.inject({
      method: 'POST',
      url: '/api/player/bit-perfect',
      headers,
      payload: { enabled: false },
    });
    expect(bpOff.statusCode).toBe(200);
    expect(JSON.parse(bpOff.body).status.mode).toBe('web');
  });

  it('播放器控制接口：play / pause / seek / resume / stop 应当协同工作', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. Play
    const playRes = await app.inject({
      method: 'POST',
      url: '/api/player/play',
      headers,
      payload: { trackId: sampleTrackId, offsetMs: 1000 },
    });
    expect(playRes.statusCode).toBe(200);
    expect(JSON.parse(playRes.body).status.state).toBe('playing');

    // 2. Pause
    const pauseRes = await app.inject({
      method: 'POST',
      url: '/api/player/pause',
      headers,
      payload: {},
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(JSON.parse(pauseRes.body).status.state).toBe('paused');

    // 3. Seek
    const seekRes = await app.inject({
      method: 'POST',
      url: '/api/player/seek',
      headers,
      payload: { offsetMs: 30000 },
    });
    expect(seekRes.statusCode).toBe(200);
    expect(JSON.parse(seekRes.body).status.currentTimeMs).toBe(30000);

    // 4. Resume
    const resumeRes = await app.inject({
      method: 'POST',
      url: '/api/player/resume',
      headers,
      payload: {},
    });
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.parse(resumeRes.body).status.state).toBe('playing');

    // 5. Stop
    const stopRes = await app.inject({
      method: 'POST',
      url: '/api/player/stop',
      headers,
      payload: {},
    });
    expect(stopRes.statusCode).toBe(200);
    expect(JSON.parse(stopRes.body).status.state).toBe('stopped');
  });

  it('歌词接口：PUT /api/tracks/:id/lyrics 与 GET /api/tracks/:id/lyrics 应当正常持久化与读取', async () => {
    const headers = { 'x-wavelet-session': sessionToken };
    const lrcContent = '[00:01.00] 彼女は旅に出る\n[00:05.00] 歌词测试';

    // 写入歌词
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/tracks/${sampleTrackId}/lyrics`,
      headers,
      payload: { content: lrcContent },
    });
    expect(putRes.statusCode).toBe(200);

    // 读取歌词
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${sampleTrackId}/lyrics`,
      headers,
    });
    expect(getRes.statusCode).toBe(200);
    const lyricsData = JSON.parse(getRes.body);
    expect(lyricsData.rawLrc).toBe(lrcContent);
    expect(lyricsData.trackId).toBe(sampleTrackId);
  });

  it('曲库全量备份与迁移接口：POST /api/backup/export, GET /download, POST /import 应当正常协同', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 无备份时下载应当返回 404
    const emptyDlRes = await app.inject({
      method: 'GET',
      url: '/api/backup/download',
      headers,
    });
    // 允许 404 或已存在路径
    expect([200, 404]).toContain(emptyDlRes.statusCode);

    // 2. 导出备份 (不包含物理音频以加速测试，指定沙箱路径防止污染用户家目录)
    const testBackupZip = path.join(sandbox.rootDir, 'gateway_test_backup.zip');
    const exportRes = await app.inject({
      method: 'POST',
      url: '/api/backup/export',
      headers,
      payload: { targetZipPath: testBackupZip, includeAudio: false },
    });
    expect(exportRes.statusCode).toBe(200);
    const expData = JSON.parse(exportRes.body);
    expect(expData.success).toBe(true);
    expect(expData.data.targetZipPath).toBe(testBackupZip);
    expect(expData.downloadUrl).toBe('/api/backup/download');

    // 3. 流式下载刚导出的备份包
    const dlRes = await app.inject({
      method: 'GET',
      url: '/api/backup/download',
      headers,
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.headers['content-type']).toBe('application/zip');

    // 4. 从备份文件还原
    const impRes = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      headers,
      payload: { zipFilePath: expData.data.targetZipPath },
    });
    expect(impRes.statusCode).toBe(200);
    expect(JSON.parse(impRes.body).success).toBe(true);

    // 5. 校验非法路径还原防护
    const badImpRes = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      headers,
      payload: { zipFilePath: '/non_existent_path.zip' },
    });
    expect(badImpRes.statusCode).toBe(400);
  });

  it('原地目录索引接口：POST /api/import/directory 边界防卫与正常扫描应当可靠运行', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 不存在目录应当返回 400
    const notFoundDirRes = await app.inject({
      method: 'POST',
      url: '/api/import/directory',
      headers,
      payload: { directoryPath: '/non_existent_folder_abc_123' },
    });
    expect(notFoundDirRes.statusCode).toBe(400);

    // 2. 空目录应当返回 400
    const emptySubDir = path.join(sandbox.config.storage.libraryDir, 'empty_test_sub');
    fs.mkdirSync(emptySubDir, { recursive: true });
    const emptyDirRes = await app.inject({
      method: 'POST',
      url: '/api/import/directory',
      headers,
      payload: { directoryPath: emptySubDir },
    });
    expect(emptyDirRes.statusCode).toBe(400);

    // 3. 包含有效音频的独立目录原地就地索引
    const importSourceDir = path.join(sandbox.rootDir, 'import_fresh_dir');
    fs.mkdirSync(importSourceDir, { recursive: true });
    fs.copyFileSync(TEST_AUDIO_PATH, path.join(importSourceDir, 'fresh_track.flac'));

    const importDirRes = await app.inject({
      method: 'POST',
      url: '/api/import/directory',
      headers,
      payload: { directoryPath: importSourceDir },
    });
    expect(importDirRes.statusCode).toBe(200);
    const impResult = JSON.parse(importDirRes.body);
    expect(impResult.success).toBe(true);
    expect(impResult.totalScanned).toBe(1);
    expect(impResult.importedCount).toBe(1);
  });

  it('队列动态管理接口：POST /api/player/queue/add 与 DELETE 应当正常操作', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 追加到队列
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/player/queue/add',
      headers,
      payload: {
        tracks: [
          {
            id: sampleTrackId,
            title: 'Track Added',
            artist: 'A',
            album: 'A',
            duration: 120,
            bitrate: 100,
            sampleRate: 44100,
            bitDepth: 16,
            channels: 2,
            filePath: '/t.flac',
            fileSize: 100,
            fileHash: 'h_add',
            hasEmbeddedCover: false,
            hasEmbeddedLyrics: false,
            healthyStatus: 'healthy',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        next: true,
      },
    });
    expect(addRes.statusCode).toBe(200);

    // 移除单曲
    const delItemRes = await app.inject({
      method: 'DELETE',
      url: '/api/player/queue/0',
      headers,
    });
    expect(delItemRes.statusCode).toBe(200);

    // 清空队列
    const clearRes = await app.inject({
      method: 'DELETE',
      url: '/api/player/queue',
      headers,
    });
    expect(clearRes.statusCode).toBe(200);
  });
});
