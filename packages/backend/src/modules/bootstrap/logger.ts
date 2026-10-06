import fs from 'node:fs';
import pino from 'pino';
import pretty from 'pino-pretty';
import * as rfs from 'rotating-file-stream';
import { getConfig } from '../../config/index.js';

let appLogger: pino.Logger | null = null;
let auditLogger: pino.Logger | null = null;

/**
 * 初始化并获取主系统结构化日志器 (Pino)
 * 具备双专轨：
 * 1. wavelet.log: 主系统运行日志 (单文件 10MB，最多保留 3 个归档)
 * 2. 控制台实时打印 (格式化美化)
 */
export function getLogger(): pino.Logger {
  if (appLogger) {
    return appLogger;
  }

  const config = getConfig();
  const logsDir = config.storage.logsDir;

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // 配置自动轮转与压缩防爆盘流 (上限 10MB，压缩为 gzip，最多保留 3 个历史文件)
  const systemStream = rfs.createStream('wavelet.log', {
    size: `${config.logging.maxFileSizeMB}M`,
    maxFiles: config.logging.maxFiles,
    compress: 'gzip',
    path: logsDir,
  });

  const streams: pino.StreamEntry[] = [{ level: config.logging.level, stream: systemStream }];

  if (config.logging.consolePretty) {
    // 开发调试态控制台实时流式美化输出
    try {
      const prettyStream = pretty({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      });
      streams.push({
        level: config.logging.level,
        stream: prettyStream,
      });
    } catch {
      streams.push({
        level: config.logging.level,
        stream: process.stdout,
      });
    }
  }

  appLogger = pino(
    {
      level: config.logging.level,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams)
  );

  return appLogger;
}

/**
 * 初始化并获取音频坏损体检与自愈审计专轨日志器 (inspection.log)
 * 专供记录 7 类坏损特征诊断、帧剪裁、元数据重构等自愈明细
 */
export function getInspectionLogger(): pino.Logger {
  if (auditLogger) {
    return auditLogger;
  }

  const config = getConfig();
  const logsDir = config.storage.logsDir;

  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const auditStream = rfs.createStream('inspection.log', {
    size: `${config.logging.maxFileSizeMB}M`,
    maxFiles: config.logging.maxFiles,
    compress: 'gzip',
    path: logsDir,
  });

  auditLogger = pino(
    {
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    auditStream
  );

  return auditLogger;
}

export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    const instance = getLogger();
    return (instance as unknown as Record<string, unknown>)[prop as string];
  },
});

export const inspectionLogger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    const instance = getInspectionLogger();
    return (instance as unknown as Record<string, unknown>)[prop as string];
  },
});
