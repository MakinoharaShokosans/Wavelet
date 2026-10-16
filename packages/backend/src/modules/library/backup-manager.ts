import fs from 'node:fs';
import path from 'node:path';
import type { Playlist, Track } from '@wavelet/shared';
import AdmZip from 'adm-zip';
export { default as AdmZip } from 'adm-zip';
import { resolveHome } from '../../config/defaults.js';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { getDatabase } from './db/client.js';
import { PlaylistRepository } from './repositories/playlist.repository.js';
import { TrackRepository } from './repositories/track.repository.js';

export interface BackupManifest {
  version: number;
  app: string;
  exportedAt: number;
  trackCount: number;
  playlistCount: number;
  includeAudio: boolean;
}

export interface PlaylistTrackRelationRow {
  playlist_id: string;
  track_id: string;
  sort_order: number;
  added_at: number;
}

export interface LyricsRow {
  track_id: string;
  raw_lrc: string;
  offset_ms: number;
  updated_at: number;
}

export interface BackupDatabaseDump {
  tracks: (Track & { archiveRelativePath: string })[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrackRelationRow[];
  lyrics: LyricsRow[];
}

export interface ExportBackupOptions {
  targetZipPath?: string;
  includeAudio?: boolean;
  onProgress?: (stage: string, percent: number, message: string) => void;
}

export interface ExportBackupResult {
  success: boolean;
  targetZipPath: string;
  fileSize: number;
  trackCount: number;
  playlistCount: number;
}

export interface ImportBackupOptions {
  destinationAudioDir?: string;
  onProgress?: (stage: string, percent: number, message: string) => void;
}

export interface ImportBackupResult {
  success: boolean;
  restoredTracks: number;
  restoredPlaylists: number;
  destinationAudioDir: string;
}

function sanitizePathComponent(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unknown';
}

function buildArchiveRelativePath(track: Track): string {
  const safeArtist = sanitizePathComponent(track.artist || 'Unknown_Artist');
  const safeAlbum = sanitizePathComponent(track.album || 'Unknown_Album');
  const safeTitle = sanitizePathComponent(track.title || track.id);
  const ext = path.extname(track.filePath) || '.flac';
  return path.posix.join('audio', safeArtist, safeAlbum, `${safeTitle}${ext}`);
}

export class BackupManager {
  private trackRepo = new TrackRepository();
  private playlistRepo = new PlaylistRepository();
  private db = getDatabase();

  /**
   * 导出曲库全量备份包 (.zip)
   */
  async exportBackup(options: ExportBackupOptions = {}): Promise<ExportBackupResult> {
    const config = getConfig();
    const includeAudio = options.includeAudio !== false;
    const timestamp = Date.now();
    const targetZipPath =
      options.targetZipPath || path.join(resolveHome('~'), `Wavelet_Backup_${timestamp}.zip`);

    options.onProgress?.('gathering', 10, '正在检索曲库与数据库记录...');

    const rawTracks = this.trackRepo.getAllTracks();
    const playlists = this.playlistRepo.findAll();

    const playlistTracks = this.db
      .prepare('SELECT playlist_id, track_id, sort_order, added_at FROM playlist_tracks')
      .all() as PlaylistTrackRelationRow[];

    const lyrics = this.db
      .prepare('SELECT track_id, raw_lrc, offset_ms, updated_at FROM lyrics')
      .all() as LyricsRow[];

    const zip = new AdmZip();

    // 1. 打包物理音频文件与相对路径
    const archivedTracks: (Track & { archiveRelativePath: string })[] = [];
    const total = rawTracks.length;

    for (let i = 0; i < total; i++) {
      const track = rawTracks[i];
      const relPath = buildArchiveRelativePath(track);
      archivedTracks.push({ ...track, archiveRelativePath: relPath });

      if (includeAudio && fs.existsSync(track.filePath)) {
        const zipDir = path.dirname(relPath);
        const zipName = path.basename(relPath);
        zip.addLocalFile(track.filePath, zipDir, zipName);
      }

      // 提取专辑封面缓存
      const coverCachePath = path.join(config.storage.cacheDir, 'covers', `${track.fileHash}.webp`);
      if (fs.existsSync(coverCachePath)) {
        zip.addLocalFile(coverCachePath, 'covers', `${track.fileHash}.webp`);
      }

      // 提取 128 点波形缓存
      const waveformCachePath = path.join(
        config.storage.cacheDir,
        'waveforms',
        `${track.fileHash}.json`
      );
      if (fs.existsSync(waveformCachePath)) {
        zip.addLocalFile(waveformCachePath, 'waveforms', `${track.fileHash}.json`);
      }

      if (i % 5 === 0 || i === total - 1) {
        const percent = Math.min(85, Math.round(15 + (i / (total || 1)) * 70));
        options.onProgress?.(
          'archiving',
          percent,
          `正在打包音频 (${i + 1}/${total}): ${track.title}`
        );
      }
    }

    // 打包歌单封面缓存 (确保跨电脑迁移歌单封面物理拷贝完整保留)
    for (const pl of playlists) {
      if (pl.coverImagePath && fs.existsSync(pl.coverImagePath)) {
        zip.addLocalFile(pl.coverImagePath, 'covers', path.basename(pl.coverImagePath));
      }
    }

    // 2. 构造并写入 manifest.json 与 database.json
    options.onProgress?.('compressing', 88, '正在生成跨机器结构化数据库与清单...');

    const manifest: BackupManifest = {
      version: 1,
      app: 'Wavelet',
      exportedAt: timestamp,
      trackCount: archivedTracks.length,
      playlistCount: playlists.length,
      includeAudio,
    };

    const databaseDump: BackupDatabaseDump = {
      tracks: archivedTracks,
      playlists,
      playlistTracks,
      lyrics,
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    zip.addFile('database.json', Buffer.from(JSON.stringify(databaseDump, null, 2), 'utf-8'));

    // 3. 压缩落盘
    options.onProgress?.('finalizing', 95, '正在将备份包持久化写入磁盘...');

    const outDir = path.dirname(targetZipPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    zip.writeZip(targetZipPath);
    const stat = fs.statSync(targetZipPath);

    logger.info({ targetZipPath, size: stat.size }, '[Backup] 全量曲库备份导出成功');
    options.onProgress?.('completed', 100, '曲库备份导出完成！');

    return {
      success: true,
      targetZipPath,
      fileSize: stat.size,
      trackCount: archivedTracks.length,
      playlistCount: playlists.length,
    };
  }

  /**
   * 从曲库备份包 (.zip) 还原并重映射路径
   */
  async importBackup(
    zipSource: string | Buffer,
    options: ImportBackupOptions = {}
  ): Promise<ImportBackupResult> {
    const config = getConfig();
    const destAudioDir =
      options.destinationAudioDir ||
      config.storage.libraryDir ||
      resolveHome('~/Music/Wavelet_Library');

    options.onProgress?.('inspecting', 10, '正在校验备份压缩包完整性...');

    if (typeof zipSource === 'string' && !fs.existsSync(zipSource)) {
      throw new Error(`备份文件不存在: ${zipSource}`);
    }

    const zip = new AdmZip(zipSource);

    // 1. 读取并校验 manifest.json
    const manifestEntry = zip.getEntry('manifest.json');
    if (!manifestEntry) {
      throw new Error('非法备份包：缺少 manifest.json 描述文件');
    }
    const manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as BackupManifest;
    if (manifest.app !== 'Wavelet') {
      throw new Error(`不支持的备份文件格式: ${manifest.app}`);
    }

    // 2. 读取 database.json
    const dbEntry = zip.getEntry('database.json');
    if (!dbEntry) {
      throw new Error('非法备份包：缺少 database.json 结构化数据');
    }
    const dump = JSON.parse(dbEntry.getData().toString('utf-8')) as BackupDatabaseDump;

    if (!fs.existsSync(destAudioDir)) {
      fs.mkdirSync(destAudioDir, { recursive: true });
    }

    // 3. 解压并重映射音频物理文件
    const totalTracks = dump.tracks.length;
    for (let i = 0; i < totalTracks; i++) {
      const archivedTrack = dump.tracks[i];
      let finalAudioPath = archivedTrack.filePath;

      if (archivedTrack.archiveRelativePath) {
        const audioEntry = zip.getEntry(archivedTrack.archiveRelativePath);
        if (audioEntry) {
          const strippedRelative = archivedTrack.archiveRelativePath.replace(/^audio\//, '');
          const localDestPath = path.join(destAudioDir, strippedRelative);
          const localDestFolder = path.dirname(localDestPath);

          if (!fs.existsSync(localDestFolder)) {
            fs.mkdirSync(localDestFolder, { recursive: true });
          }

          fs.writeFileSync(localDestPath, audioEntry.getData());
          finalAudioPath = localDestPath;
        }
      }

      // 重映射 filePath 为当前新电脑的真实本地路径
      archivedTrack.filePath = finalAudioPath;

      // 插入或更新数据库记录
      const existing = this.trackRepo.findByHash(archivedTrack.fileHash);
      if (existing) {
        this.db
          .prepare('UPDATE tracks SET file_path = ?, updated_at = ? WHERE file_hash = ?')
          .run(finalAudioPath, Date.now(), archivedTrack.fileHash);
      } else {
        this.trackRepo.insert(archivedTrack);
      }

      if (i % 5 === 0 || i === totalTracks - 1) {
        const percent = Math.min(80, Math.round(15 + (i / (totalTracks || 1)) * 65));
        options.onProgress?.(
          'restoring_audio',
          percent,
          `正在还原音轨 (${i + 1}/${totalTracks}): ${archivedTrack.title}`
        );
      }
    }

    // 4. 还原封面与波形缓存
    const coverCacheDir = path.join(config.storage.cacheDir, 'covers');
    const waveformCacheDir = path.join(config.storage.cacheDir, 'waveforms');
    fs.mkdirSync(coverCacheDir, { recursive: true });
    fs.mkdirSync(waveformCacheDir, { recursive: true });

    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith('covers/') && !entry.isDirectory) {
        fs.writeFileSync(path.join(coverCacheDir, path.basename(entry.entryName)), entry.getData());
      } else if (entry.entryName.startsWith('waveforms/') && !entry.isDirectory) {
        fs.writeFileSync(
          path.join(waveformCacheDir, path.basename(entry.entryName)),
          entry.getData()
        );
      }
    }

    // 5. 还原歌单与关联
    options.onProgress?.('restoring_db', 85, '正在还原歌单、心动收藏与歌词...');

    for (const pl of dump.playlists) {
      if (!pl.isDefault) {
        const remappedCover = pl.coverImagePath
          ? path.join(coverCacheDir, path.basename(pl.coverImagePath))
          : null;
        const existing = this.playlistRepo.findById(pl.id);
        if (!existing) {
          this.db
            .prepare(`
              INSERT OR IGNORE INTO playlists (id, name, description, is_default, parent_id, is_folder, cover_image_path, track_count, created_at, updated_at)
              VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              pl.id,
              pl.name,
              pl.description ?? null,
              pl.parentId ?? null,
              pl.isFolder ? 1 : 0,
              remappedCover,
              pl.trackCount ?? 0,
              pl.createdAt || Date.now(),
              pl.updatedAt || Date.now()
            );
        } else if (remappedCover) {
          this.db
            .prepare('UPDATE playlists SET cover_image_path = ? WHERE id = ?')
            .run(remappedCover, pl.id);
        }
      }
    }

    // 还原歌单关联
    const insertRelationStmt = this.db.prepare(
      'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, sort_order, added_at) VALUES (?, ?, ?, ?)'
    );
    for (const rel of dump.playlistTracks) {
      insertRelationStmt.run(rel.playlist_id, rel.track_id, rel.sort_order, rel.added_at);
    }

    // 还原歌词
    const insertLyricStmt = this.db.prepare(
      'INSERT OR REPLACE INTO lyrics (track_id, raw_lrc, offset_ms, updated_at) VALUES (?, ?, ?, ?)'
    );
    for (const lyr of dump.lyrics) {
      insertLyricStmt.run(
        lyr.track_id,
        lyr.raw_lrc,
        lyr.offset_ms ?? 0,
        lyr.updated_at || Date.now()
      );
    }

    // 校准歌单实际曲目数 (ISSUE-08)
    this.playlistRepo.recalibrateTrackCounts();

    options.onProgress?.('completed', 100, '曲库备份恢复完毕！');
    logger.info(
      { tracks: totalTracks, playlists: dump.playlists.length },
      '[Backup] 跨机器曲库全量恢复完成'
    );

    return {
      success: true,
      restoredTracks: totalTracks,
      restoredPlaylists: dump.playlists.length,
      destinationAudioDir: destAudioDir,
    };
  }
}
