import fs from 'node:fs';
import path from 'node:path';
import {
  IntegrityGuard,
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

describe('Unit Test: Playlist Count Recalibration & Ghost Elimination (ISSUE-08)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let integrityGuard: IntegrityGuard;

  beforeAll(() => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository();
    playlistRepo = new PlaylistRepository();
    integrityGuard = new IntegrityGuard(trackRepo, playlistRepo);
  });

  afterAll(() => {
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：曲目物理彻底删除 (Purge) 自动触发歌单计数校准', async () => {
    // 1. 准备两首音频文件
    const file1 = path.join(sandbox.config.storage.libraryDir, 'recal_track1.flac');
    const file2 = path.join(sandbox.config.storage.libraryDir, 'recal_track2.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, file1);
    fs.writeFileSync(
      file2,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('extra_bytes_for_file2')])
    );

    // 2. 扫描入库
    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const track1 = trackRepo.findByPath(file1);
    const track2 = trackRepo.findByPath(file2);
    expect(track1).not.toBeNull();
    expect(track2).not.toBeNull();
    if (!track1 || !track2) throw new Error('tracks must be imported');

    // 3. 创建测试歌单并添加两首歌曲
    const customPlaylist = playlistRepo.create({
      name: '校准测试歌单A',
    });
    playlistRepo.addTracksToPlaylist(customPlaylist.id, [track1.id, track2.id]);

    let pl = playlistRepo.findById(customPlaylist.id);
    expect(pl?.trackCount).toBe(2);

    const defaultAll = playlistRepo.findDefault();
    const initialAllCount = defaultAll.trackCount;
    expect(initialAllCount).toBeGreaterThanOrEqual(2);

    // 4. 彻底物理擦除 track1
    const purged = integrityGuard.purgeTrackCompletely(track1.id);
    expect(purged).toBe(true);

    // 5. 验证歌单 track_count 自动精确递减，且查询无幽灵
    pl = playlistRepo.findById(customPlaylist.id);
    expect(pl?.trackCount).toBe(1);

    const updatedAll = playlistRepo.findDefault();
    expect(updatedAll.trackCount).toBe(initialAllCount - 1);

    const tracksInPl = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(tracksInPl).toHaveLength(1);
    expect(tracksInPl[0].id).toBe(track2.id);
  });

  it('场景 2：曲目移入回收站与恢复时的计数隔离校验', async () => {
    // 1. 准备第三首音频文件
    const file3 = path.join(sandbox.config.storage.libraryDir, 'recal_track3.flac');
    fs.writeFileSync(
      file3,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('extra_bytes_for_file3')])
    );
    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const track3 = trackRepo.findByPath(file3);
    expect(track3).not.toBeNull();
    if (!track3) throw new Error('track3 must be imported');

    // 2. 创建歌单并挂载 track3
    const customPlaylist = playlistRepo.create({
      name: '校准测试歌单B',
    });
    playlistRepo.addTrackToPlaylist(customPlaylist.id, track3.id);
    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(1);

    const trashBefore = playlistRepo.findTrash();
    const trashBeforeCount = trashBefore?.trackCount ?? 0;

    // 3. 移入回收站
    playlistRepo.trashTrack(track3.id);

    // 4. 验证普通歌单不计入 trashed 曲目，回收站精准递增
    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(0);
    const trashAfter = playlistRepo.findTrash();
    expect(trashAfter?.trackCount).toBe(trashBeforeCount + 1);

    // 5. 恢复曲目
    playlistRepo.restoreTrack(track3.id);
    const trashRestored = playlistRepo.findTrash();
    expect(trashRestored?.trackCount).toBe(trashBeforeCount);
  });

  it('场景 3：批量清理失联软缺失曲目 (purgeMissingTracks) 触发自动全量校准', async () => {
    // 1. 准备第四首音频文件
    const file4 = path.join(sandbox.config.storage.libraryDir, 'recal_track4.flac');
    fs.writeFileSync(
      file4,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('extra_bytes_for_file4')])
    );
    await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    const track4 = trackRepo.findByPath(file4);
    expect(track4).not.toBeNull();
    if (!track4) throw new Error('track4 must be imported');

    // 2. 加入自定义歌单
    const customPlaylist = playlistRepo.create({
      name: '校准测试歌单C',
    });
    playlistRepo.addTrackToPlaylist(customPlaylist.id, track4.id);
    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(1);

    // 3. 删除磁盘物理文件并标记为 isMissing
    fs.unlinkSync(file4);
    trackRepo.update(track4.id, {
      isMissing: true,
      missingAt: Date.now(),
      healthyStatus: 'missing',
    });

    // 4. 执行批量清理失联曲目
    const result = integrityGuard.purgeMissingTracks();
    expect(result.purgedCount).toBeGreaterThanOrEqual(1);
    expect(result.trackIds).toContain(track4.id);

    // 5. 验证歌单 track_count 自动校准为 0
    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(0);
    const tracks = playlistRepo.getPlaylistTracks(customPlaylist.id);
    expect(tracks).toHaveLength(0);
  });

  it('场景 4：目录文件夹 (Folder) 计数强制保底为 0', () => {
    const folder = playlistRepo.create({
      name: '测试目录节点',
      isFolder: true,
    });
    expect(folder.isFolder).toBe(true);
    expect(folder.trackCount).toBe(0);

    // 模拟人为或历史脏数据向数据库直接更新文件夹的 track_count
    const db = getDatabase();
    db.prepare('UPDATE playlists SET track_count = 99 WHERE id = ?').run(folder.id);
    expect(playlistRepo.findById(folder.id)?.trackCount).toBe(99);

    // 执行校准
    playlistRepo.recalibrateTrackCounts();

    // 验证目录文件夹被强制重置为 0
    expect(playlistRepo.findById(folder.id)?.trackCount).toBe(0);
  });

  it('场景 5：全量校准清理幽灵关系并保证所有歌单计数 1:1 精确', () => {
    const db = getDatabase();
    const customPlaylist = playlistRepo.create({
      name: '校准测试歌单D_幽灵清理',
    });

    // 1. 人为植入孤立的幽灵关联 (模拟外键未开启或跨版本迁移遗留的孤立关联)
    const ghostTrackId = 'ghost_track_999999';
    db.pragma('foreign_keys = OFF');
    db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, sort_order, added_at)
      VALUES (?, ?, 1.0, ?)
    `).run(customPlaylist.id, ghostTrackId, Date.now());
    db.pragma('foreign_keys = ON');

    // 人为令自定义歌单 track_count 变成 10
    db.prepare('UPDATE playlists SET track_count = 10 WHERE id = ?').run(customPlaylist.id);
    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(10);

    // 2. 执行全量校准
    const res = playlistRepo.recalibrateTrackCounts();
    expect(res.cleanedGhostRelations).toBeGreaterThanOrEqual(1);

    // 3. 验证幽灵关联已被清理，且歌单曲目数校准为 0
    const ghostRow = db
      .prepare('SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .get(customPlaylist.id, ghostTrackId);
    expect(ghostRow).toBeUndefined();

    expect(playlistRepo.findById(customPlaylist.id)?.trackCount).toBe(0);
    expect(playlistRepo.getPlaylistTracks(customPlaylist.id)).toHaveLength(0);
  });

  it('场景 6：清空回收站 (emptyTrash) 触发计数校准', () => {
    // 准备并入库曲目，随后移入回收站
    const fileTrash = path.join(sandbox.config.storage.libraryDir, 'recal_trash_track.flac');
    fs.writeFileSync(
      fileTrash,
      Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('extra_bytes_for_trash')])
    );
    trackRepo.insert({
      id: 'trk_trash_target',
      title: '回收测试曲目',
      artist: 'Artist',
      album: 'Album',
      duration: 10,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: fileTrash,
      fileSize: 1024,
      fileHash: 'dummy_hash_for_trash_test',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    playlistRepo.trashTrack('trk_trash_target');
    const trashPl = playlistRepo.findTrash();
    expect(trashPl?.trackCount).toBeGreaterThanOrEqual(1);

    // 执行清空回收站
    const emptyRes = playlistRepo.emptyTrash(integrityGuard);
    expect(emptyRes.purgedCount).toBeGreaterThanOrEqual(1);

    // 验证回收站已被清空且计数准确归零
    const trashAfter = playlistRepo.findTrash();
    expect(trashAfter?.trackCount).toBe(0);
    expect(playlistRepo.getPlaylistTracks('default_trash')).toHaveLength(0);
  });
});
