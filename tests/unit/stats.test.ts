import { Database, PlaylistRepository, TrackRepository, runMigrations } from '@wavelet/backend';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unit Test: LibraryStats & Splash Dashboard (启动数据感知看板聚合)', () => {
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

  it('零曲目冷启动时应当安全返回默认空值统计', () => {
    const stats = trackRepo.getStats();

    expect(stats.trackCount).toBe(0);
    // 3 个系统默认歌单：全部音乐、未集成歌单、心动收藏
    expect(stats.playlistCount).toBe(3);
    expect(stats.totalDurationSeconds).toBe(0);
    expect(stats.avgDurationSeconds).toBe(0);
    expect(stats.avgDurationFormatted).toBe('00:00');
    expect(stats.totalDurationFormatted).toBe('0 分钟');
  });

  it('存在曲目时应当准确聚合曲库总曲目数、总播放时长与平均单曲时长', () => {
    // 插入曲目 1: 180 秒 (03:00)
    trackRepo.insert({
      id: 'trk_stats_01',
      title: 'Track 1',
      artist: 'Artist A',
      album: 'Album A',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/t1.flac',
      fileSize: 1000,
      fileHash: 'hash_t1',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 插入曲目 2: 240 秒 (04:00)
    trackRepo.insert({
      id: 'trk_stats_02',
      title: 'Track 2',
      artist: 'Artist B',
      album: 'Album B',
      duration: 240,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/t2.flac',
      fileSize: 1000,
      fileHash: 'hash_t2',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 创建一个自定义歌单
    playlistRepo.create('我的最爱');

    const stats = trackRepo.getStats();

    expect(stats.trackCount).toBe(2);
    expect(stats.playlistCount).toBe(4); // 3 默认 + 1 自定义
    expect(stats.totalDurationSeconds).toBe(420); // 180 + 240
    expect(stats.avgDurationSeconds).toBe(210); // 420 / 2
    expect(stats.avgDurationFormatted).toBe('03:30');
    expect(stats.totalDurationFormatted).toBe('7 分钟');
  });

  it('超过 1 小时总时长时应当格式化为“X 小时 Y 分钟”', () => {
    // 插入时长 3665 秒 (1小时 1分钟 5秒)
    trackRepo.insert({
      id: 'trk_stats_long',
      title: 'Long Symphony',
      artist: 'Orchestra',
      album: 'Classic',
      duration: 3665,
      bitrate: 1000000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: '/music/long.flac',
      fileSize: 5000000,
      fileHash: 'hash_long',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const stats = trackRepo.getStats();
    expect(stats.totalDurationFormatted).toBe('1 小时 1 分钟');
    expect(stats.avgDurationFormatted).toBe('61:05');
  });
});
