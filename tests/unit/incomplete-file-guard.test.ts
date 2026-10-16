import fs from 'node:fs';
import path from 'node:path';
import {
  TrackRepository,
  closeDatabase,
  findAudioFilesRecursively,
  getDatabase,
  isFileWritingInProgress,
  isIncompleteOrTempFile,
  loadConfig,
  resetPlaybackRouter,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Incomplete File & Temporary File Guard (ISSUE-05)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;

  beforeAll(() => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
    trackRepo = new TrackRepository();
  });

  afterAll(() => {
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  it('场景 1：临时/下载中未完成扩展名过滤 (Temp Extension Guard)', () => {
    const testDir = path.join(sandbox.rootDir, 'temp_test_dir');
    fs.mkdirSync(testDir, { recursive: true });

    // 创建各类型临时文件与正常文件
    const tempNames = [
      'song1.flac.crdownload',
      'song2.mp3.part',
      'song3.flac.tmp',
      'song4.flac.downloading',
      '.song5.flac',
      '._song6.flac',
      'song7.flac~',
      '~song8.flac',
      'song9.part.flac',
    ];

    for (const name of tempNames) {
      expect(isIncompleteOrTempFile(name)).toBe(true);
      fs.writeFileSync(path.join(testDir, name), 'dummy-content');
    }

    const validName = 'valid_song.flac';
    expect(isIncompleteOrTempFile(validName)).toBe(false);
    fs.copyFileSync(TEST_AUDIO_PATH, path.join(testDir, validName));

    const scannedFiles = findAudioFilesRecursively(testDir);
    expect(scannedFiles.length).toBe(1);
    expect(path.basename(scannedFiles[0])).toBe('valid_song.flac');
  });

  it('场景 2：流式写入中文件稳定性检测 (Size Stability Check)', async () => {
    const growingFile = path.join(sandbox.config.storage.libraryDir, 'growing_test.flac');
    fs.writeFileSync(growingFile, Buffer.from('initial_chunk'));

    // 启动后台定时写入以模拟活跃落盘
    const appendInterval = setInterval(() => {
      try {
        if (fs.existsSync(growingFile)) {
          fs.appendFileSync(growingFile, Buffer.from('_append_bytes'));
        }
      } catch {}
    }, 50);

    try {
      const isWriting = await isFileWritingInProgress(growingFile, {
        recentWindowMs: 2000,
        intervalMs: 100,
      });
      expect(isWriting).toBe(true);
    } finally {
      clearInterval(appendInterval);
    }

    // 测试刚创建的 0 字节文件
    const zeroByteFile = path.join(sandbox.config.storage.libraryDir, 'zero_byte.flac');
    fs.writeFileSync(zeroByteFile, Buffer.alloc(0));
    const isZeroWriting = await isFileWritingInProgress(zeroByteFile);
    expect(isZeroWriting).toBe(true);
    fs.unlinkSync(zeroByteFile);

    // 测试一个已稳定、过去修改的文件
    const stableFile = path.join(sandbox.config.storage.libraryDir, 'already_stable.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, stableFile);
    // 人工将 mtime 回拨 5 秒以模拟写入完成
    const oldTime = (Date.now() - 5000) / 1000;
    fs.utimesSync(stableFile, oldTime, oldTime);

    const isStableWriting = await isFileWritingInProgress(stableFile, {
      recentWindowMs: 1500,
      intervalMs: 50,
    });
    expect(isStableWriting).toBe(false);
    fs.unlinkSync(stableFile);
    if (fs.existsSync(growingFile)) fs.unlinkSync(growingFile);
  });

  it('场景 3：增量扫描防误伤 (写入中半截文件静默跳过，绝不移入隔离区)', async () => {
    const stableTrackPath = path.join(sandbox.config.storage.libraryDir, '01.stable_song.flac');
    fs.copyFileSync(TEST_AUDIO_PATH, stableTrackPath);
    // 回拨 stableTrackPath 的 mtime 使其稳定
    const oldTime = (Date.now() - 5000) / 1000;
    fs.utimesSync(stableTrackPath, oldTime, oldTime);

    // 创建一个半截的音频文件，并在扫描期间持续向其追加内容
    const incompletePath = path.join(sandbox.config.storage.libraryDir, '02.incomplete_copy.flac');
    fs.writeFileSync(incompletePath, Buffer.from('fLaC_HEADER_INCOMPLETE'));

    const writeTimer = setInterval(() => {
      try {
        if (fs.existsSync(incompletePath)) {
          fs.appendFileSync(incompletePath, Buffer.from('_streaming_data_chunk_'));
        }
      } catch {}
    }, 40);

    try {
      const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      // 验证正常歌曲已入库
      expect(syncRes.imported).toBeGreaterThanOrEqual(1);
      expect(trackRepo.findByPath(stableTrackPath)).not.toBeNull();

      // 验证半截音频未入库，也未被标记为 missing
      expect(trackRepo.findByPath(incompletePath)).toBeNull();

      // 核心断言：隔离区绝无该文件
      const quarantineDir = sandbox.config.storage.quarantineDir;
      const quarantinedFile = path.join(quarantineDir, '02.incomplete_copy.flac');
      expect(fs.existsSync(quarantinedFile)).toBe(false);
    } finally {
      clearInterval(writeTimer);
    }
  });

  it('场景 4：写入完成后自动就绪入库 (Auto-Catch-Up on Complete)', async () => {
    const incompletePath = path.join(sandbox.config.storage.libraryDir, '02.incomplete_copy.flac');
    // 外部写入完成，写入完整的合法 FLAC 音频并回拨时间戳
    const baseAudio = fs.readFileSync(TEST_AUDIO_PATH);
    fs.writeFileSync(
      incompletePath,
      Buffer.concat([baseAudio, Buffer.from('unique_completed_bytes_05')])
    );
    const oldTime = (Date.now() - 5000) / 1000;
    fs.utimesSync(incompletePath, oldTime, oldTime);

    // 再次触发同步
    const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
    expect(syncRes.imported).toBeGreaterThanOrEqual(1);

    // 验证现在该音频已正式入库成功
    const importedTrack = trackRepo.findByPath(incompletePath);
    expect(importedTrack).not.toBeNull();
    expect(importedTrack?.healthyStatus).toBe('healthy');
  });
});
