import {
  Database,
  LyricsRepository,
  PlaylistRepository,
  TrackRepository,
  runMigrations,
} from '@wavelet/backend';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unit Test: Database Repositories (SQLite)', () => {
  let db: Database.Database;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let lyricsRepo: LyricsRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    trackRepo = new TrackRepository(db);
    playlistRepo = new PlaylistRepository(db);
    lyricsRepo = new LyricsRepository(db);
  });

  it('应当成功执行 TrackRepository 的 CRUD、哈希查重与分页搜索', () => {
    const track1 = {
      id: 'trk_test_001',
      title: '彼女は旅に出る',
      artist: '鎖那',
      album: 'Hush a by little girl',
      duration: 220.5,
      bitrate: 2928000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: '/path/to/test.flac',
      fileSize: 81800000,
      fileHash: 'sha256_mock_hash_1',
      hasEmbeddedCover: true,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    trackRepo.insert(track1);

    // 1. 根据 ID 查询
    const found = trackRepo.findById('trk_test_001');
    expect(found).not.toBeNull();
    expect(found?.title).toBe('彼女は旅に出る');
    expect(found?.artist).toBe('鎖那');
    expect(found?.sampleRate).toBe(96000);

    // 2. 根据 Hash 查询去重
    const foundHash = trackRepo.findByHash('sha256_mock_hash_1');
    expect(foundHash?.id).toBe('trk_test_001');

    // 3. 关键词检索
    const searchResult = trackRepo.findAll({ keyword: '彼女' });
    expect(searchResult.total).toBe(1);
    expect(searchResult.items[0].id).toBe('trk_test_001');

    // 4. 更新元数据
    trackRepo.update('trk_test_001', { artist: '鎖那 (Sana)' });
    const updated = trackRepo.findById('trk_test_001');
    expect(updated?.artist).toBe('鎖那 (Sana)');

    // 5. 删除
    const deleted = trackRepo.delete('trk_test_001');
    expect(deleted).toBe(true);
    expect(trackRepo.findById('trk_test_001')).toBeNull();
  });

  it('应当支持 PlaylistRepository 的 M:N 歌单曲目关联与浮点排序插值', () => {
    // 插入一首曲目
    trackRepo.insert({
      id: 'trk_001',
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      duration: 180,
      bitrate: 1000000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/path/to/a.flac',
      fileSize: 100000,
      fileHash: 'hash_a',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 创建自定义歌单
    const playlist = playlistRepo.create('我的精选集', '发烧无损母带合集');
    expect(playlist.id).toBeDefined();

    // 向歌单中添加曲目
    playlistRepo.addTrackToPlaylist(playlist.id, 'trk_001', 1.0);

    // 查询歌单包含的曲目
    const tracksInPlaylist = playlistRepo.getPlaylistTracks(playlist.id);
    expect(tracksInPlaylist.length).toBe(1);
    expect(tracksInPlaylist[0].title).toBe('Song A');

    // 验证默认根歌单自动存在
    const allPlaylists = playlistRepo.findAll();
    expect(allPlaylists.some((p) => p.id === 'default_all_tracks')).toBe(true);

    // 移除歌单关联 (物理底层曲目不受损)
    playlistRepo.removeTrackFromPlaylist(playlist.id, 'trk_001');
    expect(playlistRepo.getPlaylistTracks(playlist.id).length).toBe(0);
    expect(trackRepo.findById('trk_001')).not.toBeNull();
  });

  it('应当支持 LyricsRepository 存储与读取 LRC 歌词', () => {
    trackRepo.insert({
      id: 'trk_lrc',
      title: 'Lrc Song',
      artist: 'Singer',
      album: 'Album',
      duration: 200,
      bitrate: 1000000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/path/to/lrc.flac',
      fileSize: 100000,
      fileHash: 'hash_lrc',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: true,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const lrcText = '[00:10.50]旅に出る準備をして\n[00:15.20]新しい街へ';
    lyricsRepo.upsert({
      trackId: 'trk_lrc',
      rawLrc: lrcText,
      offsetMs: 50,
      updatedAt: Date.now(),
    });

    const savedLrc = lyricsRepo.findByTrackId('trk_lrc');
    expect(savedLrc).not.toBeNull();
    expect(savedLrc?.rawLrc).toBe(lrcText);
    expect(savedLrc?.offsetMs).toBe(50);
  });
});
