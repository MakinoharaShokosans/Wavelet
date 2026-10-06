import { Database, PlaylistRepository, TrackRepository, runMigrations } from '@wavelet/backend';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unit Test: Smart Playlists, Unintegrated Lifecycle & Favorites', () => {
  let db: Database.Database;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    trackRepo = new TrackRepository(db);
    playlistRepo = new PlaylistRepository(db);
  });

  it('Migration 003 应当成功初始化“未集成歌单”与“心动收藏”预置系统歌单', () => {
    const unintegrated = playlistRepo.findUnintegrated();
    expect(unintegrated).not.toBeNull();
    expect(unintegrated?.id).toBe('default_unintegrated_tracks');
    expect(unintegrated?.isDefault).toBe(true);

    const favorites = playlistRepo.findFavorites();
    expect(favorites).not.toBeNull();
    expect(favorites?.id).toBe('default_favorites');
    expect(favorites?.isDefault).toBe(true);
  });

  it('未集成歌单生命周期：新歌加入自定义歌单时应自动从未集成歌单脱离移出', () => {
    // 注入曲目
    trackRepo.insert({
      id: 'trk_unintegrated_01',
      title: 'New Track',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/new.flac',
      fileSize: 1000,
      fileHash: 'hash_new',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 1. 模拟导入阶段：同时挂入全部音乐与未集成歌单
    playlistRepo.addTrackToPlaylist('default_all_tracks', 'trk_unintegrated_01');
    playlistRepo.addTrackToPlaylist('default_unintegrated_tracks', 'trk_unintegrated_01');

    const unintegratedBefore = playlistRepo.findUnintegrated();
    expect(unintegratedBefore?.trackCount).toBe(1);
    expect(playlistRepo.getPlaylistTracks('default_unintegrated_tracks').length).toBe(1);

    // 2. 用户整理编排：将歌曲加入自定义歌单
    const customPlaylist = playlistRepo.create('我的常听精选');
    playlistRepo.addTrackToPlaylist(customPlaylist.id, 'trk_unintegrated_01');

    // 3. 验证该曲目自动从未集成歌单中移出，且未集成歌单曲目数归零
    const unintegratedAfter = playlistRepo.findUnintegrated();
    expect(unintegratedAfter?.trackCount).toBe(0);
    expect(playlistRepo.getPlaylistTracks('default_unintegrated_tracks').length).toBe(0);

    // 自定义歌单中正常存在
    expect(playlistRepo.getPlaylistTracks(customPlaylist.id).length).toBe(1);
  });

  it('心动收藏功能：支持 toggleFavorite 一键收藏与取消', () => {
    trackRepo.insert({
      id: 'trk_fav_01',
      title: 'Favorite Song',
      artist: 'Singer',
      album: 'Album',
      duration: 200,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/fav.flac',
      fileSize: 1000,
      fileHash: 'hash_fav',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(playlistRepo.isFavorite('trk_fav_01')).toBe(false);

    // 1. 第一次 toggle: 收藏
    const state1 = playlistRepo.toggleFavorite('trk_fav_01');
    expect(state1).toBe(true);
    expect(playlistRepo.isFavorite('trk_fav_01')).toBe(true);
    expect(playlistRepo.getPlaylistTracks('default_favorites').length).toBe(1);

    // 2. 第二次 toggle: 取消收藏
    const state2 = playlistRepo.toggleFavorite('trk_fav_01');
    expect(state2).toBe(false);
    expect(playlistRepo.isFavorite('trk_fav_01')).toBe(false);
    expect(playlistRepo.getPlaylistTracks('default_favorites').length).toBe(0);
  });

  it('智能歌单动态排序：支持 played, frequent, hires 检索过滤', () => {
    // 注入 3 首曲目
    // 曲目 A: 16-bit 44.1kHz, 播放 10 次, 最近播放较早
    trackRepo.insert({
      id: 'trk_sort_a',
      title: 'Track A',
      artist: 'Artist A',
      album: 'Album A',
      duration: 100,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/a.flac',
      fileSize: 1000,
      fileHash: 'hash_a',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      playCount: 10,
      lastPlayedAt: 10000,
      createdAt: 1000,
      updatedAt: 1000,
    });

    // 曲目 B: 24-bit 96kHz (Hi-Res), 播放 2 次, 最近播放最新
    trackRepo.insert({
      id: 'trk_sort_b',
      title: 'Track B',
      artist: 'Artist B',
      album: 'Album B',
      duration: 100,
      bitrate: 1000000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: '/music/b.flac',
      fileSize: 1000,
      fileHash: 'hash_b',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      playCount: 2,
      lastPlayedAt: 99999,
      createdAt: 2000,
      updatedAt: 2000,
    });

    // 曲目 C: 16-bit 48kHz, 播放 50 次 (最常收听)
    trackRepo.insert({
      id: 'trk_sort_c',
      title: 'Track C',
      artist: 'Artist C',
      album: 'Album C',
      duration: 100,
      bitrate: 320000,
      sampleRate: 48000,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/c.flac',
      fileSize: 1000,
      fileHash: 'hash_c',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      playCount: 50,
      lastPlayedAt: 50000,
      createdAt: 3000,
      updatedAt: 3000,
    });

    // 1. 最常收听 (frequent): C(50) -> A(10) -> B(2)
    const frequentList = trackRepo.findAll({ sort: 'frequent' });
    expect(frequentList.items.map((t) => t.id)).toEqual(['trk_sort_c', 'trk_sort_a', 'trk_sort_b']);

    // 2. 最近播放 (played): B(99999) -> C(50000) -> A(10000)
    const playedList = trackRepo.findAll({ sort: 'played' });
    expect(playedList.items.map((t) => t.id)).toEqual(['trk_sort_b', 'trk_sort_c', 'trk_sort_a']);

    // 3. Hi-Res 母带过滤 (hires): 仅 B 命中 (96kHz / 24-bit)
    const hiresList = trackRepo.findAll({ sort: 'hires' });
    expect(hiresList.items.length).toBe(1);
    expect(hiresList.items[0].id).toBe('trk_sort_b');
  });
});
