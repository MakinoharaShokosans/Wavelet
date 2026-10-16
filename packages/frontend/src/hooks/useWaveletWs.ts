import { useEffect, useState } from 'react';
import wsClient, {
  type PlaybackMissingData,
  type PlaybackSyncData,
  type QueueSyncData,
  type TaskProgressData,
} from '../services/websocket.js';

export interface UseWaveletWsOptions {
  onFft?: (bands: number[]) => void;
  onPlaybackSync?: (sync: PlaybackSyncData) => void;
  onPlaybackMissing?: (missing: PlaybackMissingData) => void;
  onQueue?: (queue: QueueSyncData) => void;
  onTaskProgress?: (progress: TaskProgressData) => void;
  autoConnect?: boolean;
}

export function useWaveletWs(options: UseWaveletWsOptions = {}): { isConnected: boolean } {
  const {
    onFft,
    onPlaybackSync,
    onPlaybackMissing,
    onQueue,
    onTaskProgress,
    autoConnect = true,
  } = options;
  const [isConnected, setIsConnected] = useState<boolean>(wsClient.isConnected());

  useEffect(() => {
    const unsubConn = wsClient.onConnectionChange((connected) => {
      setIsConnected(connected);
    });

    if (autoConnect && !wsClient.isConnected()) {
      wsClient.connect();
    }

    return () => {
      unsubConn();
    };
  }, [autoConnect]);

  useEffect(() => {
    if (!onFft) return;
    return wsClient.onFft(onFft);
  }, [onFft]);

  useEffect(() => {
    if (!onPlaybackSync) return;
    return wsClient.onPlaybackSync(onPlaybackSync);
  }, [onPlaybackSync]);

  useEffect(() => {
    if (!onPlaybackMissing) return;
    return wsClient.onPlaybackMissing(onPlaybackMissing);
  }, [onPlaybackMissing]);

  useEffect(() => {
    if (!onQueue) return;
    return wsClient.onQueue(onQueue);
  }, [onQueue]);

  useEffect(() => {
    if (!onTaskProgress) return;
    return wsClient.onTaskProgress(onTaskProgress);
  }, [onTaskProgress]);

  return { isConnected };
}

export default useWaveletWs;
