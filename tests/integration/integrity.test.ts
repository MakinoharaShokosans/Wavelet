import {
  Database,
  IntegrityGuard,
  PlaylistRepository,
  TrackRepository,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Integration Test: IntegrityGuard & Ghost File Audit', () => {
  let db: Database.Database;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;
  let integrityGuard: IntegrityGuard;
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeEach(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);

    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    trackRepo = new TrackRepository(db);
    playlistRepo = new PlaylistRepository(db);
    integrityGuard = new IntegrityGuard(trackRepo);
  });

  it('当物理音频在外部被删除时，完整性巡检应当检测到幽灵曲目并将其标记为 missing', () => {
    // 写入一个指向不存在文件的幽灵曲目
    trackRepo.insert({
      id: 'trk_ghost_001',
      title: 'Ghost Track',
      artist: 'Ghost Artist',
      album: 'Ghost Album',
      duration: 120,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/non/existent/path/ghost.flac',
      fileSize: 12345,
      fileHash: 'ghost_hash_123',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 执行巡检
    const auditResult = integrityGuard.auditMissingFiles();
    expect(auditResult.missingCount).toBe(1);
    expect(auditResult.missingTrackIds).toContain('trk_ghost_001');

    // 验证数据库状态更新为 missing
    const track = trackRepo.findById('trk_ghost_001');
    expect(track?.healthyStatus).toBe('missing');
  });

  it('执行彻底删除 (purgeTrackCompletely) 时应当触发 SQLite 外键级联删除关联关系', () => {
    trackRepo.insert({
      id: 'trk_to_purge',
      title: 'Purge Song',
      artist: 'Purge Artist',
      album: 'Purge Album',
      duration: 100,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/dummy/purge.flac',
      fileSize: 1000,
      fileHash: 'purge_hash',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const playlist = playlistRepo.create('临时歌单');
    playlistRepo.addTrackToPlaylist(playlist.id, 'trk_to_purge');

    expect(playlistRepo.getPlaylistTracks(playlist.id).length).toBe(1);

    // 执行彻底删除
    const purged = integrityGuard.purgeTrackCompletely('trk_to_purge');
    expect(purged).toBe(true);

    // 验证曲目已删除且歌单关联已自动级联清除
    expect(trackRepo.findById('trk_to_purge')).toBeNull();
    expect(playlistRepo.getPlaylistTracks(playlist.id).length).toBe(0);
  });
});
