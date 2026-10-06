import Database from 'better-sqlite3';
import { getConfig } from '../../../config/index.js';
import { logger } from '../../bootstrap/logger.js';

let dbInstance: Database.Database | null = null;

/**
 * 获取 SQLite 数据库单例连接
 * 默认开启预写日志 (WAL) 模式与内存级优化
 */
export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const config = getConfig();
  const dbPath = config.storage.databaseFile;

  try {
    dbInstance = new Database(dbPath, {
      fileMustExist: false,
    });

    // 核心性能与安全 PRAGMA 优化
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('temp_store = MEMORY');

    logger.info({ dbPath }, '[Database] SQLite WAL 模式数据库连接成功');
    return dbInstance;
  } catch (err) {
    logger.error({ dbPath, err }, '[Database] 打开 SQLite 数据库失败');
    throw new Error(`无法打开数据库 ${dbPath}: ${(err as Error).message}`);
  }
}

/**
 * 优雅安全关闭数据库连接 (落盘 WAL 日志)
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      dbInstance.close();
      logger.info('[Database] SQLite 数据库连接已安全关闭 (WAL Checkpoint 完成)');
    } catch (err) {
      logger.error({ err }, '[Database] 关闭数据库时发生错误');
    } finally {
      dbInstance = null;
    }
  }
}
