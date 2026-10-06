/**
 * @wavelet/shared
 * 核心共享常量与类型契约定义
 */

export const APP_NAME = 'Wavelet';
export const APP_VERSION = '0.1.0';
export const DEFAULT_PORT = 23333;
export const DEFAULT_HOST = '127.0.0.1';

/**
 * 导出领域类型契约
 */
export * from './types/config.js';
export * from './types/track.js';
export * from './types/playlist.js';
export * from './types/lyrics.js';
export * from './types/stats.js';
export * from './types/player.js';
export * from './types/waveform.js';

/**
 * 样板状态接口占位
 */
export interface SystemStatusBoilerplate {
  name: string;
  version: string;
  ready: boolean;
  timestamp: number;
}
