import type { Lyrics } from '@wavelet/shared';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/client.js';

interface LyricsRow {
  track_id: string;
  raw_lrc: string;
  offset_ms: number;
  updated_at: number;
}

export class LyricsRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  upsert(lyrics: Lyrics): void {
    const now = Date.now();
    this.db
      .prepare(`
        INSERT INTO lyrics (track_id, raw_lrc, offset_ms, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(track_id) DO UPDATE SET
          raw_lrc = excluded.raw_lrc,
          offset_ms = excluded.offset_ms,
          updated_at = excluded.updated_at
      `)
      .run(lyrics.trackId, lyrics.rawLrc, lyrics.offsetMs, now);
  }

  findByTrackId(trackId: string): Lyrics | null {
    const row = this.db.prepare('SELECT * FROM lyrics WHERE track_id = ?').get(trackId) as
      | LyricsRow
      | undefined;

    if (!row) return null;

    return {
      trackId: row.track_id,
      rawLrc: row.raw_lrc,
      offsetMs: row.offset_ms,
      updatedAt: row.updated_at,
    };
  }

  delete(trackId: string): boolean {
    const result = this.db.prepare('DELETE FROM lyrics WHERE track_id = ?').run(trackId);
    return result.changes > 0;
  }
}
