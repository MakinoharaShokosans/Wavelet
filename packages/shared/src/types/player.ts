import type { Track } from './track.js';

export type PlayMode = 'sequence' | 'repeat-list' | 'repeat-track' | 'shuffle';

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface AudioDevice {
  id: string;
  name: string;
  card?: string;
  isDefault: boolean;
}

export interface PlaybackStatus {
  mode: 'direct' | 'web';
  deviceId: string;
  state: PlaybackState;
  currentTrack: Track | null;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  bs2bEnabled?: boolean;
}

export interface PlayQueueStatus {
  queue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  playMode: PlayMode;
}
