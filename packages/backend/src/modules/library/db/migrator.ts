import type Database from 'better-sqlite3';
import { logger } from '../../bootstrap/logger.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db) => {
      // 1. 曲目表 (单物理实例单例映射)
      db.exec(`
        CREATE TABLE IF NOT EXISTS tracks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          artist TEXT NOT NULL DEFAULT 'Unknown',
          album TEXT NOT NULL DEFAULT 'Unknown',
          album_artist TEXT,
          duration REAL NOT NULL,
          bitrate INTEGER NOT NULL,
          sample_rate INTEGER NOT NULL,
          bit_depth INTEGER NOT NULL,
          channels INTEGER NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          file_size INTEGER NOT NULL,
          file_hash TEXT NOT NULL UNIQUE,
          has_embedded_cover BOOLEAN DEFAULT 0,
          has_embedded_lyrics BOOLEAN DEFAULT 0,
          healthy_status TEXT NOT NULL,
          repair_details TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_search ON tracks(title, artist, album);
        CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks(file_hash);
      `);

      // 2. 歌单表
      db.exec(`
        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          is_default BOOLEAN DEFAULT 0,
          cover_image_path TEXT,
          track_count INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 3. 歌单-曲目多对多关联表
      db.exec(`
        CREATE TABLE IF NOT EXISTS playlist_tracks (
          playlist_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          sort_order REAL NOT NULL,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (playlist_id, track_id),
          FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_playlist_tracks_order ON playlist_tracks(playlist_id, sort_order);
      `);

      // 4. 歌词表
      db.exec(`
        CREATE TABLE IF NOT EXISTS lyrics (
          track_id TEXT PRIMARY KEY,
          raw_lrc TEXT NOT NULL,
          offset_ms INTEGER DEFAULT 0,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );
      `);

      // 5. 运行时键值热配置表
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      // 6. 初始化默认歌单 ("全部音乐")
      const now = Date.now();
      const insertDefaultStmt = db.prepare(`
        INSERT OR IGNORE INTO playlists (id, name, description, is_default, track_count, created_at, updated_at)
        VALUES ('default_all_tracks', '全部音乐', '系统默认原始曲库', 1, 0, ?, ?);
      `);
      insertDefaultStmt.run(now, now);
    },
  },
  {
    version: 2,
    name: '002_nested_playlists',
    up: (db) => {
      // 1. 为 playlists 表扩充 parent_id 与 is_folder 字段，支持无限级目录树与分类文件夹
      db.exec(`
        ALTER TABLE playlists ADD COLUMN parent_id TEXT REFERENCES playlists(id) ON DELETE CASCADE;
        ALTER TABLE playlists ADD COLUMN is_folder BOOLEAN DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_playlists_parent ON playlists(parent_id);
      `);
    },
  },
  {
    version: 3,
    name: '003_web_support',
    up: (db) => {
      // 1. 为 tracks 表增加 play_count 与 last_played_at
      db.exec(`
        ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0;
        ALTER TABLE tracks ADD COLUMN last_played_at INTEGER;
        CREATE INDEX IF NOT EXISTS idx_tracks_play_stats ON tracks(play_count DESC, last_played_at DESC);
      `);

      // 2. 初始化预置系统歌单: 未集成歌单与心动收藏
      const now = Date.now();
      const insertDefaultStmt = db.prepare(`
        INSERT OR IGNORE INTO playlists (id, name, description, is_default, parent_id, is_folder, track_count, created_at, updated_at)
        VALUES (?, ?, ?, 1, NULL, 0, 0, ?, ?);
      `);
      insertDefaultStmt.run(
        'default_unintegrated_tracks',
        '未集成歌单',
        '新导入待归类音乐',
        now,
        now
      );
      insertDefaultStmt.run('default_favorites', '心动收藏', '标记为喜爱的音乐精选', now, now);
    },
  },
  {
    version: 4,
    name: '004_trash_playlist',
    up: (db) => {
      // 1. 为 tracks 表增加 is_trashed 字段，用于支持安全软删除与隔离
      db.exec(`
        ALTER TABLE tracks ADD COLUMN is_trashed BOOLEAN DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_tracks_trashed ON tracks(is_trashed);
      `);

      // 2. 初始化预置系统歌单: 回收歌单
      const now = Date.now();
      const insertDefaultStmt = db.prepare(`
        INSERT OR IGNORE INTO playlists (id, name, description, is_default, parent_id, is_folder, track_count, created_at, updated_at)
        VALUES (?, ?, ?, 1, NULL, 0, 0, ?, ?);
      `);
      insertDefaultStmt.run('default_trash', '回收歌单', '已删除待清理或恢复的音乐', now, now);
    },
  },
  {
    version: 5,
    name: '005_soft_missing_tracks',
    up: (db) => {
      // 1. 为 tracks 表增加 is_missing 与 missing_at 字段，用于支持物理断链软失效与防灾保护 (ISSUE-03)
      db.exec(`
        ALTER TABLE tracks ADD COLUMN is_missing BOOLEAN DEFAULT 0;
        ALTER TABLE tracks ADD COLUMN missing_at INTEGER;
        CREATE INDEX IF NOT EXISTS idx_tracks_missing ON tracks(is_missing);
      `);
    },
  },
];

/**
 * 执行轻量版本化迁移
 * 零额外 ORM/迁移库依赖，直接通过 SQLite 原生事务同步执行
 */
export function runMigrations(db: Database.Database): void {
  // 建立内部迁移版本追踪表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM _schema_migrations ORDER BY version ASC')
    .all() as { version: number }[];
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const pendingMigrations = migrations.filter((m) => !appliedSet.has(m.version));

  if (pendingMigrations.length === 0) {
    logger.debug('[Migrator] 数据库架构已是最新版本，无需迁移');
    return;
  }

  for (const migration of pendingMigrations) {
    logger.info(
      { version: migration.version, name: migration.name },
      '[Migrator] 正在执行增量架构迁移...'
    );

    const executeMigration = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        Date.now()
      );
    });

    try {
      executeMigration();
      logger.info({ version: migration.version, name: migration.name }, '[Migrator] 迁移应用成功');
    } catch (err) {
      logger.error(
        { version: migration.version, name: migration.name, err },
        '[Migrator] 迁移应用失败，事务已自动全量回滚'
      );
      throw err;
    }
  }
}
