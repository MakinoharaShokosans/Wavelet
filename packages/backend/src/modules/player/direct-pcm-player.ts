import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { Track } from '@wavelet/shared';
import ffmpegStatic from 'ffmpeg-static';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { broadcastPlaybackSync } from '../gateway/ws/broadcaster.js';
import { resolvePlayableAudioPath } from '../library/musics-syncer.js';
import { FftPump } from './fft-pump.js';

interface ResolvedFfmpeg {
  bin: string;
  hasBs2b: boolean;
}

let cachedFfmpegResolution: ResolvedFfmpeg | null = null;

export function resolveFfmpegForPlayer(): ResolvedFfmpeg {
  if (cachedFfmpegResolution) {
    return cachedFfmpegResolution;
  }

  const config = getConfig();
  const custom = config.transcoder.customFfmpegPath;

  // 1. 自定义配置路径
  if (custom && fs.existsSync(custom)) {
    try {
      const res = spawnSync(custom, ['-filters'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      cachedFfmpegResolution = { bin: custom, hasBs2b: (res.stdout || '').includes('bs2b') };
      return cachedFfmpegResolution;
    } catch {
      // 异常继续探测
    }
  }

  // 2. 探测系统原生 ffmpeg (Linux 如 Fedora/Arch/Debian 下通常编译了完整的 libbs2b, libsoxr 等发烧音频滤镜)
  try {
    const res = spawnSync('ffmpeg', ['-filters'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.status === 0) {
      cachedFfmpegResolution = { bin: 'ffmpeg', hasBs2b: (res.stdout || '').includes('bs2b') };
      return cachedFfmpegResolution;
    }
  } catch {
    // 系统无 ffmpeg 命令
  }

  // 3. 回退至内置静态 ffmpegStatic
  const staticPath = ffmpegStatic || 'ffmpeg';
  try {
    const res = spawnSync(staticPath, ['-filters'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cachedFfmpegResolution = { bin: staticPath, hasBs2b: (res.stdout || '').includes('bs2b') };
    return cachedFfmpegResolution;
  } catch {
    cachedFfmpegResolution = { bin: staticPath, hasBs2b: false };
    return cachedFfmpegResolution;
  }
}

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface DirectPlaybackStatus {
  state: PlaybackState;
  currentTrack: Track | null;
  currentTimeMs: number;
  durationMs: number;
  volume: number;
  deviceId: string;
  bs2bEnabled: boolean;
}

export class DirectPcmPlayer {
  private state: PlaybackState = 'stopped';
  private currentTrack: Track | null = null;
  private currentTimeMs = 0;
  private durationMs = 0;
  private volume = 1.0;
  private deviceId = 'default';
  private bs2bEnabled = false;

  private ffmpegProcess: ChildProcess | null = null;
  private sinkProcess: ChildProcess | null = null;
  private fftPump: FftPump;
  private syncTimer: NodeJS.Timeout | null = null;
  private bytesProcessed = 0;
  private startOffsetMs = 0;

  // 44.1kHz, 16bit, Stereo 对应每毫秒 176.4 字节
  private readonly BYTES_PER_MS = 176.4;

  constructor() {
    this.fftPump = new FftPump(1024, 64);
    const config = getConfig();
    this.volume = config.audio.defaultVolume;
    this.deviceId = config.audio.outputDevice;
  }

  /**
   * 启动指定曲目的硬件独占解码与直通播放
   */
  async play(track: Track, offsetMs = 0): Promise<void> {
    this.stop();

    const effectivePath = resolvePlayableAudioPath(track);
    if (!fs.existsSync(effectivePath)) {
      logger.warn(
        { trackId: track.id, filePath: effectivePath },
        '[DirectPlayer] 物理文件不存在，拦截硬件直通启动'
      );
      this.state = 'stopped';
      return;
    }

    this.currentTrack = track;
    this.durationMs = track.duration * 1000;
    this.startOffsetMs = Math.max(0, Math.min(offsetMs, this.durationMs));
    this.currentTimeMs = this.startOffsetMs;
    this.bytesProcessed = 0;
    this.state = 'playing';

    const { bin: ffmpegPath, hasBs2b } = resolveFfmpegForPlayer();
    const offsetSeconds = (this.startOffsetMs / 1000).toFixed(3);

    const useBs2b = this.bs2bEnabled && hasBs2b;
    if (this.bs2bEnabled && !hasBs2b) {
      logger.warn(
        '[DirectPlayer] 当前 FFmpeg 缺乏 libbs2b 滤镜支持，已自动跳过互馈声场滤镜以避免解码崩溃'
      );
    }

    // 1. 启动 FFmpeg 解码为 16-bit 44.1kHz 立体声 PCM 管道
    const ffmpegArgs = [
      '-re',
      '-ss',
      offsetSeconds,
      '-i',
      effectivePath,
      '-vn',
      ...(useBs2b ? ['-af', 'bs2b=profile=default'] : []),
      '-f',
      's16le',
      '-ac',
      '2',
      '-ar',
      '44100',
      'pipe:1',
    ];

    try {
      this.ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      logger.error({ err, filePath: track.filePath }, '[DirectPlayer] 启动 FFmpeg 解码管道失败');
      this.state = 'stopped';
      return;
    }

    const ffmpeg = this.ffmpegProcess;
    if (!ffmpeg || !ffmpeg.stdout) {
      this.state = 'stopped';
      return;
    }

    // 2. 尝试挂载系统音频汇 (Audio Sink)
    this.attachAudioSink();

    // 3. 处理 PCM 流分块、音量缩放与 60fps 频谱泵送
    let isFadingIn = true;
    let fadeSamplesProcessed = 0;
    const fadeTotalSamples = 4410; // 50ms 淡入 (44.1kHz * 0.05 * 2)

    ffmpeg.stdout.on('data', (rawChunk: Buffer) => {
      if (this.state !== 'playing') return;

      const chunk = Buffer.from(rawChunk);
      const sampleCount = Math.floor(chunk.length / 2);

      // 64 位浮点数高精度音量缩放与启动微淡入 (防爆音防冲击)
      for (let i = 0; i < sampleCount; i++) {
        let sample = chunk.readInt16LE(i * 2);
        let effectiveVol = this.volume;

        if (isFadingIn) {
          effectiveVol = this.volume * (fadeSamplesProcessed / fadeTotalSamples);
          fadeSamplesProcessed++;
          if (fadeSamplesProcessed >= fadeTotalSamples) {
            isFadingIn = false;
          }
        }

        sample = Math.max(-32768, Math.min(32767, Math.round(sample * effectiveVol)));
        chunk.writeInt16LE(sample, i * 2);
      }

      // 将缩放后的 PCM 数据灌入声卡输出端
      if (this.sinkProcess?.stdin && !this.sinkProcess.stdin.destroyed) {
        try {
          this.sinkProcess.stdin.write(chunk, () => {});
        } catch {
          this.sinkProcess = null;
        }
      }

      // 截取并泵送 1024 样点至 WebSocket 频域分析器 (60 FPS 刷新)
      this.fftPump.processPcmChunk(chunk);

      this.bytesProcessed += chunk.length;
      this.currentTimeMs = this.startOffsetMs + Math.floor(this.bytesProcessed / this.BYTES_PER_MS);
    });

    let stderrText = '';
    ffmpeg.stderr?.on('data', (raw: Buffer) => {
      stderrText += raw.toString();
      if (stderrText.length > 2000) {
        stderrText = stderrText.slice(-2000);
      }
    });

    ffmpeg.stdout.on('end', () => {
      if (this.state === 'playing') {
        logger.info({ trackId: track.id }, '[DirectPlayer] 曲目播放完毕');
        this.stop();
      }
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null && this.state === 'playing') {
        logger.warn(
          { code, stderr: stderrText.trim() },
          '[DirectPlayer] FFmpeg 解码管道非正常退出'
        );
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error({ err }, '[DirectPlayer] FFmpeg 进程发生异常');
      this.stop();
    });

    // 4. 启动 100ms 播放时钟对齐广播
    this.startClockSync();

    this.broadcastSync();
    logger.info(
      { trackId: track.id, title: track.title, device: this.deviceId },
      '[DirectPlayer] 硬件直通播放已启动'
    );
  }

  /**
   * 挂载物理声卡播放进程 (如 Linux aplay)
   */
  private attachAudioSink(): void {
    const platform = os.platform();

    if (platform === 'linux') {
      try {
        const alsaTarget = this.deviceId === 'default' ? 'default' : `plug${this.deviceId}`;
        const sink = spawn('aplay', ['-D', alsaTarget, '-f', 'cd', '-t', 'raw'], {
          stdio: ['pipe', 'ignore', 'pipe'],
        });

        // 监听 stdin 错误，吸收 EPIPE（切歌时管道断开为预期正常行为）
        sink.stdin?.on('error', () => {
          this.sinkProcess = null;
        });

        sink.on('error', (err) => {
          logger.warn({ err }, '[DirectPlayer] aplay 声卡接入失败，回退至静默推流驱动');
          this.sinkProcess = null;
        });

        sink.on('exit', () => {
          this.sinkProcess = null;
        });

        this.sinkProcess = sink;
      } catch (err) {
        logger.warn({ err }, '[DirectPlayer] 无法启动 ALSA 声卡汇进程');
        this.sinkProcess = null;
      }
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (this.state !== 'playing') return;

    this.state = 'paused';
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGSTOP');
    }
    if (this.sinkProcess) {
      this.sinkProcess.kill('SIGSTOP');
    }

    this.broadcastSync();
    logger.info({ currentTimeMs: this.currentTimeMs }, '[DirectPlayer] 播放已暂停');
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (this.state !== 'paused') return;

    this.state = 'playing';
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGCONT');
    }
    if (this.sinkProcess) {
      this.sinkProcess.kill('SIGCONT');
    }

    this.broadcastSync();
    logger.info({ currentTimeMs: this.currentTimeMs }, '[DirectPlayer] 播放已恢复');
  }

  /**
   * 停止播放并释放物理句柄
   */
  stop(): void {
    this.state = 'stopped';
    this.stopClockSync();

    if (this.ffmpegProcess) {
      const proc = this.ffmpegProcess;
      this.ffmpegProcess = null;
      try {
        proc.stdout?.removeAllListeners();
        proc.stderr?.removeAllListeners();
        proc.removeAllListeners();
        proc.kill('SIGKILL');
      } catch {
        // 忽略进程杀死异常
      }
    }

    if (this.sinkProcess) {
      const sink = this.sinkProcess;
      this.sinkProcess = null;
      try {
        sink.stdin?.removeAllListeners();
        sink.removeAllListeners();
        sink.kill('SIGKILL');
      } catch {
        // 忽略
      }
    }

    this.broadcastSync();
  }

  /**
   * 毫秒级精确定位
   */
  async seek(offsetMs: number): Promise<void> {
    if (!this.currentTrack) return;
    const targetOffset = Math.max(0, Math.min(offsetMs, this.durationMs));
    await this.play(this.currentTrack, targetOffset);
  }

  /**
   * 设置 64 位浮点数软件增益音量 (0.0 ~ 1.0)
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.broadcastSync();
  }

  /**
   * 切换物理输出设备
   */
  setDevice(deviceId: string): void {
    this.deviceId = deviceId;
    if (this.state === 'playing' && this.currentTrack) {
      this.seek(this.currentTimeMs);
    }
  }

  /**
   * 开启或关闭 BS2B 耳塞互馈声场算法
   */
  setBs2b(enabled: boolean): void {
    if (this.bs2bEnabled === enabled) return;
    this.bs2bEnabled = enabled;
    if (this.state === 'playing' && this.currentTrack) {
      void this.seek(this.currentTimeMs);
    }
  }

  getBs2b(): boolean {
    return this.bs2bEnabled;
  }

  /**
   * 获取当前播放器状态
   */
  getStatus(): DirectPlaybackStatus {
    return {
      state: this.state,
      currentTrack: this.currentTrack,
      currentTimeMs: this.currentTimeMs,
      durationMs: this.durationMs,
      volume: this.volume,
      deviceId: this.deviceId,
      bs2bEnabled: this.bs2bEnabled,
    };
  }

  private startClockSync(): void {
    this.stopClockSync();
    this.syncTimer = setInterval(() => {
      if (this.state === 'playing') {
        this.broadcastSync();
      }
    }, 100);
  }

  private stopClockSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private broadcastSync(): void {
    if (this.currentTrack) {
      broadcastPlaybackSync({
        trackId: this.currentTrack.id,
        currentTimeMs: this.currentTimeMs,
        durationMs: this.durationMs,
        state: this.state,
      });
    }
  }
}

let playerInstance: DirectPcmPlayer | null = null;

export function getDirectPlayer(): DirectPcmPlayer {
  if (!playerInstance) {
    playerInstance = new DirectPcmPlayer();
  }
  return playerInstance;
}
