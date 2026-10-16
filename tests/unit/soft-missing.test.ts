import fs from 'node:fs';
import path from 'node:path';
import {
  IntegrityGuard,
  PlaybackRouter,
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

describe('Unit Test: Soft Missing & Auto-Revival (ISSUE-03: 软缺失标记与失联挽救机制)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let integrityGuard: IntegrityGuard;
  let playbackRouter: PlaybackRouter;

  beforeAll(() => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository();
    playlistRepo = new PlaylistRepository();
    integrityGuard = new IntegrityGuard(trackRepo);
    playbackRouter = new PlaybackRouter(trackRepo);
  });

  afterAll(() => {
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：临时挪走物理文件触发软缺失标记 (永不硬删除，保留歌单与红心)', async () => {
    // 1. 拷贝物理音频至曲库 (准备两首歌曲，其中一首用于测试挪走失联，另一首常驻)
    const initialFlac = path.join(sandbox.config.storage.libraryDir, '01.soft_missing_demo.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, initialFlac);
    const anchorFlac = path.join(sandbox.config.storage.libraryDir, '00.anchor_track.flac');
    fs.writeFileSync(
      anchorFlac,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('anchor_track_bytes')])
    );

    // 2. 初始扫描入库
    const initialSync = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(initialSync.imported).toBe(2);

    const originalTrack = trackRepo.findByPath(initialFlac);
    expect(originalTrack).not.toBeNull();
    if (!originalTrack) throw new Error('originalTrack must be defined');
    const originalTrackId = originalTrack.id;

    // 3. 关联红心收藏与自定义歌单，并模拟播放历史
    const favorites = playlistRepo.findFavorites();
    expect(favorites).not.toBeNull();
    if (!favorites) throw new Error('favorites must be defined');
    playlistRepo.addTrackToPlaylist(favorites.id, originalTrackId);

    const customPlaylist = playlistRepo.create({
      name: '软缺失保护测试歌单',
    });
    playlistRepo.addTrackToPlaylist(customPlaylist.id, originalTrackId, 1);

    trackRepo.recordPlayback(originalTrackId);
    trackRepo.recordPlayback(originalTrackId);

    // 4. 模拟临时挪走文件至曲库外临时目录
    const tempBackupPath = path.join(sandbox.rootDir, 'temp_backup_demo.flac');
    fs.renameSync(initialFlac, tempBackupPath);
    expect(fs.existsSync(initialFlac)).toBe(false);

    // 5. 再次触发同步扫描 (此时文件缺失)
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.missing).toBe(1);
    expect(syncRes.pruned).toBe(0);

    // 6. 验证软缺失核心状态：
    // a. 数据库记录依然存在，ID 未变
    const trackAfterMissing = trackRepo.findById(originalTrackId);
    expect(trackAfterMissing).not.toBeNull();
    if (!trackAfterMissing) throw new Error('trackAfterMissing must be defined');
    expect(trackAfterMissing.id).toBe(originalTrackId);

    // b. 软缺失标志激活
    expect(trackAfterMissing.isMissing).toBe(true);
    expect(typeof trackAfterMissing.missingAt).toBe('number');

    // c. 红心收藏与自定义歌单依然完好
    expect(playlistRepo.isFavorite(originalTrackId)).toBe(true);
    const customTracks = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(customTracks.some((t) => t.id === originalTrackId)).toBe(true);

    // d. 播放记录未被清空
    expect(trackAfterMissing.playCount).toBe(2);
  });

  it('场景 2：物理文件放回原位自动满血复活 (Auto-Revival)', async () => {
    const initialFlac = path.join(sandbox.config.storage.libraryDir, '01.soft_missing_demo.flac');
    const tempBackupPath = path.join(sandbox.rootDir, 'temp_backup_demo.flac');

    // 1. 将文件放回原物理位置
    fs.renameSync(tempBackupPath, initialFlac);
    expect(fs.existsSync(initialFlac)).toBe(true);

    // 2. 再次执行扫描
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.restored).toBe(1);

    // 3. 验证自动复活状态：
    const trackAfterRevival = trackRepo.findByPath(initialFlac);
    expect(trackAfterRevival).not.toBeNull();
    if (!trackAfterRevival) throw new Error('trackAfterRevival must be defined');

    expect(trackAfterRevival.isMissing).toBe(false);
    expect(trackAfterRevival.missingAt).toBeUndefined();
    expect(trackAfterRevival.playCount).toBe(2);
  });

  it('场景 3：播放运行时探查即刻持久化软失效 (Playback Defense)', async () => {
    // 1. 准备新物理音频 (具有独立哈希指纹，防止与曲目 1 碰撞产生误迁移)
    const playTargetFlac = path.join(sandbox.config.storage.libraryDir, '02.playback_missing.flac');
    const baseAudio = fs.readFileSync(TEST_AUDIO_PATH);
    fs.writeFileSync(playTargetFlac, Buffer.concat([baseAudio, Buffer.from('unique_track_02')]));

    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const track = trackRepo.findByPath(playTargetFlac);
    expect(track).not.toBeNull();
    if (!track) throw new Error('track must be defined');

    // 2. 物理彻底删除该文件
    fs.unlinkSync(playTargetFlac);
    expect(fs.existsSync(playTargetFlac)).toBe(false);

    // 3. 触发播放：命中开流前防御检查
    await playbackRouter.play(track.id);

    // 4. 验证数据库中该曲目已即刻被标记为软失效
    const checked = trackRepo.findById(track.id);
    expect(checked).not.toBeNull();
    if (!checked) throw new Error('checked must be defined');
    expect(checked.isMissing).toBe(true);
    expect(typeof checked.missingAt).toBe('number');
  });

  it('场景 4：用户主动批量清理已失联曲目 (User-Controlled Prune Missing)', () => {
    // 1. 在数据库中已存在场景 3 产生的软缺失曲目
    const missingTracksBefore = trackRepo.getMissingTracks();
    expect(missingTracksBefore.length).toBeGreaterThanOrEqual(1);

    // 2. 执行用户主动清理
    const pruneResult = integrityGuard.purgeMissingTracks();
    expect(pruneResult.purgedCount).toBeGreaterThanOrEqual(1);

    // 3. 验证失联曲目已彻底清除
    const missingTracksAfter = trackRepo.getMissingTracks();
    expect(missingTracksAfter.length).toBe(0);

    // 4. 场景 1 中已复活的正常曲目依然完好
    const intactTrack = trackRepo.findByPath(
      path.join(sandbox.config.storage.libraryDir, '01.soft_missing_demo.flac')
    );
    expect(intactTrack).not.toBeNull();
  });
});
