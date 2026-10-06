/**
 * Wavelet 前端全局运行时配置
 */
export interface WaveletFrontendConfig {
  /** REST API 根地址 (开发/生产同源缺省为空字符串，由 Vite 或 Fastify 托管) */
  apiBaseUrl: string;
  /** WebSocket 实时长连接端点 */
  wsBaseUrl: string;
  /** 默认启动音量 (0.0 ~ 1.0) */
  defaultVolume: number;
  /** 整轨归一化波形峰值采样点数 */
  waveformSamplePoints: number;
  /** 实时频域可视化 FFT 频段分析维度 */
  fftBandsCount: number;
  /** WebSocket 心跳保活探测周期 (毫秒) */
  wsHeartbeatIntervalMs: number;
  /** WebSocket 断线重连最大退避等待时间 (毫秒) */
  wsMaxReconnectDelayMs: number;
  /** 悬浮气泡卡片防抖延迟 (毫秒) */
  hoverDebounceMs: number;
}

/**
 * 自动计算推导默认 WebSocket 地址
 */
function getDefaultWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:3000/ws/live';
  }
  const isHttps = window.location.protocol === 'https:';
  const protocol = isHttps ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/live`;
}

/**
 * 默认基线配置
 */
export const config: WaveletFrontendConfig = {
  apiBaseUrl: '',
  wsBaseUrl: getDefaultWsUrl(),
  defaultVolume: 0.75,
  waveformSamplePoints: 128,
  fftBandsCount: 64,
  wsHeartbeatIntervalMs: 30000,
  wsMaxReconnectDelayMs: 10000,
  hoverDebounceMs: 120,
};

export default config;
