import fs from 'node:fs';
import os from 'node:os';
import ffmpegStatic from 'ffmpeg-static';
import { getConfig } from '../../config/index.js';
import { logger } from './logger.js';

export interface RuntimeEnvironmentInfo {
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  cpuCores: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  ffmpegPath: string;
  audioSubsystemHint: string;
}

/**
 * 探测底层运行环境与转码多媒体二进制可用性
 */
export function probeEnvironment(): RuntimeEnvironmentInfo {
  const config = getConfig();

  // 1. 检查 Node.js 版本
  const nodeVersion = process.version;
  const majorVersion = Number.parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (majorVersion < 20) {
    logger.warn(
      { nodeVersion },
      '[EnvProbe] 当前 Node.js 版本低于 20 LTS，建议升级以获得最佳性能与原生 C++ 支持'
    );
  }

  // 2. 音频子系统特征嗅探
  const platform = os.platform();
  let audioSubsystemHint = 'Unknown';
  if (platform === 'linux') {
    audioSubsystemHint = 'ALSA / PulseAudio / PipeWire';
  } else if (platform === 'win32') {
    audioSubsystemHint = 'WASAPI (Exclusive/Shared)';
  } else if (platform === 'darwin') {
    audioSubsystemHint = 'CoreAudio';
  }

  // 3. 校验并赋权 FFmpeg 静态二进制
  const ffmpegPath = config.transcoder.customFfmpegPath || ffmpegStatic;
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    logger.error({ ffmpegPath }, '[EnvProbe] 未找到 FFmpeg 静态二进制可执行文件');
    throw new Error('未检测到有效的 FFmpeg 编解码二进制依赖');
  }

  // 确保赋予可执行权限 (针对 Linux / macOS)
  if (platform !== 'win32') {
    try {
      fs.chmodSync(ffmpegPath, 0o755);
    } catch {
      // 忽略无法修改权限的情况 (只读挂载或已具备权限)
    }
  }

  const envInfo: RuntimeEnvironmentInfo = {
    nodeVersion,
    platform,
    arch: os.arch(),
    cpuCores: os.cpus().length,
    totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
    ffmpegPath,
    audioSubsystemHint,
  };

  logger.info(
    {
      platform: envInfo.platform,
      arch: envInfo.arch,
      node: envInfo.nodeVersion,
      cpus: envInfo.cpuCores,
      audio: envInfo.audioSubsystemHint,
    },
    '[EnvProbe] 运行环境探测完成'
  );

  return envInfo;
}
