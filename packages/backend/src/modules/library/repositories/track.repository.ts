import type {
  HealthyStatus,
  LibraryStats,
  PaginatedResult,
  Track,
  TrackQueryParams,
} from '@wavelet/shared';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/client.js';

interface TrackRow {
  id: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string | null;
  duration: number;
  bitrate: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  file_path: string;
  file_size: number;
  file_hash: string;
  has_embedded_cover: number;
  has_embedded_lyrics: number;
  healthy_status: string;
  repair_details: string | null;
  play_count: number | null;
  last_played_at: number | null;
  is_trashed: number | null;
  is_missing: number | null;
  missing_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapRowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist ?? undefined,
    duration: row.duration,
    bitrate: row.bitrate,
    sampleRate: row.sample_rate,
    bitDepth: row.bit_depth,
    channels: row.channels,
    filePath: row.file_path,
    fileSize: row.file_size,
    fileHash: row.file_hash,
    hasEmbeddedCover: Boolean(row.has_embedded_cover),
    hasEmbeddedLyrics: Boolean(row.has_embedded_lyrics),
    healthyStatus: row.healthy_status as HealthyStatus,
    repairDetails: row.repair_details ? JSON.parse(row.repair_details) : undefined,
    playCount: row.play_count ?? 0,
    lastPlayedAt: row.last_played_at ?? undefined,
    isTrashed: Boolean(row.is_trashed),
    isMissing: Boolean(row.is_missing),
    missingAt: row.missing_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TrackRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  insert(track: Track): void {
    const stmt = this.db.prepare(`
      INSERT INTO tracks (
        id, title, artist, album, album_artist, duration, bitrate, sample_rate,
        bit_depth, channels, file_path, file_size, file_hash, has_embedded_cover,
        has_embedded_lyrics, healthy_status, repair_details, play_count, last_played_at,
        is_trashed, is_missing, missing_at, created_at, updated_at
      ) VALUES (
        @id, @title, @artist, @album, @album_artist, @duration, @bitrate, @sample_rate,
        @bit_depth, @channels, @file_path, @file_size, @file_hash, @has_embedded_cover,
        @has_embedded_lyrics, @healthy_status, @repair_details, @play_count, @last_played_at,
        @is_trashed, @is_missing, @missing_at, @created_at, @updated_at
      )
    `);

    stmt.run({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      album_artist: track.albumArtist ?? null,
      duration: track.duration,
      bitrate: track.bitrate,
      sample_rate: track.sampleRate,
      bit_depth: track.bitDepth,
      channels: track.channels,
      file_path: track.filePath,
      file_size: track.fileSize,
      file_hash: track.fileHash,
      has_embedded_cover: track.hasEmbeddedCover ? 1 : 0,
      has_embedded_lyrics: track.hasEmbeddedLyrics ? 1 : 0,
      healthy_status: track.healthyStatus,
      repair_details: track.repairDetails ? JSON.stringify(track.repairDetails) : null,
      play_count: track.playCount ?? 0,
      last_played_at: track.lastPlayedAt ?? null,
      is_trashed: track.isTrashed ? 1 : 0,
      is_missing: track.isMissing ? 1 : 0,
      missing_at: track.missingAt ?? null,
      created_at: track.createdAt,
      updated_at: track.updatedAt,
    });
  }

  findById(id: string): Track | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as
      | TrackRow
      | undefined;
    return row ? mapRowToTrack(row) : null;
  }

  findByHash(fileHash: string): Track | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE file_hash = ?').get(fileHash) as
      | TrackRow
      | undefined;
    return row ? mapRowToTrack(row) : null;
  }

  findByPath(filePath: string): Track | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE file_path = ?').get(filePath) as
      | TrackRow
      | undefined;
    return row ? mapRowToTrack(row) : null;
  }

  getAllTracks(includeTrashed = false): Track[] {
    const sql = includeTrashed
      ? 'SELECT * FROM tracks ORDER BY created_at ASC'
      : 'SELECT * FROM tracks WHERE is_trashed = 0 ORDER BY created_at ASC';
    const rows = this.db.prepare(sql).all() as TrackRow[];
    return rows.map(mapRowToTrack);
  }

  recordPlayback(id: string): void {
    const now = Date.now();
    this.db
      .prepare(
        'UPDATE tracks SET play_count = COALESCE(play_count, 0) + 1, last_played_at = ?, updated_at = ? WHERE id = ?'
      )
      .run(now, now, id);
  }

  getStats(): LibraryStats {
    const trackStats = this.db
      .prepare(`
        SELECT 
          COUNT(*) as track_count,
          COALESCE(SUM(duration), 0) as total_duration,
          COALESCE(AVG(duration), 0) as avg_duration
        FROM tracks
        WHERE is_trashed = 0
      `)
      .get() as { track_count: number; total_duration: number; avg_duration: number };

    const playlistCountRow = this.db
      .prepare("SELECT COUNT(*) as playlist_count FROM playlists WHERE id != 'default_trash'")
      .get() as { playlist_count: number };

    const totalSeconds = Math.round(trackStats.total_duration);
    const avgSeconds = Math.round(trackStats.avg_duration);

    const avgMinutes = Math.floor(avgSeconds / 60);
    const avgRemainingSecs = avgSeconds % 60;
    const avgDurationFormatted = `${String(avgMinutes).padStart(2, '0')}:${String(avgRemainingSecs).padStart(2, '0')}`;

    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
    const totalDurationFormatted =
      totalHours > 0 ? `${totalHours} 小时 ${totalMinutes} 分钟` : `${totalMinutes} 分钟`;

    return {
      trackCount: trackStats.track_count,
      playlistCount: playlistCountRow.playlist_count,
      totalDurationSeconds: totalSeconds,
      avgDurationSeconds: avgSeconds,
      avgDurationFormatted,
      totalDurationFormatted,
    };
  }

  findAll(params: TrackQueryParams = {}): PaginatedResult<Track> {
    const {
      keyword,
      artist,
      album,
      healthyStatus,
      sort,
      trashed,
      page = 1,
      pageSize = 50,
    } = params;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (trashed) {
      conditions.push('is_trashed = 1');
    } else {
      conditions.push('is_trashed = 0');
    }

    if (keyword) {
      conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ?)');
      const like = `%${keyword}%`;
      queryParams.push(like, like, like);
    }
    if (artist) {
      conditions.push('artist = ?');
      queryParams.push(artist);
    }
    if (album) {
      conditions.push('album = ?');
      queryParams.push(album);
    }
    if (healthyStatus) {
      conditions.push('healthy_status = ?');
      queryParams.push(healthyStatus);
    }
    if (sort === 'hires') {
      conditions.push('(sample_rate >= 88200 OR bit_depth >= 24)');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderByClause = 'created_at DESC';
    if (sort === 'played') {
      orderByClause = 'last_played_at DESC, created_at DESC';
    } else if (sort === 'frequent') {
      orderByClause = 'play_count DESC, created_at DESC';
    } else if (sort === 'hires') {
      orderByClause = 'sample_rate DESC, bit_depth DESC';
    } else if (sort === 'title') {
      orderByClause = 'title ASC';
    } else if (sort === 'artist') {
      orderByClause = 'artist ASC';
    }

    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM tracks ${whereClause}`)
      .get(...queryParams) as { count: number };
    const total = countRow.count;

    const rows = this.db
      .prepare(`SELECT * FROM tracks ${whereClause} ORDER BY ${orderByClause} LIMIT ? OFFSET ?`)
      .all(...queryParams, pageSize, offset) as TrackRow[];

    return {
      items: rows.map(mapRowToTrack),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  update(id: string, updates: Partial<Track>): void {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: Date.now() };

    const directFields: Array<[keyof Track, string]> = [
      ['title', 'title'],
      ['artist', 'artist'],
      ['album', 'album'],
      ['albumArtist', 'album_artist'],
      ['filePath', 'file_path'],
      ['fileSize', 'file_size'],
      ['fileHash', 'file_hash'],
      ['duration', 'duration'],
      ['bitrate', 'bitrate'],
      ['sampleRate', 'sample_rate'],
      ['bitDepth', 'bit_depth'],
      ['channels', 'channels'],
      ['healthyStatus', 'healthy_status'],
      ['playCount', 'play_count'],
      ['missingAt', 'missing_at'],
    ];

    for (const [key, col] of directFields) {
      if (updates[key] !== undefined) {
        setClauses.push(`${col} = @${col}`);
        params[col] = updates[key];
      }
    }

    const booleanFields: Array<[keyof Track, string]> = [
      ['hasEmbeddedCover', 'has_embedded_cover'],
      ['hasEmbeddedLyrics', 'has_embedded_lyrics'],
      ['isTrashed', 'is_trashed'],
      ['isMissing', 'is_missing'],
    ];

    for (const [key, col] of booleanFields) {
      if (updates[key] !== undefined) {
        setClauses.push(`${col} = @${col}`);
        params[col] = updates[key] ? 1 : 0;
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push('updated_at = @updated_at');

    const sql = `UPDATE tracks SET ${setClauses.join(', ')} WHERE id = @id`;
    this.db.prepare(sql).run(params);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getMissingTracks(): Track[] {
    const rows = this.db
      .prepare('SELECT * FROM tracks WHERE is_missing = 1 ORDER BY updated_at DESC')
      .all() as TrackRow[];
    return rows.map(mapRowToTrack);
  }

  pruneMissingTracks(): number {
    const result = this.db.prepare('DELETE FROM tracks WHERE is_missing = 1').run();
    return result.changes;
  }

  getAllFilePaths(): { id: string; filePath: string }[] {
    const rows = this.db.prepare('SELECT id, file_path FROM tracks').all() as {
      id: string;
      file_path: string;
    }[];
    return rows.map((r) => ({ id: r.id, filePath: r.file_path }));
  }

  count(includeTrashed = false): number {
    const sql = includeTrashed
      ? 'SELECT COUNT(*) as count FROM tracks'
      : 'SELECT COUNT(*) as count FROM tracks WHERE is_trashed = 0';
    const row = this.db.prepare(sql).get() as { count: number };
    return row.count;
  }
}
