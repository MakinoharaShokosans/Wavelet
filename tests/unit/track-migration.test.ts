import fs from 'node:fs';
import path from 'node:path';
import {
  PlaylistRepository,
  TrackRepository,
  closeDatabase,
  getDatabase,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Track Move & Rename Tracking (ISSUE-02: 曲目移动与重命名追踪保活)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  beforeAll(() => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository();
    playlistRepo = new PlaylistRepository();
  });

  afterAll(() => {
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：同目录就地重命名保活测试 (In-Place File Rename)', async () => {
    // 1. 准备初始真实物理音频
    const initialFlac = path.join(sandbox.config.storage.libraryDir, '01.original.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, initialFlac);

    // 2. 初始扫描入库
    const initialSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(initialSync.imported).toBeGreaterThanOrEqual(1);

    const originalTrack = trackRepo.findByPath(initialFlac);
    expect(originalTrack).not.toBeNull();
    if (!originalTrack) throw new Error('originalTrack must be defined');
    const originalTrackId = originalTrack.id;

    // 3. 标记心动收藏 (default_favorites) 并模拟播放指标
    const favorites = playlistRepo.findFavorites();
    expect(favorites).not.toBeNull();
    if (!favorites) throw new Error('favorites playlist must be defined');
    playlistRepo.addTrackToPlaylist(favorites.id, originalTrackId);

    // 人为增加播放记录
    trackRepo.recordPlayback(originalTrackId);
    trackRepo.recordPlayback(originalTrackId);
    const beforeRename = trackRepo.findById(originalTrackId);
    expect(beforeRename?.playCount).toBe(2);

    // 验证此时在心动收藏中
    expect(playlistRepo.isFavorite(originalTrackId)).toBe(true);

    // 4. 模拟外部重命名文件
    const renamedFlac = path.join(
      sandbox.config.storage.libraryDir,
      '01. 彼女は旅に出る_renamed.flac'
    );
    fs.renameSync(initialFlac, renamedFlac);

    // 5. 触发曲库同步
    const resync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(resync.migrated).toBe(1);

    // 6. 核心指标验证
    // a. 原始 ID 保持不变
    const afterRename = trackRepo.findById(originalTrackId);
    expect(afterRename).not.toBeNull();
    expect(afterRename?.id).toBe(originalTrackId);

    // b. 物理路径已更新为新文件路径
    expect(afterRename?.filePath).toBe(renamedFlac);

    // c. 心动收藏依然保留（红心不掉）
    expect(playlistRepo.isFavorite(originalTrackId)).toBe(true);

    // d. 播放次数保留（不归零）
    expect(afterRename?.playCount).toBe(2);

    // e. 绝不被重复打入未集成歌单 (如果未集成歌单存在)
    const unintegrated = playlistRepo.findUnintegrated();
    if (unintegrated) {
      // 确认未被重复污染
      const allUnintegrated = playlistRepo.getPlaylistTracks(unintegrated.id);
      const duplicateCount = allUnintegrated.filter((t) => t.id === originalTrackId).length;
      expect(duplicateCount).toBeLessThanOrEqual(1);
    }
  });

  it('场景 2：跨子目录深层移动保活测试 (Deep Subdirectory Move)', async () => {
    // 1. 创建自定义用户歌单并关联
    const customPlaylist = playlistRepo.create({
      name: 'J-Pop 精选',
      description: '发烧友精选集',
    });

    const currentTrack = trackRepo.getAllTracks()[0];
    expect(currentTrack).toBeDefined();
    playlistRepo.addTrackToPlaylist(customPlaylist.id, currentTrack.id, 1);

    // 2. 模拟外部建立深层嵌套子文件夹并移动文件
    const deepDir = path.join(
      sandbox.config.storage.libraryDir,
      'Favorites',
      '2026',
      'HiRes_Lossless'
    );
    fs.mkdirSync(deepDir, { recursive: true });

    const newDeepPath = path.join(deepDir, path.basename(currentTrack.filePath));
    fs.renameSync(currentTrack.filePath, newDeepPath);

    // 3. 执行同步
    const syncResult = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncResult.migrated).toBe(1);

    // 4. 验证自定义歌单与曲目归属
    const updatedTrack = trackRepo.findById(currentTrack.id);
    expect(updatedTrack?.filePath).toBe(newDeepPath);

    // 自定义歌单内的引用依然完好
    const playlistTracks = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(playlistTracks.some((t) => t.id === currentTrack.id)).toBe(true);
  });

  it('场景 3：批量混合操作测试 (Batch: Rename + Move + Delete)', async () => {
    // 1. 在沙箱建立 3 个不同音频实例
    const pathA = path.join(sandbox.config.storage.libraryDir, 'track_A.flac');
    const pathB = path.join(sandbox.config.storage.libraryDir, 'track_B.flac');
    const pathC = path.join(sandbox.config.storage.libraryDir, 'track_C.flac');

    // 借用现有测试音频内容，为测试区分度增加微小差异避免哈希完全碰撞
    const baseAudio = fs.readFileSync(TEST_AUDIO_PATH);
    fs.writeFileSync(pathA, Buffer.concat([baseAudio, Buffer.from('diff_A')]));
    fs.writeFileSync(pathB, Buffer.concat([baseAudio, Buffer.from('diff_B')]));
    fs.writeFileSync(pathC, Buffer.concat([baseAudio, Buffer.from('diff_C')]));

    await syncMusicsDirectory(sandbox.config.storage.libraryDir);

    const trackA = trackRepo.findByPath(pathA);
    const trackB = trackRepo.findByPath(pathB);
    const trackC = trackRepo.findByPath(pathC);
    expect(trackA).toBeDefined();
    expect(trackB).toBeDefined();
    expect(trackC).toBeDefined();
    if (!trackA || !trackB || !trackC) throw new Error('Tracks A, B, C must be defined');

    // 2. 批量并发物理变动：
    // A: 改名
    const pathARenamed = path.join(sandbox.config.storage.libraryDir, 'track_A_renamed.flac');
    fs.renameSync(pathA, pathARenamed);

    // B: 移动至子目录
    const subDir = path.join(sandbox.config.storage.libraryDir, 'BatchSub');
    fs.mkdirSync(subDir, { recursive: true });
    const pathBMoved = path.join(subDir, 'track_B_moved.flac');
    fs.renameSync(pathB, pathBMoved);

    // C: 彻底删除
    fs.unlinkSync(pathC);

    // 3. 执行全盘同步
    const batchSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);

    // A 与 B 应成功指纹识别迁移 (migrated >= 2)
    expect(batchSync.migrated).toBeGreaterThanOrEqual(2);
    // C 应被判定为真正失联注销 (pruned >= 1)
    expect(batchSync.pruned).toBeGreaterThanOrEqual(1);

    // 4. 验证数据库状态
    expect(trackRepo.findById(trackA.id)?.filePath).toBe(pathARenamed);
    expect(trackRepo.findById(trackB.id)?.filePath).toBe(pathBMoved);
    expect(trackRepo.findById(trackC.id)).toBeNull();
  });

  it('场景 4：零哈希快径 (Zero-Hash Fast Path) 幂等性验证', async () => {
    // 物理文件不发生任何变动时，二次同步应零迁移、零注销、零新增
    const idleSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(idleSync.migrated).toBe(0);
    expect(idleSync.pruned).toBe(0);
    expect(idleSync.scanned).toBe(idleSync.imported);
  });
});
