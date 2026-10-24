import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/client.js';

export interface LibraryRoot {
  path: string;
  kind: 'primary' | 'imported';
  createdAt: number;
}

export class LibraryRootRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * 获取所有登记的曲库根目录
   */
  getAllRoots(): LibraryRoot[] {
    const rows = this.db
      .prepare(
        'SELECT path, kind, created_at as createdAt FROM library_roots ORDER BY created_at ASC'
      )
      .all() as LibraryRoot[];
    return rows;
  }

  /**
   * 获取所有曲库根的绝对路径数组
   */
  getAllRootPaths(): string[] {
    return this.getAllRoots().map((r) => r.path);
  }

  /**
   * 按路径检索特定曲库根
   */
  getRoot(rootPath: string): LibraryRoot | null {
    const normalized = path.resolve(rootPath);
    const row = this.db
      .prepare('SELECT path, kind, created_at as createdAt FROM library_roots WHERE path = ?')
      .get(normalized) as LibraryRoot | undefined;
    return row || null;
  }

  /**
   * 注册或更新曲库根
   */
  upsertRoot(rootPath: string, kind: 'primary' | 'imported'): void {
    const normalized = path.resolve(rootPath);
    this.db
      .prepare(`
        INSERT INTO library_roots (path, kind, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET kind = excluded.kind
      `)
      .run(normalized, kind, Date.now());
  }

  /**
   * 删除曲库根
   */
  deleteRoot(rootPath: string): void {
    const normalized = path.resolve(rootPath);
    this.db.prepare('DELETE FROM library_roots WHERE path = ?').run(normalized);
  }
}
