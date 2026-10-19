import type { PlayMode, PlaybackStatus, Track } from '@wavelet/shared';
import { create } from 'zustand';
import config from '../config/index.js';
import audioEngine from '../services/audioEngine.js';
import playerService from '../services/player.service.js';
import type { PlaybackSyncData } from '../services/websocket.js';
import { useLibraryStore } from './library.store.js';

export interface PlayerState {
  status: PlaybackStatus;
  currentTrack: Track | null;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  sourcePlaylistName: string | null;
  isScrubbing: boolean;
  queue: Track[];
  currentIndex: number;
  playMode: PlayMode;
  fftBands: number[];
  bitPerfectEnabled: boolean;
  bs2bEnabled: boolean;
  isMuted: boolean;
  lastVolume: number;

  setIsScrubbing: (isScrubbing: boolean) => void;
  initPlayer: () => Promise<void>;
  playTrack: (track: Track, queueContext?: Track[], sourcePlaylistName?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (timeMs: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setPlayMode: (mode: PlayMode) => Promise<void>;
  toggleBitPerfect: (deviceName?: string) => Promise<void>;
  toggleBs2b: (enabled?: boolean) => Promise<void>;
  setQueue: (tracks: Track[], startIndex?: number) => Promise<void>;
  addToQueue: (tracks: Track[]) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  setFftBands: (bands: number[]) => void;
  syncQueue: (queue: Track[], currentIndex: number) => void;
  syncPlayback: (sync: PlaybackSyncData) => void;
}

const initialStatus: PlaybackStatus = {
  mode: 'web',
  deviceId: 'default',
  state: 'stopped',
  currentTrack: null,
  currentTimeMs: 0,
  durationMs: 0,
  volume: config.defaultVolume,
  bs2bEnabled: false,
};

let hasInitializedAudioEngine = false;
let consecutivePlaybackErrors = 0;

function handleAudioEngineEvent(
  event: 'play' | 'pause' | 'timeupdate' | 'ended' | 'error',
  data: unknown,
  set: (partial: Partial<PlayerState>) => void,
  get: () => PlayerState,
  onEnded: () => void
): void {
  const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';
  if (isDirect) {
    // 硬件直通模式下浏览器音频已静音卸载，忽略浏览器端的生命周期事件
    return;
  }

  switch (event) {
    case 'timeupdate':
      if (!get().isScrubbing) {
        set({ currentTimeMs: data as number });
      }
      break;
    case 'ended':
      consecutivePlaybackErrors = 0;
      onEnded();
      break;
    case 'play':
      consecutivePlaybackErrors = 0;
      set({ isPlaying: true });
      break;
    case 'pause':
      set({ isPlaying: false });
      break;
    case 'error': {
      consecutivePlaybackErrors++;
      const queue = get().queue;
      set({ isPlaying: false });

      if (queue.length > 0 && consecutivePlaybackErrors >= queue.length) {
        console.warn('[PlayerStore] 队列内所有曲目均不可播放或物理文件丢失，熔断保护生效停止播放');
        consecutivePlaybackErrors = 0;
        void get().stop();
        return;
      }

      onEnded();
      break;
    }
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: initialStatus,
  currentTrack: null,
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  sourcePlaylistName: null,
  isScrubbing: false,
  queue: [],
  currentIndex: -1,
  playMode: 'sequence',
  fftBands: new Array(config.fftBandsCount).fill(0),
  bitPerfectEnabled: false,
  bs2bEnabled: false,
  isMuted: false,
  lastVolume: config.defaultVolume,

  setIsScrubbing: (isScrubbing: boolean) => {
    set({ isScrubbing });
  },

  initPlayer: async () => {
    if (!hasInitializedAudioEngine) {
      hasInitializedAudioEngine = true;
      audioEngine.addListener((event, data) => {
        handleAudioEngineEvent(event, data, set, get, () => {
          void get().next();
        });
      });
    }

    try {
      const [status, queueStatus] = await Promise.all([
        playerService.getStatus(),
        playerService.getQueue(),
      ]);
      const bs2bOn = status.bs2bEnabled ?? false;
      audioEngine.setBs2b(bs2bOn);
      set({
        status,
        currentTrack: status.currentTrack,
        currentTimeMs: status.currentTimeMs,
        durationMs: status.durationMs,
        isPlaying: status.state === 'playing',
        queue: queueStatus.queue,
        currentIndex: queueStatus.currentIndex,
        playMode: queueStatus.playMode,
        bitPerfectEnabled: status.mode === 'direct',
        bs2bEnabled: bs2bOn,
      });
    } catch {
      // 容灾忽略
    }
  },

  playTrack: async (track: Track, queueContext?: Track[], sourcePlaylistName?: string) => {
    consecutivePlaybackErrors = 0;
    let resolvedPlaylistName = sourcePlaylistName;
    if (!resolvedPlaylistName) {
      const activeLibPlaylist = useLibraryStore.getState().currentPlaylist;
      resolvedPlaylistName =
        activeLibPlaylist?.name || (track.album ? `专辑: ${track.album}` : '全部音乐');
    }

    // 立即更新前端状态，让 UI 毫无延迟立即响应并唤起播放底栏
    set({
      currentTrack: track,
      currentTimeMs: 0,
      durationMs: track.duration * 1000,
      isPlaying: true,
      sourcePlaylistName: resolvedPlaylistName,
    });

    const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';

    // 1. 发声互斥隔离：Web 模式由浏览器发声，Direct 模式由服务端硬件声卡发声，绝不同时双发
    if (!isDirect) {
      void audioEngine.play(track.id, 0);
    } else {
      audioEngine.stop();
    }

    // 2. 同步队列与后端播放状态
    try {
      if (queueContext && queueContext.length > 0) {
        const targetIndex = queueContext.findIndex((t) => t.id === track.id);
        const startIndex = targetIndex >= 0 ? targetIndex : 0;
        await playerService.setQueue(queueContext, startIndex);
      } else {
        const { status } = await playerService.play(track.id, 0);
        set({ status });
      }
    } catch {
      // 容灾忽略
    }
  },

  togglePlayPause: async () => {
    const isPlaying = get().isPlaying;
    const currentTrack = get().currentTrack;
    if (!currentTrack) {
      const queue = get().queue;
      if (queue.length > 0) {
        await get().playTrack(queue[0]);
        return;
      }
      return;
    }
    if (isPlaying) {
      await get().pause();
    } else {
      await get().resume();
    }
  },

  pause: async () => {
    audioEngine.pause();
    set({ isPlaying: false });
    try {
      const { status } = await playerService.pause();
      set({ status });
    } catch {
      // 容灾
    }
  },

  resume: async () => {
    const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';
    if (!isDirect) {
      void audioEngine.resume();
    }
    set({ isPlaying: true });
    try {
      const { status } = await playerService.resume();
      set({ status });
    } catch {
      // 容灾
    }
  },

  stop: async () => {
    consecutivePlaybackErrors = 0;
    audioEngine.stop();
    set({
      currentTrack: null,
      currentTimeMs: 0,
      durationMs: 0,
      isPlaying: false,
    });
    try {
      const { status } = await playerService.stop();
      set({ status });
    } catch {
      // 容灾
    }
  },

  seek: async (timeMs: number) => {
    const current = get().currentTrack;
    if (!current) return;
    const clamped = Math.max(0, Math.min(timeMs, get().durationMs || timeMs));
    const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';
    if (!isDirect) {
      audioEngine.seek(clamped);
    }
    set({ currentTimeMs: clamped });
    try {
      const { status } = await playerService.seek(clamped);
      set({ status });
    } catch {
      // 容灾
    }
  },

  setVolume: async (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';
    if (!isDirect) {
      audioEngine.setVolume(clamped);
    }
    // 立即乐观更新当前音量状态与底栏显示，消除拖动与视觉延迟
    set((state) => ({
      status: {
        ...state.status,
        volume: clamped,
      },
      isMuted: clamped === 0,
      lastVolume: clamped > 0 ? clamped : state.lastVolume,
    }));
    try {
      const { status } = await playerService.setVolume(clamped);
      set({ status });
    } catch {
      // 容灾
    }
  },

  toggleMute: async () => {
    const { isMuted, lastVolume, status } = get();
    if (isMuted) {
      await get().setVolume(lastVolume || 0.75);
    } else {
      set({ lastVolume: status.volume });
      await get().setVolume(0);
    }
  },

  next: async () => {
    const { queue, currentIndex, playMode } = get();
    if (queue.length === 0) return;

    let nextIndex = currentIndex + 1;
    if (playMode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (playMode === 'repeat-track') {
      nextIndex = currentIndex;
    } else if (nextIndex >= queue.length) {
      if (playMode === 'repeat-list') {
        nextIndex = 0;
      } else {
        await get().stop();
        return;
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      set({ currentIndex: nextIndex });
      await get().playTrack(nextTrack);
    }
  },

  previous: async () => {
    const { queue, currentIndex } = get();
    if (queue.length === 0) return;

    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }

    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      set({ currentIndex: prevIndex });
      await get().playTrack(prevTrack);
    }
  },

  setPlayMode: async (mode: PlayMode) => {
    set({ playMode: mode });
    try {
      const queueStatus = await playerService.setPlayMode(mode);
      if (queueStatus?.playMode) {
        set({ playMode: queueStatus.playMode });
      }
    } catch {
      // 容灾
    }
  },

  toggleBitPerfect: async (deviceName = 'default') => {
    const nextEnabled = !get().bitPerfectEnabled;
    try {
      const { status } = await playerService.setBitPerfect(deviceName, nextEnabled);
      const isDirect = status.mode === 'direct';
      set({
        status,
        bitPerfectEnabled: isDirect,
      });

      const currentTrack = get().currentTrack;
      if (currentTrack && get().isPlaying) {
        if (isDirect) {
          // 切换为硬件直通：浏览器立即静音停止，由服务端声卡直接发声
          audioEngine.stop();
        } else {
          // 切换回 Web 流：浏览器从当前进度继续播放
          void audioEngine.play(currentTrack.id, get().currentTimeMs);
        }
      }
    } catch {
      // 容灾
    }
  },

  toggleBs2b: async (targetEnabled?: boolean) => {
    const nextEnabled = targetEnabled !== undefined ? targetEnabled : !get().bs2bEnabled;
    audioEngine.setBs2b(nextEnabled);
    set((state) => ({
      bs2bEnabled: nextEnabled,
      status: {
        ...state.status,
        bs2bEnabled: nextEnabled,
      },
    }));

    try {
      const { status } = await playerService.setBs2b(nextEnabled);
      const isBs2b = status.bs2bEnabled ?? nextEnabled;
      audioEngine.setBs2b(isBs2b);
      set({
        status,
        bs2bEnabled: isBs2b,
      });
    } catch {
      // 容灾
    }
  },

  setQueue: async (tracks: Track[], startIndex = 0) => {
    consecutivePlaybackErrors = 0;
    try {
      const queueStatus = await playerService.setQueue(tracks, startIndex);
      if (queueStatus) {
        set({
          queue: Array.isArray(queueStatus.queue) ? queueStatus.queue : tracks,
          currentIndex:
            typeof queueStatus.currentIndex === 'number'
              ? queueStatus.currentIndex
              : startIndex,
          currentTrack:
            queueStatus.currentTrack || (tracks[startIndex] ?? null),
        });
      }
    } catch {
      // 容灾
    }
  },

  addToQueue: async (tracks: Track[]) => {
    try {
      const queueStatus = await playerService.addToQueue(tracks);
      if (queueStatus && Array.isArray(queueStatus.queue)) {
        set({ queue: queueStatus.queue });
      }
    } catch {
      // 容灾
    }
  },

  removeFromQueue: async (index: number) => {
    const currentQueue = [...get().queue];
    if (index >= 0 && index < currentQueue.length) {
      currentQueue.splice(index, 1);
      await get().setQueue(currentQueue, get().currentIndex);
    }
  },

  clearQueue: async () => {
    consecutivePlaybackErrors = 0;
    try {
      const queueStatus = await playerService.clearQueue();
      set({
        queue: Array.isArray(queueStatus?.queue) ? queueStatus.queue : [],
        currentIndex: -1,
      });
    } catch {
      // 容灾
    }
  },

  setFftBands: (bands: number[]) => {
    set({ fftBands: bands });
  },

  syncQueue: (queue: Track[], currentIndex: number) => {
    const currentTrack =
      currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : get().currentTrack;
    set({
      queue,
      currentIndex,
      currentTrack,
    });
  },

  syncPlayback: (sync: PlaybackSyncData) => {
    const isDirect = get().bitPerfectEnabled || get().status.mode === 'direct';
    set((state) => {
      const update: Partial<PlayerState> = {
        durationMs: sync.durationMs || state.durationMs,
        status: {
          ...state.status,
          state: sync.state,
          durationMs: sync.durationMs || state.durationMs,
        },
      };
      if (isDirect && !state.isScrubbing) {
        update.currentTimeMs = sync.currentTimeMs;
      }
      return update;
    });
  },
}));

export default usePlayerStore;
