import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  LyricsRepository,
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

const MOCK_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  0x00, 0x60, 0x00, 0x00, 0xff, 0xd9,
]);

const MOCK_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const MOCK_LRC = `[00:01.00] 伴随歌词第一行测试
[00:05.50] 伴随歌词第二行测试
[00:12.00] 伴随歌词落幕`;

describe('Unit Test: Sidecar Files Detection (ISSUE-07: 外挂伴随歌词与同级封面探测)', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;
  let trackRepo: TrackRepository;
  let lyricsRepo: LyricsRepository;
  let rawAudioTemplate: string;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository(getDatabase());
    lyricsRepo = new LyricsRepository(getDatabase());

    // 生成纯净无内嵌封面/视频轨的 FLAC 模版 (使用 ffmpeg -vn)
    rawAudioTemplate = path.join(sandbox.rootDir, 'pure_raw_audio.flac');
    execSync(`ffmpeg -y -i "${TEST_AUDIO_PATH}" -vn -t 1 -c:a flac "${rawAudioTemplate}"`);

    app = await createServer();
    const authRes = await app.inject({ method: 'GET', url: '/api/auth/token' });
    sessionToken = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：无内嵌歌词音频 + 同级伴随 LRC/TXT 歌词探测入库与接口检索', async () => {
    // 1. 准备纯音频文件及同名伴随 .lrc
    const trackFile = path.join(sandbox.config.storage.libraryDir, 'sidecar_lyric_demo.flac');
    const lyricFile = path.join(sandbox.config.storage.libraryDir, 'sidecar_lyric_demo.lrc');
    fs.writeFileSync(
      trackFile,
      Buffer.concat([fs.readFileSync(rawAudioTemplate), Buffer.from('sidecar_lyric_seed')])
    );
    fs.writeFileSync(lyricFile, MOCK_LRC);

    // 2. 执行曲库扫描
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.imported).toBeGreaterThanOrEqual(1);

    const track = trackRepo.findByPath(trackFile);
    expect(track).not.toBeNull();
    if (!track) throw new Error('track must be defined');

    // 3. 断言数据库已标记 hasEmbeddedLyrics 为 true
    expect(track.hasEmbeddedLyrics).toBe(true);

    // 4. 调用 GET /api/tracks/:id/lyrics 获取歌词
    const headers = { 'x-wavelet-session': sessionToken };
    const lyrRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}/lyrics`,
      headers,
    });

    expect(lyrRes.statusCode).toBe(200);
    const lyrBody = JSON.parse(lyrRes.body);
    expect(lyrBody.trackId).toBe(track.id);
    expect(lyrBody.rawLrc).toContain('伴随歌词第一行测试');

    // 5. 验证大写后缀 .LRC 容错
    const trackFileUpper = path.join(sandbox.config.storage.libraryDir, 'upper_lrc_demo.flac');
    const lyricFileUpper = path.join(sandbox.config.storage.libraryDir, 'upper_lrc_demo.LRC');
    fs.writeFileSync(
      trackFileUpper,
      Buffer.concat([fs.readFileSync(rawAudioTemplate), Buffer.from('upper_lrc_seed')])
    );
    fs.writeFileSync(lyricFileUpper, '[00:00.50] 大写后缀歌词');

    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const trackUpper = trackRepo.findByPath(trackFileUpper);
    expect(trackUpper?.hasEmbeddedLyrics).toBe(true);
    const lyrUpperRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${trackUpper?.id}/lyrics`,
      headers,
    });
    expect(lyrUpperRes.statusCode).toBe(200);
    expect(JSON.parse(lyrUpperRes.body).rawLrc).toContain('大写后缀歌词');
  });

  it('场景 2：无内嵌封面音频 + 同级伴随封面探测 (单曲专属与专辑通用 cover.png)', async () => {
    // 建立一个独立的专辑子目录模拟专辑文件组织结构
    const albumDir = path.join(sandbox.config.storage.libraryDir, 'MockAlbum');
    fs.mkdirSync(albumDir, { recursive: true });

    // 1. 子测试 A：单曲专属同名封面 (single_track.jpg)
    const singleTrack = path.join(albumDir, '01.single_track.flac');
    const singleCover = path.join(albumDir, '01.single_track.jpg');
    fs.writeFileSync(
      singleTrack,
      Buffer.concat([fs.readFileSync(rawAudioTemplate), Buffer.from('single_track_cover_seed')])
    );
    fs.writeFileSync(singleCover, MOCK_JPEG);

    // 2. 子测试 B：专辑共用封面 (cover.png) 供另一首歌曲使用
    const sharedTrack = path.join(albumDir, '02.shared_album_track.flac');
    const albumCover = path.join(albumDir, 'cover.png');
    fs.writeFileSync(
      sharedTrack,
      Buffer.concat([fs.readFileSync(rawAudioTemplate), Buffer.from('shared_album_track_seed')])
    );
    fs.writeFileSync(albumCover, MOCK_PNG);

    // 3. 执行曲库扫描
    await syncMusicsDirectory(sandbox.config.storage.libraryDir);

    const track1 = trackRepo.findByPath(singleTrack);
    const track2 = trackRepo.findByPath(sharedTrack);
    expect(track1).not.toBeNull();
    expect(track2).not.toBeNull();
    if (!track1 || !track2) throw new Error('tracks must be defined');

    // 断言两首歌曲均已识别并标记了封面
    expect(track1.hasEmbeddedCover).toBe(true);
    expect(track2.hasEmbeddedCover).toBe(true);

    const headers = { 'x-wavelet-session': sessionToken };

    // 4. 请求单曲 1 封面，校验其返回 MIME 为 image/jpeg
    const cover1Res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track1.id}/cover`,
      headers,
    });
    expect(cover1Res.statusCode).toBe(200);
    expect(cover1Res.headers['content-type']).toContain('image/jpeg');
    expect(cover1Res.rawPayload.length).toBe(MOCK_JPEG.length);

    // 5. 请求单曲 2 封面，校验其返回共享的 cover.png 且 MIME 为 image/png
    const cover2Res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track2.id}/cover`,
      headers,
    });
    expect(cover2Res.statusCode).toBe(200);
    expect(cover2Res.headers['content-type']).toContain('image/png');
    expect(cover2Res.rawPayload.length).toBe(MOCK_PNG.length);
  });

  it('场景 3：外部后置补充伴随文件时，支持通过热刷新与运行时动态兜底捕获', async () => {
    // 1. 准备一首起初完全没有任何外挂封面与歌词的孤立曲目
    const lateDir = path.join(sandbox.config.storage.libraryDir, 'LateAddAlbum');
    fs.mkdirSync(lateDir, { recursive: true });
    const lateTrackFile = path.join(lateDir, 'late_song.flac');
    fs.writeFileSync(
      lateTrackFile,
      Buffer.concat([fs.readFileSync(rawAudioTemplate), Buffer.from('late_add_seed')])
    );

    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const initialTrack = trackRepo.findByPath(lateTrackFile);
    expect(initialTrack).not.toBeNull();
    if (!initialTrack) throw new Error('initialTrack must be defined');
    expect(initialTrack.hasEmbeddedCover).toBe(false);
    expect(initialTrack.hasEmbeddedLyrics).toBe(false);

    const headers = { 'x-wavelet-session': sessionToken };

    // 在没有外挂文件时请求封面与歌词，应当正常返回 404
    const noCoverRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${initialTrack.id}/cover`,
      headers,
    });
    expect(noCoverRes.statusCode).toBe(404);

    const noLyrRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${initialTrack.id}/lyrics`,
      headers,
    });
    expect(noLyrRes.statusCode).toBe(404);

    // 2. 模拟外部工具后续在同目录下补齐了 folder.jpg 与 late_song.lrc
    const lateCover = path.join(lateDir, 'folder.jpg');
    const lateLyric = path.join(lateDir, 'late_song.lrc');
    fs.writeFileSync(lateCover, MOCK_JPEG);
    fs.writeFileSync(lateLyric, '[00:02.00] 动态后置补充的歌词');

    // 3. 验证接口层实时动态兜底 (无需触发全盘重扫即刻呈现)
    const runtimeCoverRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${initialTrack.id}/cover`,
      headers,
    });
    expect(runtimeCoverRes.statusCode).toBe(200);
    expect(runtimeCoverRes.headers['content-type']).toContain('image/jpeg');

    const runtimeLyrRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${initialTrack.id}/lyrics`,
      headers,
    });
    expect(runtimeLyrRes.statusCode).toBe(200);
    expect(JSON.parse(runtimeLyrRes.body).rawLrc).toContain('动态后置补充的歌词');

    // 4. 调用单曲热刷新接口验证持久化模型一致性
    const refreshRes = await app.inject({
      method: 'POST',
      url: `/api/tracks/${initialTrack.id}/refresh`,
      headers,
    });
    expect(refreshRes.statusCode).toBe(200);
    const refreshedTrack = JSON.parse(refreshRes.body).track;
    expect(refreshedTrack.hasEmbeddedCover).toBe(true);
    expect(refreshedTrack.hasEmbeddedLyrics).toBe(true);
  });

  it('场景 4：内嵌优先防御机制 (音频自身内嵌的封面与歌词绝不被同目录外挂篡改)', async () => {
    // 1. 使用真实带有内嵌封面的 TEST_AUDIO_PATH
    const embeddedTrackDir = path.join(sandbox.config.storage.libraryDir, 'EmbeddedPriorityAlbum');
    fs.mkdirSync(embeddedTrackDir, { recursive: true });
    const embeddedTrackFile = path.join(embeddedTrackDir, 'embedded_cover_track.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, embeddedTrackFile);

    // 2. 在同目录下故意放置一张不同的 cover.png (82字节的 mock png)
    const rogueCover = path.join(embeddedTrackDir, 'cover.png');
    fs.writeFileSync(rogueCover, MOCK_PNG);

    // 3. 执行曲库扫描
    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const embeddedTrack = trackRepo.findByPath(embeddedTrackFile);
    expect(embeddedTrack).not.toBeNull();
    if (!embeddedTrack) throw new Error('embeddedTrack must be defined');

    // 4. 请求封面接口：必须优先返回内嵌的高清大图 (272,878 字节)，而非外挂的 82 字节 MOCK_PNG
    const headers = { 'x-wavelet-session': sessionToken };
    const coverRes = await app.inject({
      method: 'GET',
      url: `/api/tracks/${embeddedTrack.id}/cover`,
      headers,
    });
    expect(coverRes.statusCode).toBe(200);
    expect(coverRes.rawPayload.length).toBe(272878);
    expect(coverRes.rawPayload.length).not.toBe(MOCK_PNG.length);
  });
});
