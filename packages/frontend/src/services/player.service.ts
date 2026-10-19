import type {
  AudioDevice,
  PlayMode,
  PlayQueueStatus,
  PlaybackStatus,
  Track,
} from '@wavelet/shared';
import apiClient from './apiClient.js';

function extractQueueStatus(
  res: { success?: boolean; queue: PlayQueueStatus } | PlayQueueStatus
): PlayQueueStatus {
  if (res && typeof res === 'object' && 'queue' in res && !Array.isArray(res.queue)) {
    return res.queue;
  }
  return res as PlayQueueStatus;
}

export const playerService = {
  /**
   * 获取当前播放器状态
   */
  async getStatus(): Promise<PlaybackStatus> {
    return apiClient.get<PlaybackStatus>('/api/player/status');
  },

  /**
   * 启动指定曲目播放
   */
  async play(trackId: string, offsetMs = 0): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/play', {
      trackId,
      offsetMs,
    });
  },

  /**
   * 暂停当前播放
   */
  async pause(): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/pause');
  },

  /**
   * 从当前暂停处继续播放
   */
  async resume(): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/resume');
  },

  /**
   * 彻底停止播放并重置时钟
   */
  async stop(): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/stop');
  },

  /**
   * 调节播放器音量 (0.0 ~ 1.0)
   */
  async setVolume(volume: number): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/volume', { volume });
  },

  /**
   * 定位播放进度 (ms)
   */
  async seek(offsetMs: number): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/seek', { offsetMs });
  },

  /**
   * 获取当前播放队列状态
   */
  async getQueue(): Promise<PlayQueueStatus> {
    return apiClient.get<PlayQueueStatus>('/api/player/queue');
  },

  /**
   * 覆盖重置整个播放队列
   */
  async setQueue(tracks: Track[], startIndex = 0): Promise<PlayQueueStatus> {
    const res = await apiClient.post<
      { success?: boolean; queue: PlayQueueStatus } | PlayQueueStatus
    >('/api/player/queue', {
      tracks,
      startIndex,
    });
    return extractQueueStatus(res);
  },

  /**
   * 向播放队列追加歌曲
   */
  async addToQueue(tracks: Track[]): Promise<PlayQueueStatus> {
    const res = await apiClient.post<
      { success?: boolean; queue: PlayQueueStatus } | PlayQueueStatus
    >('/api/player/queue/add', { tracks });
    return extractQueueStatus(res);
  },

  /**
   * 清空整个播放队列
   */
  async clearQueue(): Promise<PlayQueueStatus> {
    const res = await apiClient.del<
      { success?: boolean; queue: PlayQueueStatus } | PlayQueueStatus
    >('/api/player/queue');
    return extractQueueStatus(res);
  },

  /**
   * 依据当前模式切换到下一首
   */
  async next(): Promise<PlaybackStatus> {
    return apiClient.post<PlaybackStatus>('/api/player/next');
  },

  /**
   * 依据当前模式切换到上一首
   */
  async previous(): Promise<PlaybackStatus> {
    return apiClient.post<PlaybackStatus>('/api/player/previous');
  },

  /**
   * 切换播放模式 ('sequence' | 'repeat-list' | 'repeat-track' | 'shuffle')
   */
  async setPlayMode(mode: PlayMode): Promise<PlayQueueStatus> {
    const res = await apiClient.post<
      { success?: boolean; queue: PlayQueueStatus } | PlayQueueStatus
    >('/api/player/play-mode', { mode });
    return extractQueueStatus(res);
  },

  /**
   * 获取声卡输出物理设备列表
   */
  async getDevices(): Promise<{ devices: AudioDevice[] }> {
    return apiClient.get<{ devices: AudioDevice[] }>('/api/player/devices');
  },

  /**
   * 开启或关闭 Bit-Perfect 硬件独占直通模式
   */
  async setBitPerfect(deviceName: string, enabled: boolean): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/bit-perfect', {
      deviceName,
      enabled,
    });
  },

  /**
   * 开启或关闭 BS2B 耳塞互馈声场算法
   */
  async setBs2b(enabled: boolean): Promise<{ status: PlaybackStatus }> {
    return apiClient.post<{ status: PlaybackStatus }>('/api/player/bs2b', {
      enabled,
    });
  },
};

export default playerService;
