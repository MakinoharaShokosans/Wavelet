import type { WebSocket } from 'ws';

const clients = new Set<WebSocket>();

export function registerWsClient(socket: WebSocket): void {
  clients.add(socket);
  socket.on('close', () => {
    clients.delete(socket);
  });
}

export function broadcast(event: string, payload: unknown): void {
  if (clients.size === 0) return;

  const message = JSON.stringify({ event, data: payload });
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message);
    }
  }
}

/**
 * 60 FPS 高频频谱波形广播 (64 维对数能量浮点数组，专门用于前端贝塞尔曲线控制点)
 */
export function broadcastFft(fftData: number[]): void {
  broadcast('visualizer:fft', fftData);
}

/**
 * 毫秒级播放时间与状态对齐广播
 */
export function broadcastPlaybackSync(info: {
  trackId: string;
  currentTimeMs: number;
  durationMs: number;
  state: 'playing' | 'paused' | 'stopped';
}): void {
  broadcast('playback:sync', info);
}

/**
 * 任务流式进度广播
 */
export function broadcastTaskProgress(info: {
  taskId: string;
  stage: string;
  percent: number;
  message?: string;
}): void {
  broadcast('task:progress', info);
}

/**
 * 播放队列同步广播
 */
export function broadcastPlaybackQueue(info: {
  queue: unknown[];
  currentIndex: number;
  playMode: string;
}): void {
  broadcast('playback:queue', info);
}
