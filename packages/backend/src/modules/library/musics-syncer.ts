import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '@wavelet/shared';
import { getConfig, resolveHome } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { broadcastTaskProgress } from '../gateway/ws/broadcaster.js';
import { diagnoseAudioFile, executeHealingPipeline } from '../inspector/pipeline.js';
import { extractWaveformPeaks } from '../inspector/waveform-extractor.js';
import { computeFileHashAsync } from '../transcoder/flac-standardizer.js';
import { cacheCoverArt, parseAudioMetadata } from '../transcoder/metadata-writer.js';
import { healedCache, resolvePlayableAudioPath } from './healed-cache.js';
import { isPathInsideDir } from './path-guard.js';
import { LibraryRootRepository } from './repositories/library-root.repository.js';
import { LyricsRepository } from './repositories/lyrics.repository.js';
import { PlaylistRepository } from './repositories/playlist.repository.js';
import { TrackRepository } from './repositories/track.repository.js';
import { findSidecarCover, findSidecarLyrics } from './sidecar-detector.js';

export { isPathInsideDir, healedCache, resolvePlayableAudioPath };

export const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.ape',
  '.alac',
  '.aiff',
  '.wma',
  '.webm',
]);

export interface ParsedTrackInfo {
  title: string;
  artist?: string;
}

export interface DerivedFieldsResult {
  title: string;
  artist: string;
}

/**
 * 依据文件名与策略解析歌曲名与歌手 (启动与增量同步自动对齐文件名)
 */
export function parseTrackInfoFromFilename(
  filePath: string,
  mode: 'smart' | 'filename' | 'tag' = 'smart'
): ParsedTrackInfo {
  const base = path.basename(filePath, path.extname(filePath)).trim();
  if (mode === 'filename') {
    return { title: base };
  }
  if (mode === 'smart') {
    const separatorIdx = base.indexOf(' - ');
    if (separatorIdx !== -1) {
      const artist = base.substring(0, separatorIdx).trim();
      const title = base.substring(separatorIdx + 3).trim();
      if (artist && title) {
        return { title, artist };
      }
    }
    return { title: base };
  }
  return { title: base };
}

/**
 * 集中根据文件名解析结果或元数据更新曲目的 title 与 artist，
 * 严格尊重用户手动编辑锁 (titleLocked / artistLocked)。
 * 若字段已被锁定，则坚决跳过覆盖，保留原有值。
 */
export function applyFilenameDerivedFields(
  track: Pick<Track, 'title' | 'artist'> & {
    titleLocked?: boolean;
    artistLocked?: boolean;
  },
  parsed: ParsedTrackInfo,
  mode: 'smart' | 'filename' | 'tag' = 'smart',
  fallbackMetadata?: { title?: string; artist?: string }
): DerivedFieldsResult {
  let targetTitle = track.title;
  let targetArtist = track.artist;

  if (mode === 'tag') {
    if (!track.titleLocked) {
      targetTitle = fallbackMetadata?.title || parsed.title;
    }
    if (!track.artistLocked) {
      targetArtist = fallbackMetadata?.artist || track.artist || '未知艺术家';
    }
  } else {
    if (!track.titleLocked) {
      targetTitle = parsed.title;
    }
    if (!track.artistLocked) {
      targetArtist = parsed.artist || fallbackMetadata?.artist || track.artist || '未知艺术家';
    }
  }

  return {
    title: targetTitle,
    artist: targetArtist,
  };
}

/**
 * 常见未完成下载/临时文件后缀与特征前缀过滤 (ISSUE-05)
 */
export function isIncompleteOrTempFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  // 1. 点文件、隐藏文件、临时波浪线文件、macOS 资源衍生文件
  if (
    lower.startsWith('.') ||
    lower.startsWith('~') ||
    lower.startsWith('._') ||
    lower.endsWith('~')
  ) {
    return true;
  }
  // 2. 常见下载器/传输器未完成后缀
  const tempExtensions = [
    '.part',
    '.crdownload',
    '.downloading',
    '.uploading',
    '.incomplete',
    '.tmp',
    '.temp',
    '.aria2',
    '.baiduyun.downloading',
    '.filepart',
  ];
  if (tempExtensions.some((ext) => lower.endsWith(ext))) {
    return true;
  }
  // 3. 复合临时名 (例如 song.flac.tmp, song.mp3.part, 包含 .crdownload. 的)
  if (
    lower.includes('.part.') ||
    lower.includes('.tmp.') ||
    lower.includes('.crdownload.') ||
    lower.includes('.downloading.') ||
    lower.includes('.incomplete.')
  ) {
    return true;
  }
  return false;
}

/**
 * 检查文件是否处于活跃写入或未完成状态 (ISSUE-05: 尺寸稳定性巡检)
 * 若修改时间在 recentWindowMs 内，等待 intervalMs 并复查其尺寸与修改时间；
 * 若尺寸变化、时间戳递增，或为刚创建的 0 字节文件，判定为写入未完成。
 */
export async function isFileWritingInProgress(
  filePath: string,
  options?: { recentWindowMs?: number; intervalMs?: number }
): Promise<boolean> {
  const recentWindowMs = options?.recentWindowMs ?? 1500;
  const intervalMs = options?.intervalMs ?? 150;

  try {
    const initialStat = fs.statSync(filePath);
    const now = Date.now();

    // 刚创建不久的 0 字节文件直接判定为处于写入准备中
    if (initialStat.size === 0 && now - initialStat.mtimeMs < 30000) {
      return true;
    }

    // 若最后修改时间在设定窗口之内 (默认 1.5 秒)，说明文件极近发生过写入
    if (now - initialStat.mtimeMs < recentWindowMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const secondStat = fs.statSync(filePath);
      if (secondStat.size !== initialStat.size || secondStat.mtimeMs !== initialStat.mtimeMs) {
        return true;
      }
    }
    return false;
  } catch {
    // 若读取 stat 报错 (例如文件被独占写锁定或在此期间被重命名)，视为处于不安全写入状态
    return true;
  }
}

export function findAudioFilesRecursively(dirPath: string): string[] {
  const results: string[] = [];
  function walk(current: string) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (isIncompleteOrTempFile(entry.name)) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(dirPath);
  return results;
}

export function linkTrackToPlaylists(playlistRepo: PlaylistRepository, trackId: string): void {
  const defaultPlaylist = playlistRepo.findDefault();
  if (defaultPlaylist) {
    playlistRepo.addTrackToPlaylist(defaultPlaylist.id, trackId);
  }
  const unintegrated = playlistRepo.findUnintegrated();
  if (unintegrated) {
    playlistRepo.addTrackToPlaylist(unintegrated.id, trackId);
  }
}

/**
 * 原地扫描音频文件并建立曲库索引 (原地保留文件，不向母库冗余复制)
 */
export async function processSingleAudioFile(
  filePath: string,
  trackRepo: TrackRepository,
  playlistRepo: PlaylistRepository,
  taskId: string,
  lyricsRepo: LyricsRepository = new LyricsRepository(),
  titleParseMode?: 'smart' | 'filename' | 'tag'
): Promise<{ track?: Track; error?: string }> {
  try {
    // 0. 防误伤巡检 (ISSUE-05): 若新物理文件处于写入/拷贝中，暂缓入库
    if (await isFileWritingInProgress(filePath)) {
      logger.info({ filePath }, '[曲库同步] 音频文件正在写入或拷贝中，暂缓入库');
      return { error: '音频文件正在写入或拷贝中，暂缓入库' };
    }

    // 1. 体检阶段
    broadcastTaskProgress({
      taskId,
      stage: 'diagnosing',
      percent: 20,
      message: `正在诊断: ${path.basename(filePath)}`,
    });
    const diagnosis = await diagnoseAudioFile(filePath);

    // 2. 自愈修复预检
    let activeAudioPath = filePath;
    if (diagnosis.corruptions.length > 0) {
      broadcastTaskProgress({
        taskId,
        stage: 'healing',
        percent: 45,
        message: `检测到音频轻微破损，正在自愈: ${path.basename(filePath)}`,
      });
      const healingResult = await executeHealingPipeline(diagnosis);
      if (!healingResult.success) {
        broadcastTaskProgress({
          taskId,
          stage: 'quarantined',
          percent: 100,
          message: '音频存在致命损坏且无法自愈，已移交隔离区',
        });
        return { error: '音频存在致命损坏且无法自愈，已自动移交隔离区' };
      }
      activeAudioPath = healingResult.healedPath;
    }

    // 3. 原地抽取元数据与封面/波形缓存
    broadcastTaskProgress({
      taskId,
      stage: 'indexing',
      percent: 70,
      message: `正在提取元数据与波形: ${path.basename(filePath)}`,
    });

    const stat = fs.statSync(filePath);
    const fileHash = await computeFileHashAsync(filePath);

    // 检查曲库中是否已存在该曲目 (若哈希或文件路径已存在则安全复用，保证幂等)
    const existingTrack = trackRepo.findByHash(fileHash) || trackRepo.findByPath(filePath);
    if (existingTrack) {
      if (existingTrack.filePath !== filePath) {
        trackRepo.update(existingTrack.id, {
          filePath,
          fileSize: stat.size,
        });
        existingTrack.filePath = filePath;
        existingTrack.fileSize = stat.size;
        logger.info(
          { trackId: existingTrack.id, oldPath: existingTrack.filePath, newPath: filePath },
          '[曲库同步] 追踪到曲目路径迁移，已更新物理存储位置'
        );
      }
      return { track: existingTrack };
    }

    const metadata = await parseAudioMetadata(activeAudioPath);

    // ISSUE-07: 优先使用内嵌封面；若无内嵌封面，自动嗅探同级外挂封面
    let hasCover = metadata.hasEmbeddedCover;
    if (metadata.hasEmbeddedCover && metadata.coverBuffer) {
      cacheCoverArt(metadata.coverBuffer, fileHash);
    } else {
      const sidecarCover = findSidecarCover(filePath);
      if (sidecarCover) {
        cacheCoverArt(sidecarCover.buffer, fileHash);
        hasCover = true;
        logger.info(
          { filePath, coverPath: sidecarCover.filePath },
          '[曲库同步] 检测到同级外挂封面，已成功缓存并关联'
        );
      }
    }

    // 异步抽取 128 点整轨波形并持久化缓存
    try {
      await extractWaveformPeaks(activeAudioPath, fileHash, metadata.duration);
    } catch {
      // 波形抽取失败不阻断入库
    }

    const config = getConfig();
    const parseMode = titleParseMode || config.storage.titleParseMode || 'smart';
    const parsedInfo = parseTrackInfoFromFilename(filePath, parseMode);
    const title =
      parseMode === 'tag'
        ? metadata.title || path.basename(filePath, path.extname(filePath))
        : parsedInfo.title;
    const artist =
      parseMode === 'tag'
        ? metadata.artist || '未知艺术家'
        : parsedInfo.artist || metadata.artist || '未知艺术家';
    const now = Date.now();
    const trackId = `trk_${fileHash.slice(0, 16)}`;

    // ISSUE-07: 优先使用内嵌歌词；若无内嵌歌词，自动嗅探同级伴随歌词文件
    let hasLyrics = Boolean(metadata.rawLyrics);
    let resolvedLyrics = metadata.rawLyrics;
    if (!hasLyrics) {
      const sidecarLyrics = findSidecarLyrics(filePath);
      if (sidecarLyrics) {
        hasLyrics = true;
        resolvedLyrics = sidecarLyrics;
        logger.info({ filePath }, '[曲库同步] 检测到外挂伴随歌词文件，已成功解析并关联');
      }
    }

    const track: Track = {
      id: trackId,
      title,
      artist,
      album: metadata.album || '未知专辑',
      albumArtist: metadata.albumArtist || metadata.artist || '未知艺术家',
      duration: metadata.duration || 0,
      bitrate: metadata.bitrate || 0,
      sampleRate: metadata.sampleRate || 44100,
      bitDepth: metadata.bitDepth || 16,
      channels: metadata.channels || 2,
      filePath, // 原地索引，绝对不产生额外文件拷贝！
      fileSize: stat.size,
      fileHash,
      hasEmbeddedCover: hasCover,
      hasEmbeddedLyrics: hasLyrics,
      healthyStatus: diagnosis.corruptions.length > 0 ? 'repaired' : 'healthy',
      playCount: 0,
      isFavorite: false,
      repairDetails:
        diagnosis.corruptions.length > 0
          ? diagnosis.corruptions.map((c) => ({
              type: c,
              description: diagnosis.details.join('; '),
              repairedAt: now,
            }))
          : undefined,
      createdAt: Math.round(stat.birthtimeMs || now),
      updatedAt: now,
    };

    trackRepo.insert(track);
    linkTrackToPlaylists(playlistRepo, track.id);

    // 若曲目经历过自愈，将修复后的健康音频安全持久化至持久缓存区 (供直通播放使用)
    if (
      diagnosis.corruptions.length > 0 &&
      activeAudioPath !== filePath &&
      fs.existsSync(activeAudioPath)
    ) {
      try {
        healedCache.persist(track.id, activeAudioPath, path.extname(filePath));
      } catch (err) {
        logger.warn({ err, trackId: track.id }, '[曲库同步] 持久化自愈音频至缓存失败');
      }
    }

    if (hasLyrics && resolvedLyrics) {
      lyricsRepo.upsert({
        trackId,
        rawLrc: resolvedLyrics,
        offsetMs: 0,
        updatedAt: now,
      });
    }

    broadcastTaskProgress({
      taskId,
      stage: 'completed',
      percent: 100,
      message: `原地索引完成: ${track.title}`,
    });

    return { track };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

interface MissingPool {
  existingPathMap: Map<string, Track>;
  missingTracksByHash: Map<string, Track>;
  missingTracksById: Map<string, Track>;
  prunedCount: number;
}

/**
 * 探查曲库现状：划分在席物理曲目与失联待挽救候选池
 */
function partitionDbTracks(
  allDbTracks: Track[],
  targetDir: string,
  diskPathsSet: Set<string>,
  trackRepo: TrackRepository,
  allRoots: string[] = []
): MissingPool {
  const existingPathMap = new Map<string, Track>();
  const missingTracksByHash = new Map<string, Track>();
  const missingTracksById = new Map<string, Track>();
  const prunedCount = 0;

  for (const t of allDbTracks) {
    if (isPathInsideDir(t.filePath, targetDir)) {
      if (diskPathsSet.has(t.filePath)) {
        existingPathMap.set(t.filePath, t);
      } else {
        missingTracksByHash.set(t.fileHash, t);
        missingTracksById.set(t.id, t);
      }
    } else {
      // 库外曲目保护防线 (ISSUE-11):
      // 若曲目位于已登记的其他合法曲库根目录下，由其自身根目录的扫描逻辑负责，此处不予干涉；
      // 若曲目未被任何已知曲库根覆盖，仅将其置为软断链标记 (is_missing=1)，绝对禁止从数据库自动物理删除！
      const isInsideAnyOtherRoot = allRoots.some(
        (r) => r !== targetDir && isPathInsideDir(t.filePath, r)
      );
      if (!isInsideAnyOtherRoot && !t.isMissing) {
        trackRepo.update(t.id, {
          isMissing: true,
          missingAt: Date.now(),
        });
        t.isMissing = true;
        t.missingAt = Date.now();
      }
    }
  }

  return { existingPathMap, missingTracksByHash, missingTracksById, prunedCount };
}

/**
 * 尝试通过 SHA-256 哈希寻回重命名或挪入新目录的曲目 (ISSUE-02)
 */
async function resolveTrackMigration(
  filePath: string,
  missingTracksByHash: Map<string, Track>,
  missingTracksById: Map<string, Track>,
  trackRepo: TrackRepository,
  titleParseMode: 'smart' | 'filename' | 'tag' = 'smart'
): Promise<Track | null> {
  const stat = fs.statSync(filePath);
  const fileHash = await computeFileHashAsync(filePath);

  const migratedTrack = missingTracksByHash.get(fileHash);
  if (migratedTrack) {
    const updateData: Partial<Track> = {
      filePath,
      fileSize: stat.size,
      isMissing: false,
      missingAt: null,
      updatedAt: Date.now(),
    };
    if (titleParseMode !== 'tag') {
      const parsed = parseTrackInfoFromFilename(filePath, titleParseMode);
      const derived = applyFilenameDerivedFields(migratedTrack, parsed, titleParseMode);
      updateData.title = derived.title;
      updateData.artist = derived.artist;
      migratedTrack.title = derived.title;
      migratedTrack.artist = derived.artist;
    }
    trackRepo.update(migratedTrack.id, updateData);
    migratedTrack.filePath = filePath;
    migratedTrack.fileSize = stat.size;
    migratedTrack.isMissing = false;
    migratedTrack.missingAt = undefined;

    missingTracksByHash.delete(fileHash);
    missingTracksById.delete(migratedTrack.id);

    logger.info(
      {
        trackId: migratedTrack.id,
        title: migratedTrack.title,
        oldPath: migratedTrack.filePath,
        newPath: filePath,
      },
      '[曲库同步] 成功识别曲目移动/重命名 (Hash Matching)，保活歌单与红心关联'
    );
    return migratedTrack;
  }

  const existingByHash = trackRepo.findByHash(fileHash);
  if (existingByHash && !fs.existsSync(existingByHash.filePath)) {
    const updateData: Partial<Track> = {
      filePath,
      fileSize: stat.size,
      isMissing: false,
      missingAt: null,
      updatedAt: Date.now(),
    };
    if (titleParseMode !== 'tag') {
      const parsed = parseTrackInfoFromFilename(filePath, titleParseMode);
      updateData.title = parsed.title;
      if (parsed.artist) updateData.artist = parsed.artist;
      existingByHash.title = parsed.title;
      if (parsed.artist) existingByHash.artist = parsed.artist;
    }
    trackRepo.update(existingByHash.id, updateData);
    existingByHash.filePath = filePath;
    existingByHash.fileSize = stat.size;
    existingByHash.isMissing = false;
    existingByHash.missingAt = undefined;
    return existingByHash;
  }

  return null;
}

/**
 * 严格锁定 musics/ 目录并执行就地增量同步：
 * 1. 递归检索 musics/ 下所有音频并建立磁盘路径集合
 * 2. 提取失联曲目候选池，暂缓删除以备指纹追踪 (ISSUE-02)
 * 3. 采用零哈希快径直通在席曲目；对新路径文件计算哈希对齐迁移曲目，保活歌单、红心与播放统计
 * 4. 0 文件防空门熔断保护 (ISSUE-04)
 */
export interface SyncMusicsResult {
  scanned: number;
  imported: number;
  migrated: number;
  missing: number;
  restored: number;
  pruned: number;
  refreshed: number;
  circuitBreakerTriggered?: boolean;
  tracks: Track[];
}

export interface SyncMusicsOptions {
  force?: boolean;
  resyncMetadata?: boolean;
  titleParseMode?: 'smart' | 'filename' | 'tag';
}

export async function syncMusicsDirectory(
  dirPath?: string,
  options?: SyncMusicsOptions
): Promise<SyncMusicsResult> {
  const config = getConfig();
  const parseMode = options?.titleParseMode || config.storage.titleParseMode || 'smart';
  const targetDir = dirPath ? resolveHome(dirPath) : config.storage.libraryDir;
  const trackRepo = new TrackRepository();
  const playlistRepo = new PlaylistRepository();
  const lyricsRepo = new LyricsRepository();

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  logger.info({ targetDir }, `[曲库同步] 正在扫描 musics 物理目录: ${targetDir}`);

  // 1. 递归检索当前物理磁盘上的所有音频文件
  const diskAudioFiles = findAudioFilesRecursively(targetDir);
  const diskPathsSet = new Set(diskAudioFiles);

  // 2. 探查数据库存量
  const allDbTracks = trackRepo.getAllTracks(true);
  const tracksInTargetDir = allDbTracks.filter((t) => isPathInsideDir(t.filePath, targetDir));

  // 防空门保底 (ISSUE-04 熔断保护): 若扫描目录结果为空 (0个音频)，但数据库中已存在该目录的存量曲目，
  // 极可能是目录被误重命名、临时移走或清空。为防止全库误标记为失联，立即熔断终止本次同步。
  if (!options?.force && diskAudioFiles.length === 0 && tracksInTargetDir.length > 0) {
    logger.warn(
      { targetDir, existingTrackCount: tracksInTargetDir.length },
      '[曲库同步] 熔断保护触发：扫描目录为空但数据库存量曲目 > 0，疑似目录被误移走或临时清空，放弃本次同步以保护曲库！'
    );
    return {
      scanned: 0,
      imported: 0,
      migrated: 0,
      missing: 0,
      restored: 0,
      pruned: 0,
      refreshed: 0,
      circuitBreakerTriggered: true,
      tracks: [],
    };
  }

  // 3. 划分在席文件与失联候选池
  const libraryRootRepo = new LibraryRootRepository(trackRepo.getDatabase());
  const allRoots = libraryRootRepo.getAllRootPaths();
  if (!allRoots.includes(targetDir)) {
    allRoots.push(targetDir);
  }

  const {
    existingPathMap,
    missingTracksByHash,
    missingTracksById,
    prunedCount: initialPruned,
  } = partitionDbTracks(allDbTracks, targetDir, diskPathsSet, trackRepo, allRoots);
  const prunedCount = initialPruned;

  if (missingTracksById.size > 0) {
    logger.info(
      `[曲库同步] 检测到 ${missingTracksById.size} 首曲目原路径失联，进入指纹比对保活检索...`
    );
  }

  // 3. 遍历磁盘文件：快径直通 vs 哈希对齐保活 vs 全新入库
  const importedTracks: Track[] = [];
  let migratedCount = 0;
  let restoredCount = 0;
  let refreshedCount = 0;
  const taskId = `sync_musics_${Date.now()}`;

  for (let i = 0; i < diskAudioFiles.length; i++) {
    const filePath = diskAudioFiles[i];

    broadcastTaskProgress({
      taskId,
      stage: 'directory_scanning',
      percent: Math.round(((i + 1) / (diskAudioFiles.length || 1)) * 100),
      message: `正在索引 (${i + 1}/${diskAudioFiles.length}): ${path.basename(filePath)}`,
    });

    // 快径：原路径未变更
    const existing = existingPathMap.get(filePath);
    if (existing) {
      if (existing.isMissing) {
        trackRepo.update(existing.id, {
          isMissing: false,
          missingAt: null,
        });
        existing.isMissing = false;
        existing.missingAt = undefined;
        restoredCount++;
        logger.info(
          { trackId: existing.id, title: existing.title, filePath },
          '[曲库同步] 物理文件已重新归位，自动解除失联状态 (is_missing=0)'
        );
      }

      // 自动文件名标题校准 (每次启动与同步时生效，尊重字段锁)
      const parsedInfo = parseTrackInfoFromFilename(filePath, parseMode);
      if (parseMode !== 'tag') {
        const { title: targetTitle, artist: targetArtist } = applyFilenameDerivedFields(
          existing,
          parsedInfo,
          parseMode
        );
        if (existing.title !== targetTitle || existing.artist !== targetArtist) {
          trackRepo.update(existing.id, {
            title: targetTitle,
            artist: targetArtist,
            updatedAt: Date.now(),
          });
          logger.info(
            {
              trackId: existing.id,
              oldTitle: existing.title,
              newTitle: targetTitle,
              oldArtist: existing.artist,
              newArtist: targetArtist,
              filePath,
            },
            '[曲库同步] 自动根据物理文件名校准歌曲名与歌手'
          );
          existing.title = targetTitle;
          existing.artist = targetArtist;
          refreshedCount++;
        }
      }

      // ISSUE-06: 外部标签与元数据增量热同步 (mtime 或尺寸变动，或显式要求全量 resync)
      const stat = fs.statSync(filePath);
      const isDirty = stat.mtimeMs > existing.updatedAt || stat.size !== existing.fileSize;
      if (isDirty || options?.resyncMetadata) {
        try {
          const metadata = await parseAudioMetadata(filePath);
          const fileHash = await computeFileHashAsync(filePath);

          // ISSUE-07: 优先使用内嵌封面；若无内嵌封面，自动嗅探同级外挂封面
          let hasCover = metadata.hasEmbeddedCover;
          if (metadata.hasEmbeddedCover && metadata.coverBuffer) {
            cacheCoverArt(metadata.coverBuffer, fileHash);
          } else {
            const sidecarCover = findSidecarCover(filePath);
            if (sidecarCover) {
              cacheCoverArt(sidecarCover.buffer, fileHash);
              hasCover = true;
            }
          }

          // ISSUE-07: 优先使用内嵌歌词；若无内嵌歌词，自动嗅探同级伴随歌词文件
          let hasLyrics = Boolean(metadata.rawLyrics);
          let resolvedLyrics = metadata.rawLyrics;
          if (!hasLyrics) {
            const sidecarLyrics = findSidecarLyrics(filePath);
            if (sidecarLyrics) {
              hasLyrics = true;
              resolvedLyrics = sidecarLyrics;
            }
          }
          if (hasLyrics && resolvedLyrics) {
            lyricsRepo.upsert({
              trackId: existing.id,
              rawLrc: resolvedLyrics,
              offsetMs: 0,
              updatedAt: Date.now(),
            });
          }

          const { title, artist } = applyFilenameDerivedFields(existing, parsedInfo, parseMode, {
            title: metadata.title,
            artist: metadata.artist,
          });

          trackRepo.update(existing.id, {
            title,
            artist,
            album: metadata.album || '未知专辑',
            albumArtist: metadata.albumArtist || metadata.artist || '未知艺术家',
            duration: metadata.duration || existing.duration,
            bitrate: metadata.bitrate || existing.bitrate,
            sampleRate: metadata.sampleRate || existing.sampleRate,
            bitDepth: metadata.bitDepth || existing.bitDepth,
            channels: metadata.channels || existing.channels,
            fileSize: stat.size,
            fileHash,
            hasEmbeddedCover: hasCover,
            hasEmbeddedLyrics: hasLyrics,
            updatedAt: Date.now(),
          });
          existing.title = title;
          existing.artist = artist;
          existing.album = metadata.album || '未知专辑';
          existing.albumArtist = metadata.albumArtist || metadata.artist || '未知艺术家';
          existing.fileSize = stat.size;
          existing.fileHash = fileHash;
          existing.hasEmbeddedCover = hasCover;
          existing.hasEmbeddedLyrics = hasLyrics;
          refreshedCount++;
          logger.info(
            { trackId: existing.id, title: existing.title, filePath },
            '[曲库同步] 检测到物理文件修改或请求刷新，已原地热更新元数据与标签'
          );
        } catch (err) {
          logger.warn({ err, filePath }, '[曲库同步] 刷新文件元数据失败，保留旧有信息');
        }
      }

      importedTracks.push(existing);
      continue;
    }

    // 防误伤巡检 (ISSUE-05): 对未建库新文件/潜在迁移文件，若正处于写入或拷贝中，暂缓入库
    if (await isFileWritingInProgress(filePath)) {
      logger.info(
        { filePath },
        '[曲库同步] 检测到音频文件正在写入/拷贝中 (尺寸或时间戳变动)，暂缓入库'
      );
      continue;
    }

    // 尝试寻回重命名或路径迁移
    const migrated = await resolveTrackMigration(
      filePath,
      missingTracksByHash,
      missingTracksById,
      trackRepo,
      parseMode
    );
    if (migrated) {
      if (migrated.isMissing) {
        restoredCount++;
      }
      importedTracks.push(migrated);
      migratedCount++;
      continue;
    }

    // 确认系全新曲目，走标准化诊断与入库流程
    const res = await processSingleAudioFile(
      filePath,
      trackRepo,
      playlistRepo,
      `${taskId}_${i}`,
      lyricsRepo,
      parseMode
    );
    if (res.track) {
      importedTracks.push(res.track);
    }
  }

  // 4. 收尾软失效处理：经全盘扫描后仍未能寻回的孤立条目，标记为软缺失 (ISSUE-03 方案 A: 永不自动物理删除)
  let markedMissingCount = 0;
  for (const orphan of missingTracksById.values()) {
    if (!orphan.isMissing) {
      trackRepo.update(orphan.id, {
        isMissing: true,
        missingAt: orphan.missingAt || Date.now(),
      });
      orphan.isMissing = true;
      orphan.missingAt = orphan.missingAt || Date.now();
      markedMissingCount++;
      logger.info(
        { trackId: orphan.id, title: orphan.title, filePath: orphan.filePath },
        '[曲库同步] 物理文件已在磁盘移除且未匹配新文件，标记为软缺失 (is_missing=1)'
      );
    }
  }

  // 5. 校准全部歌单曲目计数并清理潜在幽灵引用 (ISSUE-08)
  playlistRepo.recalibrateTrackCounts();

  logger.info(
    `[曲库同步] 扫描完成: 共检测到 ${diskAudioFiles.length} 首物理文件，在席/保活 ${importedTracks.length} 首 (迁移 ${migratedCount} 首, 自动复活 ${restoredCount} 首)，标记软缺失 ${markedMissingCount} 首`
  );

  return {
    scanned: diskAudioFiles.length,
    imported: importedTracks.length,
    migrated: migratedCount,
    missing: markedMissingCount,
    restored: restoredCount,
    pruned: prunedCount,
    refreshed: refreshedCount,
    tracks: importedTracks,
  };
}

/**
 * 历史自愈曲目缓存轻量回填机制 (ISSUE-12: 单次冷启上限 20 首，防止长时间阻塞启动)
 */
export async function backfillRepairedCache(
  trackRepo: TrackRepository,
  limit = 20
): Promise<number> {
  const db = trackRepo.getDatabase();
  const rows = db
    .prepare(
      `SELECT id, file_path as filePath FROM tracks
       WHERE healthy_status = 'repaired' AND (is_missing = 0 OR is_missing IS NULL)
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(limit * 2) as { id: string; filePath: string }[];

  let backfilled = 0;
  for (const row of rows) {
    if (backfilled >= limit) break;
    const track = trackRepo.findById(row.id);
    if (!track) continue;

    // 若缓存已就绪则跳过
    if (healedCache.findCacheFile(track.id)) continue;

    // 若原文件不存在则跳过
    if (!fs.existsSync(track.filePath)) continue;

    try {
      const diagnosis = await diagnoseAudioFile(track.filePath);
      if (diagnosis.corruptions.length > 0) {
        const healingResult = await executeHealingPipeline(diagnosis);
        if (
          healingResult.success &&
          healingResult.healedPath &&
          fs.existsSync(healingResult.healedPath)
        ) {
          healedCache.persist(track.id, healingResult.healedPath, path.extname(track.filePath));
          backfilled++;
          logger.info(
            { trackId: track.id, title: track.title },
            '[自愈回填] 成功回填历史自愈曲目持久化缓存'
          );
        }
      }
    } catch (err) {
      logger.warn({ trackId: track.id, err }, '[自愈回填] 回填单轨自愈缓存失败，跳过');
    }
  }

  return backfilled;
}
