import fs from 'node:fs';
import path from 'node:path';
import {
  Database,
  PlaylistRepository,
  TrackRepository,
  getConfig,
  runMigrations,
} from '@wavelet/backend';
import type { Track } from '@wavelet/shared';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unit Test: Trash Playlist, Track Metadata & Deletion Safeguards', () => {
  let db: Database.Database;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  const createDummyTrack = (id: string, title = 'Sample Track'): Track => ({
    id,
    title,
    artist: 'Sample Artist',
    album: 'Sample Album',
    duration: 200,
    bitrate: 320000,
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    filePath: `/tmp/music_${id}.flac`,
    fileSize: 1024 * 1024,
    fileHash: `hash_${id}`,
    hasEmbeddedCover: false,
    hasEmbeddedLyrics: false,
    healthyStatus: 'healthy',
    isTrashed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    trackRepo = new TrackRepository(db);
    playlistRepo = new PlaylistRepository(db);
  });

  it('Migration 004 应当成功初始化“回收歌单”系统预置歌单及 tracks.is_trashed 字段', () => {
    const trash = playlistRepo.findTrash();
    expect(trash).not.toBeNull();
    expect(trash?.id).toBe('default_trash');
    expect(trash?.name).toBe('回收');
    expect(trash?.isDefault).toBe(true);

    const track = createDummyTrack('trk_mig_test');
    trackRepo.insert(track);

    const fetched = trackRepo.findById('trk_mig_test');
    expect(fetched).not.toBeNull();
    expect(fetched?.isTrashed).toBe(false);
  });

  it('歌曲移入回收歌单：应当仅脱离普通歌单并加入回收歌单，严禁删除本地物理文件', () => {
    const track = createDummyTrack('trk_trash_01', 'Song to Trash');
    trackRepo.insert(track);

    // 创建用户自定义歌单并挂载歌曲
    const customPl = playlistRepo.create('我的发烧精选');
    playlistRepo.addTrackToPlaylist('default_all_tracks', track.id);
    playlistRepo.addTrackToPlaylist('default_favorites', track.id);
    playlistRepo.addTrackToPlaylist(customPl.id, track.id);

    expect(playlistRepo.getPlaylistTracks('default_all_tracks').length).toBe(1);
    expect(playlistRepo.getPlaylistTracks(customPl.id).length).toBe(1);
    expect(playlistRepo.findTrash()?.trackCount).toBe(0);

    // 执行移入回收歌单操作
    playlistRepo.trashTrack(track.id);

    // 1. 验证曲目 isTrashed 状态
    const trashedTrack = trackRepo.findById(track.id);
    expect(trashedTrack?.isTrashed).toBe(true);

    // 2. 验证曲目已从普通歌单脱离
    expect(playlistRepo.getPlaylistTracks('default_all_tracks').length).toBe(0);
    expect(playlistRepo.getPlaylistTracks('default_favorites').length).toBe(0);
    expect(playlistRepo.getPlaylistTracks(customPl.id).length).toBe(0);

    // 3. 验证回收歌单包含该曲目
    const trashTracks = playlistRepo.getPlaylistTracks('default_trash');
    expect(trashTracks.length).toBe(1);
    expect(trashTracks[0].id).toBe(track.id);
    expect(playlistRepo.findTrash()?.trackCount).toBe(1);

    // 4. 验证普通曲库检索无法查询到回收曲目
    const searchRes = trackRepo.findAll({ keyword: 'Song to Trash' });
    expect(searchRes.items.length).toBe(0);

    // 5. 验证指定 trashed: true 可以准确检索回收曲目
    const trashedSearch = trackRepo.findAll({ trashed: true });
    expect(trashedSearch.items.length).toBe(1);
    expect(trashedSearch.items[0].id).toBe(track.id);
  });

  it('歌曲从回收歌单恢复：应当挂载回全部音乐与未集成歌单，并重置 isTrashed', () => {
    const track = createDummyTrack('trk_restore_01', 'Restored Track');
    trackRepo.insert(track);

    playlistRepo.addTrackToPlaylist('default_all_tracks', track.id);
    playlistRepo.trashTrack(track.id);

    expect(playlistRepo.getPlaylistTracks('default_trash').length).toBe(1);

    // 执行恢复
    playlistRepo.restoreTrack(track.id);

    // 1. 验证 isTrashed 恢复为 false
    const restored = trackRepo.findById(track.id);
    expect(restored?.isTrashed).toBe(false);

    // 2. 验证已从回收歌单移除
    expect(playlistRepo.getPlaylistTracks('default_trash').length).toBe(0);
    expect(playlistRepo.findTrash()?.trackCount).toBe(0);

    // 3. 验证重新加入全部音乐与未集成歌单待重新归类
    expect(playlistRepo.getPlaylistTracks('default_all_tracks').length).toBe(1);
    expect(playlistRepo.getPlaylistTracks('default_unintegrated_tracks').length).toBe(1);
  });

  it('清空回收歌单：批量彻底物理删除回收歌单内的全部曲目', () => {
    const track1 = createDummyTrack('trk_purge_01');
    const track2 = createDummyTrack('trk_purge_02');
    trackRepo.insert(track1);
    trackRepo.insert(track2);

    playlistRepo.trashTrack(track1.id);
    playlistRepo.trashTrack(track2.id);

    expect(playlistRepo.findTrash()?.trackCount).toBe(2);

    const purgedIds: string[] = [];
    const mockIntegrityGuard = {
      purgeTrackCompletely: (id: string) => {
        purgedIds.push(id);
        trackRepo.delete(id);
        return true;
      },
    };

    const { purgedCount } = playlistRepo.emptyTrash(mockIntegrityGuard);
    expect(purgedCount).toBe(2);
    expect(purgedIds).toContain('trk_purge_01');
    expect(purgedIds).toContain('trk_purge_02');

    expect(trackRepo.findById('trk_purge_01')).toBeNull();
    expect(trackRepo.findById('trk_purge_02')).toBeNull();
    expect(playlistRepo.findTrash()?.trackCount).toBe(0);
  });

  it('曲目基础元数据与内嵌封面标记修改', () => {
    const track = createDummyTrack('trk_meta_01', 'Original Title');
    trackRepo.insert(track);

    // 修改标题、艺术家、专辑、专辑艺术家与封面标记
    trackRepo.update(track.id, {
      title: 'Updated Title',
      artist: 'New Artist',
      album: 'New Album',
      albumArtist: 'New Album Artist',
      hasEmbeddedCover: true,
    });

    const updated = trackRepo.findById(track.id);
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.artist).toBe('New Artist');
    expect(updated?.album).toBe('New Album');
    expect(updated?.albumArtist).toBe('New Album Artist');
    expect(updated?.hasEmbeddedCover).toBe(true);
  });

  it('歌单删除安全保护机制：严禁删除系统默认歌单，支持删除自定义歌单', () => {
    // 1. 系统歌单受保护
    expect(() => playlistRepo.delete('default_all_tracks')).toThrow(
      '系统默认“全部音乐”歌单禁止删除'
    );
    expect(() => playlistRepo.delete('default_favorites')).toThrow('系统默认歌单禁止删除');
    expect(() => playlistRepo.delete('default_unintegrated_tracks')).toThrow(
      '系统默认歌单禁止删除'
    );
    expect(() => playlistRepo.delete('default_trash')).toThrow('系统默认歌单禁止删除');

    // 2. 自定义歌单可正常删除
    const custom = playlistRepo.create('可删除歌单');
    expect(playlistRepo.findById(custom.id)).not.toBeNull();

    const deleted = playlistRepo.delete(custom.id);
    expect(deleted).toBe(true);
    expect(playlistRepo.findById(custom.id)).toBeNull();
  });

  it('歌单封面物理拷贝机制：指定外部封面路径时应当自动物理拷贝至应用受控存储', () => {
    const tempExternalCover = path.join('/tmp', `ext_cover_${Date.now()}.png`);
    fs.writeFileSync(tempExternalCover, Buffer.from('FAKE_EXTERNAL_IMAGE_DATA'));

    try {
      const playlist = playlistRepo.create('精选民谣', undefined, {
        coverImagePath: tempExternalCover,
      });

      const coverPath = playlist.coverImagePath || '';
      expect(coverPath).not.toBe('');
      expect(coverPath).not.toBe(tempExternalCover);
      expect(fs.existsSync(coverPath)).toBe(true);
      expect(fs.readFileSync(coverPath).toString()).toBe('FAKE_EXTERNAL_IMAGE_DATA');
    } finally {
      if (fs.existsSync(tempExternalCover)) {
        fs.unlinkSync(tempExternalCover);
      }
    }
  });

  it('歌单封面从曲目一键拷贝机制：应当支持从指定或首首曲目物理拷贝封面文件', () => {
    const track = createDummyTrack('trk_cover_01', 'Cover Song');
    trackRepo.insert(track);

    const coversDir = path.join(getConfig().storage.cacheDir, 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    const trackCoverPath = path.join(coversDir, `${track.fileHash}.webp`);
    fs.writeFileSync(trackCoverPath, Buffer.from('TRACK_COVER_ART_BYTES'));

    const playlist = playlistRepo.create('轻音乐集');
    playlistRepo.addTrackToPlaylist(playlist.id, track.id);

    // 一键从曲目拷贝封面
    const targetCoverPath = playlistRepo.copyCoverFromTrack(playlist.id, track.id);
    expect(targetCoverPath).toBe(path.join(coversDir, `pl_${playlist.id}.webp`));
    expect(fs.existsSync(targetCoverPath)).toBe(true);
    expect(fs.readFileSync(targetCoverPath).toString()).toBe('TRACK_COVER_ART_BYTES');

    const updatedPl = playlistRepo.findById(playlist.id);
    expect(updatedPl?.coverImagePath).toBe(targetCoverPath);

    // 清理模拟文件
    if (fs.existsSync(trackCoverPath)) fs.unlinkSync(trackCoverPath);
    if (fs.existsSync(targetCoverPath)) fs.unlinkSync(targetCoverPath);
  });
});
