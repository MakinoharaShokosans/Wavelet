import config from '../config/index.js';
import apiClient from './apiClient.js';

export type AudioEngineEvent = 'timeupdate' | 'ended' | 'play' | 'pause' | 'error';
export type AudioEngineListener = (event: AudioEngineEvent, data?: unknown) => void;

/**
 * 浏览器端高保真 HTML5 原生音频流播放引擎
 * 负责在 Web 环境下直接解码播放 /api/stream/:trackId 音频流，驱动浏览器发声
 */
class BrowserAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private directGainL: GainNode | null = null;
  private directGainR: GainNode | null = null;
  private crossGainL: GainNode | null = null;
  private crossGainR: GainNode | null = null;
  private bs2bEnabled = false;
  private listeners: Set<AudioEngineListener> = new Set();
  private isMuted = false;
  private currentVolume = config.defaultVolume;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.crossOrigin = 'anonymous';
      this.audio.preload = 'auto';
      this.audio.volume = this.currentVolume;

      this.audio.addEventListener('timeupdate', () => {
        if (!this.audio) return;
        const currentTimeMs = Math.round(this.audio.currentTime * 1000);
        this.emit('timeupdate', currentTimeMs);
      });

      this.audio.addEventListener('ended', () => {
        this.emit('ended');
      });

      this.audio.addEventListener('play', () => {
        this.emit('play');
      });

      this.audio.addEventListener('pause', () => {
        this.emit('pause');
      });

      this.audio.addEventListener('error', () => {
        console.warn('[AudioEngine] 浏览器原生音频播放器遇到媒体加载异常');
        this.emit('error', this.audio?.error);
      });
    }
  }

  addListener(listener: AudioEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AudioEngineEvent, data?: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (err) {
        console.error('[AudioEngine] 监听器触发异常:', err);
      }
    }
  }

  private initWebAudio(): void {
    if (this.audioCtx || !this.audio || typeof window === 'undefined') return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const ctx = new AudioContextClass();
      this.audioCtx = ctx;

      const source = ctx.createMediaElementSource(this.audio);

      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);

      const directGainL = ctx.createGain();
      const directGainR = ctx.createGain();

      const lpfL = ctx.createBiquadFilter();
      lpfL.type = 'lowpass';
      lpfL.frequency.value = 700;
      lpfL.Q.value = 0.5;

      const lpfR = ctx.createBiquadFilter();
      lpfR.type = 'lowpass';
      lpfR.frequency.value = 700;
      lpfR.Q.value = 0.5;

      const delayL = ctx.createDelay();
      delayL.delayTime.value = 0.00035;

      const delayR = ctx.createDelay();
      delayR.delayTime.value = 0.00035;

      const crossGainL = ctx.createGain();
      const crossGainR = ctx.createGain();

      source.connect(splitter);

      // Left input -> direct L & crossfeed to R
      splitter.connect(directGainL, 0);
      directGainL.connect(merger, 0, 0);

      splitter.connect(lpfL, 0);
      lpfL.connect(delayL);
      delayL.connect(crossGainL);
      crossGainL.connect(merger, 0, 1);

      // Right input -> direct R & crossfeed to L
      splitter.connect(directGainR, 1);
      directGainR.connect(merger, 0, 1);

      splitter.connect(lpfR, 1);
      lpfR.connect(delayR);
      delayR.connect(crossGainR);
      crossGainR.connect(merger, 0, 0);

      merger.connect(ctx.destination);

      this.directGainL = directGainL;
      this.directGainR = directGainR;
      this.crossGainL = crossGainL;
      this.crossGainR = crossGainR;

      this.applyBs2bWeights();
    } catch (err) {
      console.warn('[AudioEngine] Web Audio DSP 初始化失败，回退至原生直出:', err);
    }
  }

  private applyBs2bWeights(): void {
    if (!this.directGainL || !this.directGainR || !this.crossGainL || !this.crossGainR) return;
    if (this.bs2bEnabled) {
      this.directGainL.gain.value = 0.82;
      this.directGainR.gain.value = 0.82;
      this.crossGainL.gain.value = 0.55;
      this.crossGainR.gain.value = 0.55;
    } else {
      this.directGainL.gain.value = 1.0;
      this.directGainR.gain.value = 1.0;
      this.crossGainL.gain.value = 0.0;
      this.crossGainR.gain.value = 0.0;
    }
  }

  setBs2b(enabled: boolean): void {
    this.bs2bEnabled = enabled;
    this.applyBs2bWeights();
  }

  getBs2b(): boolean {
    return this.bs2bEnabled;
  }

  /**
   * 启动指定曲目流式播放
   */
  async play(trackId: string, offsetMs = 0): Promise<void> {
    if (!this.audio) return;

    this.initWebAudio();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }

    await apiClient.ensureSession();
    const streamUrl = apiClient.getAudioStreamUrl(trackId);
    if (this.audio.src !== streamUrl) {
      this.audio.pause();
      this.audio.src = streamUrl;
      this.audio.load();
    }

    if (offsetMs > 0) {
      this.audio.currentTime = offsetMs / 1000;
    }

    try {
      await this.audio.play();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('[AudioEngine] 播放请求被限制:', err);
      }
    }
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.audio?.paused) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
      try {
        await this.audio.play();
      } catch (err) {
        console.warn('[AudioEngine] 继续播放失败:', err);
      }
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }

  seek(timeMs: number): void {
    if (!this.audio) return;
    try {
      const targetSec = Math.max(0, timeMs / 1000);
      if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
        this.audio.currentTime = Math.min(targetSec, this.audio.duration);
      } else {
        this.audio.currentTime = targetSec;
      }
    } catch (err) {
      console.warn('[AudioEngine] 跳转进度失败:', err);
    }
  }

  setVolume(vol: number): void {
    this.currentVolume = Math.max(0, Math.min(1, vol));
    if (this.audio) {
      this.audio.volume = this.isMuted ? 0 : this.currentVolume;
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.currentVolume;
    }
  }

  getCurrentTimeMs(): number {
    return this.audio ? Math.round(this.audio.currentTime * 1000) : 0;
  }

  getDurationMs(): number {
    return this.audio && !Number.isNaN(this.audio.duration)
      ? Math.round(this.audio.duration * 1000)
      : 0;
  }

  isPlaying(): boolean {
    return Boolean(this.audio && !this.audio.paused && !this.audio.ended);
  }
}

export const audioEngine = new BrowserAudioEngine();
export default audioEngine;
