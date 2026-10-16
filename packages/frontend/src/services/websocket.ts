import config from '../config/index.js';
import apiClient from './apiClient.js';

export interface PlaybackSyncData {
  trackId: string | null;
  currentTimeMs: number;
  durationMs: number;
  state: 'playing' | 'paused' | 'stopped';
}

export interface TaskProgressData {
  taskId: string;
  stage: string;
  percent: number;
  message?: string;
}

export interface QueueSyncData {
  queue: unknown[];
  currentIndex: number;
  playMode: string;
}

export interface PlaybackMissingData {
  trackId: string;
  title?: string;
  filePath: string;
  autoSkipped: boolean;
}

export type WsEventListener<T> = (data: T) => void;

class WaveletWsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  private fftListeners = new Set<WsEventListener<number[]>>();
  private playbackSyncListeners = new Set<WsEventListener<PlaybackSyncData>>();
  private playbackMissingListeners = new Set<WsEventListener<PlaybackMissingData>>();
  private taskProgressListeners = new Set<WsEventListener<TaskProgressData>>();
  private queueListeners = new Set<WsEventListener<QueueSyncData>>();
  private connectionChangeListeners = new Set<WsEventListener<boolean>>();

  /**
   * 启动长连接
   */
  async connect(): Promise<void> {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isExplicitlyClosed = false;

    try {
      const token = await apiClient.ensureSession();
      const wsUrl = `${config.wsBaseUrl}${config.wsBaseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyConnectionChange(true);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data as string) as { event: string; data: unknown };
          this.handleEvent(raw.event, raw.data);
        } catch {
          // 忽略心跳响应或非 JSON 载荷
        }
      };

      this.ws.onclose = () => {
        this.cleanupSocket();
        this.notifyConnectionChange(false);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose 会紧随其后触发重连
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * 手动关闭连接
   */
  disconnect(): void {
    this.isExplicitlyClosed = true;
    this.cleanupSocket();
    this.notifyConnectionChange(false);
  }

  /**
   * 当前是否已连接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // 监听器挂载与注销
  onFft(listener: WsEventListener<number[]>): () => void {
    this.fftListeners.add(listener);
    return () => this.fftListeners.delete(listener);
  }

  onPlaybackSync(listener: WsEventListener<PlaybackSyncData>): () => void {
    this.playbackSyncListeners.add(listener);
    return () => this.playbackSyncListeners.delete(listener);
  }

  onPlaybackMissing(listener: WsEventListener<PlaybackMissingData>): () => void {
    this.playbackMissingListeners.add(listener);
    return () => this.playbackMissingListeners.delete(listener);
  }

  onTaskProgress(listener: WsEventListener<TaskProgressData>): () => void {
    this.taskProgressListeners.add(listener);
    return () => this.taskProgressListeners.delete(listener);
  }

  onQueue(listener: WsEventListener<QueueSyncData>): () => void {
    this.queueListeners.add(listener);
    return () => this.queueListeners.delete(listener);
  }

  onConnectionChange(listener: WsEventListener<boolean>): () => void {
    this.connectionChangeListeners.add(listener);
    // 立即推当前状态
    listener(this.isConnected());
    return () => this.connectionChangeListeners.delete(listener);
  }

  private dispatchFft(data: unknown): void {
    if (Array.isArray(data)) {
      for (const l of this.fftListeners) l(data as number[]);
    }
  }

  private dispatchPlaybackSync(data: unknown): void {
    if (data && typeof data === 'object') {
      for (const l of this.playbackSyncListeners) l(data as PlaybackSyncData);
    }
  }

  private dispatchPlaybackMissing(data: unknown): void {
    if (data && typeof data === 'object') {
      for (const l of this.playbackMissingListeners) l(data as PlaybackMissingData);
    }
  }

  private dispatchTaskProgress(data: unknown): void {
    if (data && typeof data === 'object') {
      for (const l of this.taskProgressListeners) l(data as TaskProgressData);
    }
  }

  private dispatchQueue(data: unknown): void {
    if (data && typeof data === 'object') {
      for (const l of this.queueListeners) l(data as QueueSyncData);
    }
  }

  private handleEvent(eventName: string, data: unknown): void {
    if (eventName === 'visualizer:fft') {
      this.dispatchFft(data);
    } else if (eventName === 'playback:sync') {
      this.dispatchPlaybackSync(data);
    } else if (eventName === 'playback:missing' || eventName === 'track:missing') {
      this.dispatchPlaybackMissing(data);
    } else if (eventName === 'task:progress') {
      this.dispatchTaskProgress(data);
    } else if (eventName === 'playback:queue' || eventName === 'player:queue') {
      this.dispatchQueue(data);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, config.wsHeartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cleanupSocket(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    // 指数退避: 1s, 2s, 4s, 8s, 最大 10s
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, config.wsMaxReconnectDelayMs);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const l of this.connectionChangeListeners) {
      l(connected);
    }
  }
}

export const wsClient = new WaveletWsClient();
export default wsClient;
