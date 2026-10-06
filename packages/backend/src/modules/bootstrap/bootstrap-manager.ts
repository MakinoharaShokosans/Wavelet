import { performance } from 'node:perf_hooks';
import { APP_NAME, APP_VERSION } from '@wavelet/shared';
import { loadConfig } from '../../config/index.js';
import { startServer } from '../gateway/server.js';
import { getDatabase } from '../library/db/client.js';
import { runMigrations } from '../library/db/migrator.js';
import { type IntegrityAuditResult, IntegrityGuard } from '../library/integrity-guard.js';
import { syncMusicsDirectory } from '../library/musics-syncer.js';
import { type AudioDevice, getDeviceManager } from '../player/device-manager.js';
import { type RuntimeEnvironmentInfo, probeEnvironment } from './env-probe.js';
import { getInspectionLogger, getLogger, logger } from './logger.js';
import { type StorageTopology, provisionStorage } from './storage-provisioner.js';

export interface BootstrapResult {
  env: RuntimeEnvironmentInfo;
  topology: StorageTopology;
  devices: AudioDevice[];
  audit: IntegrityAuditResult;
  address: string;
  coldStartDurationMs: number;
}

export class BootstrapManager {
  private isBooted = false;

  /**
   * 执行 Wavelet 七步自愈冷启动全流水线
   * 1. 环境依赖探测 & 赋权
   * 2. 本地存储拓扑幂等建树 (~/.wavelet)
   * 3. 配置文件强校验与自愈补齐
   * 4. Pino 结构化双轨日志器初始化 (硬锁额度 <= 30MB)
   * 5. SQLite WAL 模式数据库初始化与增量版本迁移
   * 6. 物理声卡硬件枚举与发烧直通就绪
   * 7. 临时切片清理与物理曲库断链巡检
   * 8. Fastify HTTP/WS 本地网关监听就绪
   */
  async boot(customConfigPath?: string): Promise<BootstrapResult> {
    if (this.isBooted) {
      throw new Error('[BootstrapManager] 系统已完成引导启动，请勿重复调用');
    }

    const startTime = performance.now();

    // 1. 探测运行环境 (Node LTS、操作系统音频驱动、FFmpeg 可执行赋权)
    const env = probeEnvironment();

    // 2. 加载与自愈本地配置文件
    const config = loadConfig(customConfigPath);

    // 3. 幂等创建私有数据拓扑与工作目录
    const topology = provisionStorage();

    // 4. 初始化 Pino 双专轨流式日志 (锁定容量 <= 30MB)
    getLogger();
    getInspectionLogger();

    logger.info(`[${APP_NAME}] 正在启动自愈初始化流水线... (PID: ${process.pid})`);

    // 5. 初始化 SQLite WAL 模式数据库并执行增量版本迁移
    const db = getDatabase();
    runMigrations(db);

    // 6. 枚举声卡硬件输出设备
    const deviceManager = getDeviceManager();
    const devices = await deviceManager.listDevices();

    // 7. 清理非正常退出的临时切片，并对物理曲库执行断链巡检
    const integrityGuard = new IntegrityGuard();
    integrityGuard.cleanTempDirectory();
    const audit = integrityGuard.auditMissingFiles();

    // 7.1 专属根目录 musics 便携曲库自动增量同步
    try {
      await syncMusicsDirectory(config.storage.libraryDir);
    } catch (err) {
      logger.warn({ err }, '[BootstrapManager] 启动曲库自动同步失败，跳过');
    }

    // 8. 启动 Fastify REST 与 WebSocket 网关
    const address = await startServer();

    const coldStartDurationMs = Math.round(performance.now() - startTime);
    this.isBooted = true;

    // 输出冷启动就绪横幅 (严格要求冷启 < 150ms 规范)
    this.printReadyBanner(
      config.server.host,
      config.server.port,
      config.storage.libraryDir,
      coldStartDurationMs
    );

    return {
      env,
      topology,
      devices,
      audit,
      address,
      coldStartDurationMs,
    };
  }

  private printReadyBanner(
    host: string,
    port: number,
    libraryDir: string,
    coldStartMs: number
  ): void {
    const banner = [
      '=================================================================',
      `  🌊 ${APP_NAME} Backend Engine v${APP_VERSION} (Local-First)`,
      `  🚀 Ready at http://${host}:${port} (Cold Start: ${coldStartMs}ms)`,
      `  🎵 Library Directory: ${libraryDir}`,
      '  🔒 Local Session Protected (127.0.0.1 Only)',
      '=================================================================',
    ].join('\n');

    console.log(banner);
    logger.info({ coldStartMs, host, port, libraryDir }, `[${APP_NAME}] 核心引擎服务就绪`);
  }
}

let bootstrapManagerInstance: BootstrapManager | null = null;

export function getBootstrapManager(): BootstrapManager {
  if (!bootstrapManagerInstance) {
    bootstrapManagerInstance = new BootstrapManager();
  }
  return bootstrapManagerInstance;
}
