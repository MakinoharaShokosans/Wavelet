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
import { createTestSandbox } from '../test-helper.js';

describe('Integration Test: Fastify Gateway & Session Guard', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    new TrackRepository(getDatabase()).insert({
      id: 'trk_gateway_01',
      title: 'Gateway Track',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/gateway_01.flac',
      fileSize: 1000,
      fileHash: 'hash_gw',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    app = await createServer();
  });

  afterAll(async () => {
    await app.close();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('未携带有效 Local-Session-Key 时应当被安全守卫拦截并返回 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/tracks',
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toContain('未授权');
  });

  it('调用 /api/auth/token 应当正常换取单次运行时的会话密钥', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.token.length).toBe(64);
    sessionToken = body.token;
  });

  it('携带认证令牌时应当能正常调用 REST 接口', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 获取曲目列表
    const tracksRes = await app.inject({
      method: 'GET',
      url: '/api/tracks',
      headers,
    });
    expect(tracksRes.statusCode).toBe(200);
    const tracksData = JSON.parse(tracksRes.body);
    expect(Array.isArray(tracksData.items)).toBe(true);

    // 2. 获取歌单列表
    const playlistsRes = await app.inject({
      method: 'GET',
      url: '/api/playlists',
      headers,
    });
    expect(playlistsRes.statusCode).toBe(200);
    const playlistsData = JSON.parse(playlistsRes.body);
    expect(Array.isArray(playlistsData)).toBe(true);
    expect(playlistsData.some((p: { id: string }) => p.id === 'default_all_tracks')).toBe(true);

    // 3. 获取声卡设备列表
    const devicesRes = await app.inject({
      method: 'GET',
      url: '/api/player/devices',
      headers,
    });
    expect(devicesRes.statusCode).toBe(200);
    const devicesData = JSON.parse(devicesRes.body);
    expect(Array.isArray(devicesData.devices)).toBe(true);

    // 4. 获取播放器状态
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/player/status',
      headers,
    });
    expect(statusRes.statusCode).toBe(200);
    const statusData = JSON.parse(statusRes.body);
    expect(statusData.state).toBe('stopped');

    // 5. 调整播放器音量
    const volumeRes = await app.inject({
      method: 'POST',
      url: '/api/player/volume',
      headers,
      payload: { volume: 0.65 },
    });
    expect(volumeRes.statusCode).toBe(200);
    const volumeData = JSON.parse(volumeRes.body);
    expect(volumeData.status.volume).toBe(0.65);
  });

  it('调用歌单 API 应当支持多层级嵌套文件夹创建、树状列表检索与面包屑导航', async () => {
    const headers = { 'x-wavelet-session': sessionToken };

    // 1. 创建分类根文件夹
    const folderRes = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      headers,
      payload: { name: 'OST 目录', isFolder: true },
    });
    expect(folderRes.statusCode).toBe(200);
    const folder = JSON.parse(folderRes.body);
    expect(folder.isFolder).toBe(true);
    expect(folder.parentId).toBeUndefined();

    // 2. 在分类目录下创建子歌单
    const childRes = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      headers,
      payload: { name: '游戏原声', parentId: folder.id },
    });
    expect(childRes.statusCode).toBe(200);
    const child = JSON.parse(childRes.body);
    expect(child.parentId).toBe(folder.id);

    // 3. 获取完整目录树 /api/playlists/tree
    const treeRes = await app.inject({
      method: 'GET',
      url: '/api/playlists/tree',
      headers,
    });
    expect(treeRes.statusCode).toBe(200);
    const tree = JSON.parse(treeRes.body);
    const ostNode = tree.find((n: { id: string }) => n.id === folder.id);
    expect(ostNode).toBeDefined();
    expect(ostNode.children.length).toBe(1);
    expect(ostNode.children[0].id).toBe(child.id);

    // 4. 获取子歌单详情并检验面包屑导航
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/playlists/${child.id}`,
      headers,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.body);
    expect(detail.breadcrumbs).toBeDefined();
    expect(detail.breadcrumbs.length).toBe(2);
    expect(detail.breadcrumbs[0].id).toBe(folder.id);
    expect(detail.breadcrumbs[1].id).toBe(child.id);

    // 5. 互斥校验 API：禁止向目录文件夹放入歌曲，应返回 400
    const addTrackToFolderRes = await app.inject({
      method: 'POST',
      url: `/api/playlists/${folder.id}/tracks`,
      headers,
      payload: { trackId: 'trk_gateway_01' },
    });
    expect(addTrackToFolderRes.statusCode).toBe(400);
    const folderErr = JSON.parse(addTrackToFolderRes.body);
    expect(folderErr.error).toContain('目录文件夹');

    // 6. 互斥校验 API：向子歌单放入歌曲后，禁止在其下再创建子歌单，应返回 400
    const addTrackRes = await app.inject({
      method: 'POST',
      url: `/api/playlists/${child.id}/tracks`,
      headers,
      payload: { trackId: 'trk_gateway_01' },
    });
    expect(addTrackRes.statusCode).toBe(200);

    const addSubToSongRes = await app.inject({
      method: 'POST',
      url: '/api/playlists',
      headers,
      payload: { name: '非法多级嵌套', parentId: child.id },
    });
    expect(addSubToSongRes.statusCode).toBe(400);
    const subErr = JSON.parse(addSubToSongRes.body);
    expect(subErr.error).toContain('已包含歌曲');
  });
});
