import fs from 'node:fs';
import path from 'node:path';
import type { WaveletConfig } from '@wavelet/shared';
import { getDefaultConfig, resolveHome } from './defaults';
import {
  AudioConfigSchema,
  LoggingConfigSchema,
  ServerConfigSchema,
  StorageConfigSchema,
  TranscoderConfigSchema,
  WaveletConfigSchema,
} from './schema';

export * from './defaults';
export * from './schema';

let activeConfig: WaveletConfig | null = null;

/**
 * 获取配置文件标准物理存储路径 (优先环境变量 WAVELET_CONFIG_PATH，默认 ~/.wavelet/config.json)
 */
export function getDefaultConfigPath(): string {
  if (process.env.WAVELET_CONFIG_PATH) {
    return resolveHome(process.env.WAVELET_CONFIG_PATH);
  }
  return resolveHome('~/.wavelet/config.json');
}

/**
 * 环境变量覆盖运行时配置
 */
export function applyEnvOverrides(config: WaveletConfig): WaveletConfig {
  const host = process.env.WAVELET_HOST || process.env.HOST;
  const port = process.env.WAVELET_PORT || process.env.PORT;
  const libraryDir = process.env.WAVELET_LIBRARY_DIR;
  const logLevel = process.env.WAVELET_LOG_LEVEL || process.env.LOG_LEVEL;

  if (host) {
    config.server.host = host;
  }
  if (port) {
    const parsedPort = Number.parseInt(port, 10);
    if (!Number.isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      config.server.port = parsedPort;
    }
  }
  if (libraryDir) {
    config.storage.libraryDir = resolveHome(libraryDir);
  }
  if (logLevel && ['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    config.logging.level = logLevel as 'debug' | 'info' | 'warn' | 'error';
  }

  return config;
}

function resolveLibraryDir(rawDir: string | undefined, defaultDir: string): string {
  if (
    !rawDir ||
    rawDir.includes('Wavelet_Library') ||
    rawDir === './musics' ||
    rawDir === 'musics'
  ) {
    return defaultDir;
  }
  return resolveHome(rawDir);
}

/**
 * 当校验未通过时，按小节模块化自愈补齐缺失/破损字段
 */
function healConfig(rawObj: Record<string, unknown>, defaults: WaveletConfig): WaveletConfig {
  const serverResult = ServerConfigSchema.safeParse(rawObj.server);
  const storageResult = StorageConfigSchema.safeParse(rawObj.storage);
  const audioResult = AudioConfigSchema.safeParse(rawObj.audio);
  const transcoderResult = TranscoderConfigSchema.safeParse(rawObj.transcoder);
  const loggingResult = LoggingConfigSchema.safeParse(rawObj.logging);

  return {
    version:
      typeof rawObj.version === 'number' && rawObj.version > 0 ? rawObj.version : defaults.version,
    server: serverResult.success ? serverResult.data : defaults.server,
    storage: storageResult.success
      ? {
          dataDir: resolveHome(storageResult.data.dataDir),
          libraryDir: resolveLibraryDir(storageResult.data.libraryDir, defaults.storage.libraryDir),
          quarantineDir: resolveHome(storageResult.data.quarantineDir),
          cacheDir: resolveHome(storageResult.data.cacheDir),
          logsDir: resolveHome(storageResult.data.logsDir),
          databaseFile: resolveHome(storageResult.data.databaseFile),
          titleParseMode: storageResult.data.titleParseMode || defaults.storage.titleParseMode,
        }
      : defaults.storage,
    audio: audioResult.success ? audioResult.data : defaults.audio,
    transcoder: transcoderResult.success ? transcoderResult.data : defaults.transcoder,
    logging: loggingResult.success ? loggingResult.data : defaults.logging,
  };
}

/**
 * 加载并自愈配置
 * 1. 物理文件不存在 -> 自动创建并写入默认模板
 * 2. 字段类型错误或缺失 -> 自动以安全默认值补全重写，绝不崩溃
 * 3. 自动融合环境变量覆盖
 */
export function loadConfig(customFilePath?: string): WaveletConfig {
  const configPath = customFilePath ? path.resolve(customFilePath) : getDefaultConfigPath();
  const defaults = getDefaultConfig();

  if (!fs.existsSync(configPath)) {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    activeConfig = applyEnvOverrides(defaults);
    return activeConfig;
  }

  try {
    const rawContent = fs.readFileSync(configPath, 'utf-8');
    const parsedJson = JSON.parse(rawContent);

    // 通过 Zod 校验，自动应用缺失字段的默认值
    const parseResult = WaveletConfigSchema.safeParse(parsedJson);

    if (parseResult.success) {
      const validated = parseResult.data;
      const config: WaveletConfig = {
        version: validated.version,
        server: validated.server,
        storage: {
          dataDir: resolveHome(validated.storage.dataDir),
          libraryDir: resolveLibraryDir(validated.storage.libraryDir, defaults.storage.libraryDir),
          quarantineDir: resolveHome(validated.storage.quarantineDir),
          cacheDir: resolveHome(validated.storage.cacheDir),
          logsDir: resolveHome(validated.storage.logsDir),
          databaseFile: resolveHome(validated.storage.databaseFile),
        },
        audio: validated.audio,
        transcoder: validated.transcoder,
        logging: validated.logging,
      };

      // 若原 JSON 缺失部分小节，主动回写补全落盘
      if (
        !parsedJson.audio ||
        !parsedJson.transcoder ||
        !parsedJson.logging ||
        !parsedJson.storage
      ) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      }

      activeConfig = applyEnvOverrides(config);
      return activeConfig;
    }

    // 校验未通过：发生字段破损，启动按小节模块化自愈补齐
    console.warn('[Wavelet Config] 配置文件校验发现异常，启动自愈补齐...');
    const rawObj =
      typeof parsedJson === 'object' && parsedJson !== null
        ? (parsedJson as Record<string, unknown>)
        : {};
    const healedConfig = healConfig(rawObj, defaults);

    fs.writeFileSync(configPath, JSON.stringify(healedConfig, null, 2), 'utf-8');
    activeConfig = applyEnvOverrides(healedConfig);
    return activeConfig;
  } catch (error) {
    console.error(
      `[Wavelet Config] 读取或解析配置文件失败，重置为安全默认配置: ${(error as Error).message}`
    );
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    activeConfig = applyEnvOverrides(defaults);
    return activeConfig;
  }
}

/**
 * 获取当前全局单例配置
 * 若尚未加载，自动触发初始加载
 */
export function getConfig(): WaveletConfig {
  return activeConfig ?? loadConfig();
}
