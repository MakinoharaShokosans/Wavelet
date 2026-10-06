import fs from 'node:fs';
import path from 'node:path';
import {
  AdmZip,
  BackupManager,
  PlaylistRepository,
  TrackRepository,
  getDatabase,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Backup & Migration Engine (曲库备份与跨机器迁移)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeEach(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('应当成功将曲库音频、元数据与数据库记录全量打包导出为 .zip', async () => {
    const db = getDatabase();
    const trackRepo = new TrackRepository(db);
    const playlistRepo = new PlaylistRepository(db);

    // 1. 准备沙箱物理音频
    const audioDest = path.join(sandbox.config.storage.libraryDir, 'test_song.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, audioDest);

    // 2. 插入测试曲目与歌单
    const trackId = 'trk_backup_01';
    trackRepo.insert({
      id: trackId,
      title: '旅の途中',
      artist: 'Sana',
      album: 'Journey Album',
      duration: 180,
      bitrate: 320000,
      sampleRate: 48000,
      bitDepth: 24,
      channels: 2,
      filePath: audioDest,
      fileSize: fs.statSync(audioDest).size,
      fileHash: 'test_hash_backup_01',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: true,
      healthyStatus: 'healthy',
      playCount: 5,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const customPlaylist = playlistRepo.create({
      name: '发烧收藏集',
      description: '精品母带',
      isFolder: false,
    });
    playlistRepo.addTrackToPlaylist(customPlaylist.id, trackId);

    // 插入歌词
    db.prepare(
      'INSERT INTO lyrics (track_id, raw_lrc, offset_ms, updated_at) VALUES (?, ?, ?, ?)'
    ).run(trackId, '[00:01.00]测试歌词内容', 0, Date.now());

    // 3. 执行导出
    const targetZip = path.join(sandbox.config.storage.dataDir, 'test_backup.zip');
    const backupManager = new BackupManager();

    const progressLogs: string[] = [];
    const exportResult = await backupManager.exportBackup({
      targetZipPath: targetZip,
      includeAudio: true,
      onProgress: (_stage, _percent, msg) => {
        progressLogs.push(msg);
      },
    });

    expect(exportResult.success).toBe(true);
    expect(fs.existsSync(targetZip)).toBe(true);
    expect(exportResult.trackCount).toBe(1);
    expect(progressLogs.length).toBeGreaterThan(0);

    // 4. 校验生成的 zip 内部结构
    const zip = new AdmZip(targetZip);
    const manifestEntry = zip.getEntry('manifest.json');
    expect(manifestEntry).toBeDefined();

    const manifest = JSON.parse(manifestEntry?.getData().toString('utf-8') || '{}');
    expect(manifest.app).toBe('Wavelet');
    expect(manifest.trackCount).toBe(1);

    const dbEntry = zip.getEntry('database.json');
    expect(dbEntry).toBeDefined();
    const dump = JSON.parse(dbEntry?.getData().toString('utf-8') || '{}');
    expect(dump.tracks.length).toBe(1);
    expect(dump.tracks[0].title).toBe('旅の途中');
    expect(dump.lyrics.length).toBe(1);

    // 验证音频物理文件存在于压缩包内
    const audioRelPath = dump.tracks[0].archiveRelativePath;
    expect(zip.getEntry(audioRelPath)).toBeDefined();
  });

  it('应当能够在模拟的新电脑环境下导入备份包并重映射文件路径', async () => {
    const db = getDatabase();
    const trackRepo = new TrackRepository(db);

    // 1. 制造备份包
    const audioDest = path.join(sandbox.config.storage.libraryDir, 'original_machine.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, audioDest);

    trackRepo.insert({
      id: 'trk_restore_01',
      title: '跨机器还原测试曲',
      artist: 'Artist_New',
      album: 'Album_New',
      duration: 120,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: audioDest,
      fileSize: fs.statSync(audioDest).size,
      fileHash: 'hash_restore_test',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      playCount: 12,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const targetZip = path.join(sandbox.config.storage.dataDir, 'restore_package.zip');
    const backupManager = new BackupManager();
    await backupManager.exportBackup({ targetZipPath: targetZip });

    // 2. 清空数据库 (模拟另一台全新的电脑)
    db.prepare('DELETE FROM tracks').run();
    db.prepare('DELETE FROM playlist_tracks').run();
    expect(trackRepo.getAllTracks().length).toBe(0);

    // 3. 在“新电脑”上还原，指定不同的音乐目录
    const newComputerMusicDir = path.join(sandbox.config.storage.dataDir, 'NewComputer_Music');
    const importResult = await backupManager.importBackup(targetZip, {
      destinationAudioDir: newComputerMusicDir,
    });

    expect(importResult.success).toBe(true);
    expect(importResult.restoredTracks).toBe(1);

    // 4. 验证数据库已成功恢复，且 filePath 已重映射为新电脑路径
    const restoredTracks = trackRepo.getAllTracks();
    expect(restoredTracks.length).toBe(1);
    const restoredTrack = restoredTracks[0];
    expect(restoredTrack.title).toBe('跨机器还原测试曲');
    expect(restoredTrack.playCount).toBe(12);

    // 验证物理文件确实被解压到了新电脑指定目录
    expect(restoredTrack.filePath.startsWith(newComputerMusicDir)).toBe(true);
    expect(fs.existsSync(restoredTrack.filePath)).toBe(true);
  });
});
