import fs from 'node:fs';
import path from 'node:path';
import {
  PlaylistRepository,
  TrackRepository,
  closeDatabase,
  getDatabase,
  loadConfig,
  parseTrackInfoFromFilename,
  resetPlaybackRouter,
  runMigrations,
  syncMusicsDirectory,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

describe('Unit Test: Filename-to-Title Auto Sync (启动与增量同步自动对齐文件名与歌曲名)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let trackRepo: TrackRepository;
  let playlistRepo: PlaylistRepository;

  beforeAll(async () => {
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    trackRepo = new TrackRepository(getDatabase());
    playlistRepo = new PlaylistRepository(getDatabase());
  });

  afterAll(async () => {
    closeDatabase();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  describe('parseTrackInfoFromFilename 规则器独立测试', () => {
    it('智能模式：应当正确识别 "歌手 - 歌名 (作品名/版本)" 结构', () => {
      const res = parseTrackInfoFromFilename('/musics/折戸伸治 - Radiance (Rewrite).flac', 'smart');
      expect(res.artist).toBe('折戸伸治');
      expect(res.title).toBe('Radiance (Rewrite)');
    });

    it('智能模式：歌曲名自身含横杠时应仅以第一个 " - " 为界拆分', () => {
      const res = parseTrackInfoFromFilename('/musics/Lia - 夏影 -AIR- (AIR).flac', 'smart');
      expect(res.artist).toBe('Lia');
      expect(res.title).toBe('夏影 -AIR- (AIR)');
    });

    it('智能模式：当文件名无 " - " 时应回退为完整文件名作为歌名', () => {
      const res = parseTrackInfoFromFilename('/musics/Philosophyz.flac', 'smart');
      expect(res.artist).toBeUndefined();
      expect(res.title).toBe('Philosophyz');
    });

    it('纯文件名模式：应当不拆分并直接返回完整文件名作为歌名', () => {
      const res = parseTrackInfoFromFilename(
        '/musics/折戸伸治 - Radiance (Rewrite).flac',
        'filename'
      );
      expect(res.artist).toBeUndefined();
      expect(res.title).toBe('折戸伸治 - Radiance (Rewrite)');
    });
  });

  describe('曲库启动与增量同步自动对齐测试', () => {
    it('全新入库时：应当直接使用文件名智能解析后的歌名与歌手', async () => {
      const audioFile = path.join(
        sandbox.config.storage.libraryDir,
        '水谷瑠奈 - Philosophyz (Rewrite OP).flac'
      );
      fs.writeFileSync(
        audioFile,
        Buffer.concat([fs.readFileSync(TEST_AUDIO_PATH), Buffer.from('filename_sync_seed_1')])
      );

      const syncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(syncRes.imported).toBeGreaterThanOrEqual(1);

      const track = trackRepo.findByPath(audioFile);
      expect(track).not.toBeNull();
      expect(track?.title).toBe('Philosophyz (Rewrite OP)');
      expect(track?.artist).toBe('水谷瑠奈');
    });

    it('存量曲目重命名后启动同步：应当自动校准数据库中的歌曲名与歌手，且保活 Track ID', async () => {
      const oldPath = path.join(
        sandbox.config.storage.libraryDir,
        '水谷瑠奈 - Philosophyz (Rewrite OP).flac'
      );
      const newPath = path.join(
        sandbox.config.storage.libraryDir,
        '彩菜 - Last regrets (Kanon OP).flac'
      );

      const oldTrack = trackRepo.findByPath(oldPath);
      expect(oldTrack).not.toBeNull();
      const oldTrackId = oldTrack!.id;

      // 模拟磁盘重命名
      fs.renameSync(oldPath, newPath);

      // 模拟每次启动时调用的 syncMusicsDirectory
      const startupSyncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(startupSyncRes.migrated).toBe(1);

      const updatedTrack = trackRepo.findById(oldTrackId);
      expect(updatedTrack).not.toBeNull();
      // ID 保活
      expect(updatedTrack?.id).toBe(oldTrackId);
      // 物理路径更新
      expect(updatedTrack?.filePath).toBe(newPath);
      // 歌名与歌手已自动校准对齐新文件名！
      expect(updatedTrack?.title).toBe('Last regrets (Kanon OP)');
      expect(updatedTrack?.artist).toBe('彩菜');
    });

    it('存量物理文件在席但数据库中 title 残留旧标签时：再次扫描应自动同步校准', async () => {
      const targetFile = path.join(
        sandbox.config.storage.libraryDir,
        '彩菜 - Last regrets (Kanon OP).flac'
      );
      const targetTrack = trackRepo.findByPath(targetFile);
      expect(targetTrack).not.toBeNull();

      // 人为故意向数据库注入旧的脏标题与脏歌手 (模拟此前残留的 Vorbis Comment)
      trackRepo.update(targetTrack!.id, {
        title: '【脏标题】旧的B站抓取标题',
        artist: '某B站UP主',
      });

      const dirtyTrack = trackRepo.findById(targetTrack!.id);
      expect(dirtyTrack?.title).toBe('【脏标题】旧的B站抓取标题');
      expect(dirtyTrack?.artist).toBe('某B站UP主');

      // 模拟每次启动时调用的增量同步
      const bootSyncRes = await syncMusicsDirectory(sandbox.config.storage.libraryDir);
      expect(bootSyncRes.refreshed).toBeGreaterThanOrEqual(1);

      // 校验已自动自愈校准为文件名对应的规范标题与歌手
      const healedTrack = trackRepo.findById(targetTrack!.id);
      expect(healedTrack?.title).toBe('Last regrets (Kanon OP)');
      expect(healedTrack?.artist).toBe('彩菜');
    });
  });
});
