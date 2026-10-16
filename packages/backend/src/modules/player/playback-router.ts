import fs from 'node:fs';
import type { PlayMode, PlayQueueStatus, Track } from '@wavelet/shared';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import {
  broadcastPlaybackMissing,
  broadcastPlaybackQueue,
  broadcastPlaybackSync,
} from '../gateway/ws/broadcaster.js';
import { TrackRepository } from '../library/repositories/track.repository.js';
import { type PlaybackState, getDirectPlayer } from './direct-pcm-player.js';

export interface PlaybackRouterStatus {
  mode: 'direct' | 'web';
  deviceId: string;
  state: PlaybackState;
  currentTrack: Track | null;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  bs2bEnabled: boolean;
}

export class PlaybackRouter {
  private mode: 'direct' | 'web';
  private deviceId: string;
  private volume: number;
  private bs2bEnabled = false;
  private trackRepo: TrackRepository;

  // 播放队列状态机
  private queue: Track[] = [];
  private currentIndex = -1;
  private playMode: PlayMode = 'sequence';
  private consecutiveMissingCount = 0;

  // Web 回退模式状态记录
  private webState: PlaybackState = 'stopped';
  private webTrack: Track | null = null;
  private webTimeMs = 0;

  constructor() {
    const config = getConfig();
    this.mode = config.audio.outputMode;
    this.deviceId = config.audio.outputDevice;
    this.volume = config.audio.defaultVolume;
    this.trackRepo = new TrackRepository();
  }

  /**
   * 启动曲目播放 (根据模式分流至声卡直通或 Web 回退流)
   */
  async play(trackId: string, offsetMs = 0): Promise<void> {
    const track = this.trackRepo.findById(trackId);
    if (!track) {
      throw new Error(`曲目 ${trackId} 不存在`);
    }

    // 同步更新队列中的当前播放指针
    const existingIndex = this.queue.findIndex((t) => t.id === trackId);
    if (existingIndex !== -1) {
      this.currentIndex = existingIndex;
    } else {
      this.queue.push(track);
      this.currentIndex = this.queue.length - 1;
    }
    broadcastPlaybackQueue(this.getQueue());

    // 毫秒级物理文件轻量存在性检查 (ISSUE-01: 物理文件丢失防御)
    if (!fs.existsSync(track.filePath)) {
      this.handleMissingTrack(track);
      return;
    }

    // 物理文件校验通过，重置连续丢失熔断计数器
    this.consecutiveMissingCount = 0;

    // 记录播放度量指标 (自增 play_count 并记录时间戳)
    this.trackRepo.recordPlayback(track.id);

    if (this.mode === 'direct') {
      const directPlayer = getDirectPlayer();
      directPlayer.setDevice(this.deviceId);
      directPlayer.setVolume(this.volume);
      directPlayer.setBs2b(this.bs2bEnabled);
      await directPlayer.play(track, offsetMs);
    } else {
      // Web 模式: 停掉声卡直通，由前端请求 /api/stream/:trackId 点播
      getDirectPlayer().stop();
      this.webState = 'playing';
      this.webTrack = track;
      this.webTimeMs = offsetMs;

      broadcastPlaybackSync({
        trackId: track.id,
        currentTimeMs: this.webTimeMs,
        durationMs: track.duration * 1000,
        state: 'playing',
      });

      logger.info({ trackId, offsetMs }, '[PlaybackRouter] 已就绪 Web Audio HTTP Range 流回退模式');
    }
  }

  /**
   * 物理文件丢失防御与熔断处理逻辑
   */
  private handleMissingTrack(track: Track): void {
    this.consecutiveMissingCount += 1;
    const shouldAutoSkip =
      this.queue.length > 0 && this.consecutiveMissingCount < this.queue.length;

    logger.warn(
      {
        trackId: track.id,
        title: track.title,
        filePath: track.filePath,
        consecutiveMissing: this.consecutiveMissingCount,
      },
      '[PlaybackRouter] 目标音频物理文件在磁盘上丢失，拦截播放'
    );

    broadcastPlaybackMissing({
      trackId: track.id,
      title: track.title,
      filePath: track.filePath,
      autoSkipped: shouldAutoSkip,
    });

    if (this.mode === 'direct') {
      getDirectPlayer().stop();
      if (shouldAutoSkip) {
        setTimeout(() => {
          void this.next();
        }, 120);
      } else {
        logger.warn('[PlaybackRouter] 队列内所有曲目文件均丢失，触发熔断并停止硬件直通');
        this.stop();
      }
    } else {
      // Web 模式: 清除虚假播放状态，由前端根据音频流 404 或 WS 广播进行跳播
      this.webState = 'stopped';
      this.webTimeMs = 0;
      if (!shouldAutoSkip) {
        this.stop();
      }
    }
  }

  getQueue(): PlayQueueStatus {
    const currentTrack =
      this.currentIndex >= 0 && this.currentIndex < this.queue.length
        ? this.queue[this.currentIndex]
        : null;
    return {
      queue: this.queue,
      currentIndex: this.currentIndex,
      currentTrack,
      playMode: this.playMode,
    };
  }

  async setQueue(tracks: Track[], startIndex = 0): Promise<void> {
    this.consecutiveMissingCount = 0;
    this.queue = [...tracks];
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));

    if (this.queue.length > 0 && this.currentIndex >= 0) {
      await this.play(this.queue[this.currentIndex].id, 0);
    } else {
      broadcastPlaybackQueue(this.getQueue());
    }
  }

  addToQueue(tracks: Track[], next = false): void {
    if (next && this.currentIndex >= 0) {
      this.queue.splice(this.currentIndex + 1, 0, ...tracks);
    } else {
      this.queue.push(...tracks);
    }
    broadcastPlaybackQueue(this.getQueue());
  }

  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (this.currentIndex >= this.queue.length) {
      this.currentIndex = this.queue.length - 1;
    }
    broadcastPlaybackQueue(this.getQueue());
  }

  clearQueue(): void {
    this.consecutiveMissingCount = 0;
    const current = this.currentIndex >= 0 ? this.queue[this.currentIndex] : null;
    this.queue = current ? [current] : [];
    this.currentIndex = current ? 0 : -1;
    broadcastPlaybackQueue(this.getQueue());
  }

  setPlayMode(mode: PlayMode): void {
    this.playMode = mode;
    broadcastPlaybackQueue(this.getQueue());
  }

  async next(): Promise<void> {
    if (this.queue.length === 0) return;

    if (this.playMode === 'repeat-track') {
      if (this.currentIndex >= 0) {
        await this.play(this.queue[this.currentIndex].id, 0);
        return;
      }
    }

    if (this.playMode === 'shuffle') {
      const nextIndex = Math.floor(Math.random() * this.queue.length);
      this.currentIndex = nextIndex;
      await this.play(this.queue[this.currentIndex].id, 0);
      return;
    }

    if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex += 1;
      await this.play(this.queue[this.currentIndex].id, 0);
    } else if (this.playMode === 'repeat-list') {
      this.currentIndex = 0;
      await this.play(this.queue[this.currentIndex].id, 0);
    } else {
      this.stop();
    }
  }

  async previous(): Promise<void> {
    if (this.queue.length === 0) return;

    if (this.currentIndex > 0) {
      this.currentIndex -= 1;
      await this.play(this.queue[this.currentIndex].id, 0);
    } else if (this.playMode === 'repeat-list') {
      this.currentIndex = this.queue.length - 1;
      await this.play(this.queue[this.currentIndex].id, 0);
    } else if (this.currentIndex === 0) {
      await this.seek(0);
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    if (this.mode === 'direct') {
      getDirectPlayer().pause();
    } else {
      this.webState = 'paused';
      if (this.webTrack) {
        broadcastPlaybackSync({
          trackId: this.webTrack.id,
          currentTimeMs: this.webTimeMs,
          durationMs: this.webTrack.duration * 1000,
          state: 'paused',
        });
      }
    }
  }

  /**
   * 恢复
   */
  resume(): void {
    if (this.mode === 'direct') {
      const directPlayer = getDirectPlayer();
      if (directPlayer.getStatus().state === 'paused') {
        directPlayer.resume();
      } else if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
        void this.play(this.queue[this.currentIndex].id, 0);
      }
    } else {
      this.webState = 'playing';
      if (this.webTrack) {
        broadcastPlaybackSync({
          trackId: this.webTrack.id,
          currentTimeMs: this.webTimeMs,
          durationMs: this.webTrack.duration * 1000,
          state: 'playing',
        });
      }
    }
  }

  /**
   * 停止
   */
  stop(): void {
    this.consecutiveMissingCount = 0;
    getDirectPlayer().stop();
    this.webState = 'stopped';
    this.webTimeMs = 0;
    if (this.webTrack) {
      broadcastPlaybackSync({
        trackId: this.webTrack.id,
        currentTimeMs: 0,
        durationMs: this.webTrack.duration * 1000,
        state: 'stopped',
      });
    }
  }

  /**
   * 毫秒定位
   */
  async seek(offsetMs: number): Promise<void> {
    if (this.mode === 'direct') {
      await getDirectPlayer().seek(offsetMs);
    } else {
      this.webTimeMs = offsetMs;
      if (this.webTrack) {
        broadcastPlaybackSync({
          trackId: this.webTrack.id,
          currentTimeMs: this.webTimeMs,
          durationMs: this.webTrack.duration * 1000,
          state: this.webState,
        });
      }
    }
  }

  /**
   * 调节音量 (0.0 ~ 1.0)
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    getDirectPlayer().setVolume(this.volume);
  }

  /**
   * 切换输出模式 ('direct' | 'web')
   */
  setOutputMode(mode: 'direct' | 'web'): void {
    if (this.mode === mode) return;

    const currentStatus = this.getStatus();
    this.mode = mode;

    if (currentStatus.state === 'playing' && currentStatus.currentTrack) {
      // 无缝在 direct 和 web 之间迁移当前进度
      this.play(currentStatus.currentTrack.id, currentStatus.currentTimeMs);
    } else {
      getDirectPlayer().stop();
      if (currentStatus.currentTrack) {
        this.webTrack = currentStatus.currentTrack;
        this.webTimeMs = currentStatus.currentTimeMs;
        this.webState = currentStatus.state;
      }
    }

    logger.info({ mode }, '[PlaybackRouter] 音频输出模式已切换');
  }

  /**
   * 切换物理输出声卡
   */
  setOutputDevice(deviceId: string): void {
    this.deviceId = deviceId;
    getDirectPlayer().setDevice(deviceId);
    logger.info({ deviceId }, '[PlaybackRouter] 输出设备已切换');
  }

  /**
   * 开启或关闭 BS2B 耳塞互馈声场算法
   */
  setBs2b(enabled: boolean): void {
    this.bs2bEnabled = enabled;
    getDirectPlayer().setBs2b(enabled);
    const status = this.getStatus();
    if (status.currentTrack) {
      broadcastPlaybackSync({
        trackId: status.currentTrack.id,
        currentTimeMs: status.currentTimeMs,
        durationMs: status.durationMs,
        state: status.state,
      });
    }
    logger.info({ bs2bEnabled: enabled }, '[PlaybackRouter] BS2B 耳塞互馈声场状态已更新');
  }

  /**
   * 获取 BS2B 耳塞互馈声场状态
   */
  getBs2b(): boolean {
    return this.bs2bEnabled;
  }

  /**
   * 获取当前播放路由综合状态
   */
  getStatus(): PlaybackRouterStatus {
    if (this.mode === 'direct') {
      const status = getDirectPlayer().getStatus();
      return {
        mode: this.mode,
        deviceId: status.deviceId,
        state: status.state,
        currentTrack: status.currentTrack,
        currentTimeMs: status.currentTimeMs,
        durationMs: status.durationMs,
        volume: status.volume,
        bs2bEnabled: this.bs2bEnabled,
      };
    }

    return {
      mode: this.mode,
      deviceId: this.deviceId,
      state: this.webState,
      currentTrack: this.webTrack,
      currentTimeMs: this.webTimeMs,
      durationMs: this.webTrack ? this.webTrack.duration * 1000 : 0,
      volume: this.volume,
      bs2bEnabled: this.bs2bEnabled,
    };
  }
}

let routerInstance: PlaybackRouter | null = null;

export function getPlaybackRouter(): PlaybackRouter {
  if (!routerInstance) {
    routerInstance = new PlaybackRouter();
  }
  return routerInstance;
}

export function resetPlaybackRouter(): void {
  if (routerInstance) {
    routerInstance.stop();
    routerInstance = null;
  }
}
