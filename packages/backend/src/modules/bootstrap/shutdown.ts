import { stopServer } from '../gateway/server.js';
import { closeDatabase } from '../library/db/client.js';
import { getPlaybackRouter } from '../player/playback-router.js';
import { getWorkerPool } from '../transcoder/flac-standardizer.js';
import { logger } from './logger.js';

let isShuttingDown = false;

/**
 * 执行优雅停机流水线
 * 1. 停止声卡直通与 Web 回退播放
 * 2. 关闭 Fastify HTTP/WebSocket 网关通道
 * 3. 销毁多线程转码 Worker 线程池
 * 4. 执行 SQLite WAL Checkpoint (TRUNCATE) 并安全关闭连接
 * 5. 释放日志句柄，安全退出进程
 */
export async function gracefulShutdown(signal?: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, '[Shutdown] 捕获停机信号，正在执行优雅停机流水线...');

  try {
    // 1. 停止播放
    try {
      getPlaybackRouter().stop();
      logger.info('[Shutdown] 声卡播放与频谱流已停止');
    } catch (err) {
      logger.warn({ err }, '[Shutdown] 停止播放器时出现轻微异常');
    }

    // 2. 停机网关
    try {
      await stopServer();
      logger.info('[Shutdown] HTTP/WebSocket 网关已关闭');
    } catch (err) {
      logger.warn({ err }, '[Shutdown] 关闭网关时出现异常');
    }

    // 3. 终止转码线程池
    try {
      getWorkerPool().terminate();
      logger.info('[Shutdown] 转码多线程 Worker 池已释放');
    } catch (err) {
      logger.warn({ err }, '[Shutdown] 终止 Worker 池时出现异常');
    }

    // 4. 刷盘 SQLite WAL 预写日志并断开连接
    try {
      closeDatabase();
      logger.info('[Shutdown] SQLite 数据库已安全刷盘关闭');
    } catch (err) {
      logger.error({ err }, '[Shutdown] 关闭数据库连接时出现异常');
    }

    logger.info('[Shutdown] Wavelet 后端引擎已完全安全退出');
  } finally {
    process.exit(0);
  }
}

/**
 * 注册系统信号监听
 */
export function setupGracefulShutdown(): void {
  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
    // 忽略非致命流中断异常 (如快速切歌、声卡流关闭产生的 EPIPE / ECONNRESET)
    if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') {
      logger.warn({ err }, '[Runtime] 捕获并安全忽略非致命音频流管道通信中断 (EPIPE/ECONNRESET)');
      return;
    }
    logger.fatal({ err }, '[Shutdown] 捕获未处理致命异常 (uncaughtException)');
    void gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, '[Shutdown] 捕获未处理 Promise 拒绝 (unhandledRejection)');
  });
}
