import fs from 'node:fs';
import path from 'node:path';
import {
  PlaylistRepository,
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

describe('Unit Test: Incremental Metadata Resync & Hot Refresh (ISSUE-06: 外部标签与封面增量同步)', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository(getDatabase());
    playlistRepo = new PlaylistRepository(getDatabase());

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

  it('场景 1：单曲独立热刷新 (POST /api/tracks/:id/refresh 原地热更新并 100% 保持 ID、收藏与播放量)', async () => {
    // 1. 准备初始物理文件并导入曲库
    const audioFile = path.join(sandbox.config.storage.libraryDir, 'single_refresh_demo.flac');
    fs.writeFileSync(
      audioFile,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('single_refresh_seed')])
    );

    const initialSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(initialSync.imported).toBeGreaterThanOrEqual(1);

    const originalTrack = trackRepo.findByPath(audioFile);
    expect(originalTrack).not.toBeNull();
    if (!originalTrack) throw new Error('originalTrack must be defined');

    const originalTrackId = originalTrack.id;
    const initialFileSize = originalTrack.fileSize;

    // 2. 标记红心收藏、加入自定义歌单、记录播放次数
    const favorites = playlistRepo.findFavorites();
    expect(favorites).not.toBeNull();
    if (!favorites) throw new Error('favorites must be defined');
    playlistRepo.addTrackToPlaylist(favorites.id, originalTrackId);

    const customPlaylist = playlistRepo.create({ name: '测试单曲刷新歌单' });
    playlistRepo.addTrackToPlaylist(customPlaylist.id, originalTrackId, 1);

    trackRepo.recordPlayback(originalTrackId);
    trackRepo.recordPlayback(originalTrackId);
    trackRepo.recordPlayback(originalTrackId);

    const trackBefore = trackRepo.findById(originalTrackId);
    expect(trackBefore?.playCount).toBe(3);
    expect(playlistRepo.isFavorite(originalTrackId)).toBe(true);
    const customTracksBefore = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(customTracksBefore.map((t) => t.id)).toContain(originalTrackId);

    // 3. 模拟外部修改物理文件（向文件追加数据改变 size 与 mtime）
    fs.appendFileSync(audioFile, Buffer.from('external_id3_tag_update_data'));
    const newStat = fs.statSync(audioFile);
    expect(newStat.size).toBeGreaterThan(initialFileSize);

    // 4. 调用 POST /api/tracks/:id/refresh 接口
    const headers = { 'x-wavelet-session': sessionToken };
    const refreshRes = await app.inject({
      method: 'POST',
      url: `/api/tracks/${originalTrackId}/refresh`,
      headers,
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = JSON.parse(refreshRes.body);
    expect(body.success).toBe(true);
    expect(body.track).not.toBeNull();
    expect(body.track.id).toBe(originalTrackId); // ID 严格保持不变
    expect(body.track.isFavorite).toBe(true); // 收藏状态保持不变
    expect(body.track.fileSize).toBe(newStat.size); // 文件尺寸原地更新

    // 5. 校验数据库中的持久化状态
    const trackAfter = trackRepo.findById(originalTrackId);
    expect(trackAfter).not.toBeNull();
    expect(trackAfter?.id).toBe(originalTrackId);
    expect(trackAfter?.playCount).toBe(3); // 播放次数未被覆盖清零
    expect(trackAfter?.fileSize).toBe(newStat.size);
    expect(playlistRepo.isFavorite(originalTrackId)).toBe(true);
    const customTracksAfter = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(customTracksAfter.map((t) => t.id)).toContain(originalTrackId);
  });

  it('场景 2：曲库增量扫描热刷新 (mtime 与 fileSize 脏检测，快速跳过未改动文件)', async () => {
    // 1. 创建两个具有独立特征的文件：fileA (保持不变) 与 fileB (模拟外部修改)
    const fileA = path.join(sandbox.config.storage.libraryDir, 'track_keep_same.flac');
    const fileB = path.join(sandbox.config.storage.libraryDir, 'track_will_update.flac');
    fs.writeFileSync(
      fileA,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('track_a_unique_seed')])
    );
    fs.writeFileSync(
      fileB,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('track_b_unique_seed')])
    );

    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const trackBBefore = trackRepo.findByPath(fileB);
    expect(trackBBefore).not.toBeNull();
    if (!trackBBefore) throw new Error('trackBBefore must be defined');

    // 2. 仅修改 fileB 的物理尺寸和 mtime
    const delayTime = Date.now() + 2000;
    fs.appendFileSync(fileB, Buffer.from('flac_metadata_padding_stream'));
    fs.utimesSync(fileB, new Date(delayTime), new Date(delayTime));

    // 3. 执行常规增量扫描
    const incrementalSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(incrementalSync.refreshed).toBeGreaterThanOrEqual(1);

    const trackBAfter = trackRepo.findById(trackBBefore.id);
    expect(trackBAfter).not.toBeNull();
    expect(trackBAfter?.id).toBe(trackBBefore.id); // 原地更新
    expect(trackBAfter?.fileSize).toBe(fs.statSync(fileB).size);

    // 4. 使用 resyncMetadata: true 显式强制刷新
    const forceResync = await syncMusicsDirectory(sandbox.config.storage.libraryDir, {
      resyncMetadata: true,
    });
    // 目录中所有曲目都会被原地热刷新标签 (>= 3 首: single_refresh + track_a + track_b)
    expect(forceResync.refreshed).toBeGreaterThanOrEqual(3);
  });

  it('场景 3：网关全局刷新接口 POST /api/import/musics 传递 resyncMetadata', async () => {
    const headers = { 'x-wavelet-session': sessionToken };
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/musics',
      headers,
      payload: {
        resyncMetadata: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(typeof body.refreshedCount).toBe('number');
    expect(body.refreshedCount).toBeGreaterThanOrEqual(3);
  });

  it('场景 4：边界与失联安全防御 (当物理文件已被移除时，刷新接口优雅拦截并返回 404/错误)', async () => {
    // 1. 查找一首歌曲并将其物理文件移动走
    const fileA = path.join(sandbox.config.storage.libraryDir, 'track_keep_same.flac');
    const trackA = trackRepo.findByPath(fileA);
    expect(trackA).not.toBeNull();
    if (!trackA) throw new Error('trackA must be defined');

    const tempOuter = path.join(sandbox.rootDir, 'moved_out.flac');
    fs.renameSync(fileA, tempOuter);

    // 2. 请求刷新已失联曲目
    const headers = { 'x-wavelet-session': sessionToken };
    const res = await app.inject({
      method: 'POST',
      url: `/api/tracks/${trackA.id}/refresh`,
      headers,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('物理文件在磁盘上不存在');

    // 验证数据库中该曲目已被安全标记为失联
    const trackAfter = trackRepo.findById(trackA.id);
    expect(trackAfter?.isMissing).toBe(true);

    // 3. 请求刷新不存在的曲目 ID
    const notFoundRes = await app.inject({
      method: 'POST',
      url: '/api/tracks/trk_completely_unknown/refresh',
      headers,
    });
    expect(notFoundRes.statusCode).toBe(404);

    // 恢复文件以便后续清理
    fs.renameSync(tempOuter, fileA);
  });
});
