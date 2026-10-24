import { getBootstrapManager } from './modules/bootstrap/bootstrap-manager.js';
import { logger } from './modules/bootstrap/logger.js';
import { setupGracefulShutdown } from './modules/bootstrap/shutdown.js';

// 导出所有核心模块
export * from './config/index.js';
export * from './modules/bootstrap/bootstrap-manager.js';
export * from './modules/bootstrap/env-probe.js';
export * from './modules/bootstrap/logger.js';
export * from './modules/bootstrap/shutdown.js';
export * from './modules/bootstrap/storage-provisioner.js';
export * from './modules/gateway/server.js';
export * from './modules/gateway/middleware/host-origin-guard.js';
export * from './modules/gateway/middleware/session-guard.js';
export * from './modules/inspector/pipeline.js';
export * from './modules/inspector/sniffer.js';
export * from './modules/inspector/types.js';
export * from './modules/inspector/healers/frame-align-healer.js';
export * from './modules/inspector/healers/flac-streaminfo-healer.js';
export * from './modules/inspector/healers/wav-header-healer.js';
export * from './modules/inspector/healers/tail-cleaner.js';
export * from './modules/inspector/healers/crc-interpolator.js';
export * from './modules/inspector/waveform-extractor.js';
export { default as Database } from 'better-sqlite3';
export * from './modules/library/backup-manager.js';
export * from './modules/library/db/client.js';
export * from './modules/library/db/migrator.js';
export * from './modules/library/integrity-guard.js';
export * from './modules/library/healed-cache.js';
export * from './modules/library/path-guard.js';
export * from './modules/library/repositories/library-root.repository.js';
export * from './modules/library/repositories/lyrics.repository.js';
export * from './modules/library/repositories/playlist.repository.js';
export * from './modules/library/repositories/track.repository.js';
export * from './modules/library/musics-syncer.js';
export * from './modules/library/sidecar-detector.js';
export * from './modules/player/device-manager.js';
export * from './modules/player/direct-pcm-player.js';
export * from './modules/player/fft-pump.js';
export * from './modules/player/playback-router.js';
export * from './modules/transcoder/flac-standardizer.js';
export * from './modules/transcoder/metadata-writer.js';
export * from './modules/transcoder/worker-pool.js';

/**
 * 启动 Wavelet 后端主服务
 */
export async function startApp(): Promise<void> {
  // 1. 注册优雅停机信号处理
  setupGracefulShutdown();

  // 2. 执行完整引导与启动自愈流水线
  const bootstrapManager = getBootstrapManager();
  try {
    await bootstrapManager.boot();
  } catch (err) {
    logger.fatal({ err }, '[Wavelet] 引导启动失败，服务退出');
    process.exit(1);
  }
}

// 作为主模块直接执行时自动启动
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('index.ts') ||
  process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.mjs');

if (isMain) {
  void startApp();
}
