import { motion } from 'motion/react';
import type React from 'react';
import { useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { trackService } from '../../services/track.service.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import type { PlayMode } from '../../types/index.js';
import { FloatingCard } from '../common/FloatingCard.js';
import { FluidSlider } from '../common/FluidSlider.js';
import { SvgIcons } from '../common/SvgIcons.js';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const PLAY_MODE_ICONS: Record<
  PlayMode,
  { icon: 'sequence' | 'repeat' | 'repeat-track' | 'shuffle'; label: string }
> = {
  sequence: { icon: 'sequence', label: '顺序播放到底' },
  'repeat-list': { icon: 'repeat', label: '列表循环' },
  'repeat-track': { icon: 'repeat-track', label: '单曲循环' },
  shuffle: { icon: 'shuffle', label: '随机乱序播放' },
};

const NEXT_PLAY_MODES: Record<PlayMode, PlayMode> = {
  sequence: 'repeat-list',
  'repeat-list': 'repeat-track',
  'repeat-track': 'shuffle',
  shuffle: 'sequence',
};

export const FloatingPlayerDock: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTimeMs,
    durationMs,
    sourcePlaylistName,
    setIsScrubbing,
    togglePlayPause,
    next,
    previous,
    seek,
    status,
    setVolume,
    toggleMute,
    isMuted,
    playMode,
    setPlayMode,
    bitPerfectEnabled,
    toggleBitPerfect,
    bs2bEnabled,
    toggleBs2b,
  } = usePlayerStore();

  const { toggleQueueDrawer, isQueueDrawerOpen, navigate } = useUIStore();
  const [scrubTimeMs, setScrubTimeMs] = useState<number | null>(null);

  const handleModeCycle = () => {
    const nextMode = NEXT_PLAY_MODES[playMode];
    setPlayMode(nextMode);
  };

  const handleExpandStage = () => {
    if (currentTrack) {
      navigate('player-stage');
    }
  };

  const modeInfo = PLAY_MODE_ICONS[playMode];
  const trackTitle = currentTrack?.title || 'Wavelet ♫ 等待播放';
  const trackArtist = currentTrack?.artist || '发烧级母带播放引擎已就绪';
  const displayTimeMs = scrubTimeMs !== null ? scrubTimeMs : currentTimeMs;

  return (
    <motion.aside
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={springMotion.gentle}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[920px] w-[calc(100%-40px)] h-18 bg-white/95 backdrop-blur-xl border border-[var(--border-subtle)] rounded-3xl shadow-[var(--shadow-dock)] px-6 flex items-center justify-between select-none"
    >
      {/* 左侧：微缩封面与单曲信息卡片 (包含歌曲名、所在歌单、音轨规格等) */}
      <button
        type="button"
        onClick={handleExpandStage}
        className={`flex items-center gap-3.5 min-w-[200px] max-w-[280px] text-left border-0 bg-transparent p-0 ${
          currentTrack ? 'cursor-pointer group' : 'cursor-default'
        }`}
      >
        <div className="relative w-11 h-11 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden flex-shrink-0 shadow-[var(--shadow-xs)]">
          {currentTrack?.hasEmbeddedCover ? (
            <img
              src={trackService.getCoverUrl(currentTrack.id)}
              alt={trackTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className={`w-6 h-6 rounded-full bg-white flex items-center justify-center text-[var(--text-secondary)] ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '4s' }}
            >
              <SvgIcons name="music" size={13} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-mint)] transition-colors">
              {trackTitle}
            </h4>
            {currentTrack && (
              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold bg-[var(--bg-elevated)] text-[var(--text-tertiary)] flex-shrink-0">
                {Math.round(currentTrack.sampleRate / 1000)}k/{currentTrack.bitDepth}b
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
            {sourcePlaylistName && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[10px] font-medium flex-shrink-0 max-w-[100px]">
                <SvgIcons name="music" size={10} />
                <span className="truncate">{sourcePlaylistName}</span>
              </span>
            )}
            <span className="truncate">{trackArtist}</span>
          </div>
        </div>
      </button>

      {/* 中间核心控制与细微进度条 */}
      <div className="flex-1 max-w-sm px-6 flex flex-col items-center">
        {/* 控制按钮组 */}
        <div className="flex items-center gap-5 mb-1.5">
          <button
            type="button"
            onClick={previous}
            className="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="上一曲"
          >
            <SvgIcons name="previous" size={16} />
          </button>

          <button
            type="button"
            onClick={togglePlayPause}
            className="w-9 h-9 rounded-full bg-[var(--text-primary)] text-white flex items-center justify-center shadow-[var(--shadow-xs)] hover:scale-108 active:scale-95 transition-all duration-150 cursor-pointer"
            title={isPlaying ? '暂停' : '播放'}
          >
            <SvgIcons name={isPlaying ? 'pause' : 'play'} size={15} />
          </button>

          <button
            type="button"
            onClick={next}
            className="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            title="下一曲"
          >
            <SvgIcons name="next" size={16} />
          </button>
        </div>

        {/* 细微时间轴与进度 Seeking */}
        <div className="w-full flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono min-w-[32px] text-right">
            {formatTime(displayTimeMs)}
          </span>
          <div className="flex-1">
            <FluidSlider
              value={displayTimeMs}
              min={0}
              max={durationMs || 1}
              onChange={(val) => {
                setScrubTimeMs(val);
                setIsScrubbing(true);
              }}
              onChangeEnd={(val) => {
                setScrubTimeMs(null);
                setIsScrubbing(false);
                void seek(val);
              }}
              className="h-3"
            />
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] font-mono min-w-[32px]">
            {formatTime(durationMs)}
          </span>
        </div>
      </div>

      {/* 右侧扩展功能区 */}
      <div className="flex items-center gap-3">
        {/* BS2B 互馈声场胶囊 */}
        <FloatingCard
          trigger={
            <button
              type="button"
              onClick={() => toggleBs2b()}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                bs2bEnabled
                  ? 'bg-[var(--bg-elevated)] text-[var(--accent-mint)] border-[var(--accent-mint)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border-[var(--border-subtle)]'
              }`}
            >
              <SvgIcons name="headphones" size={11} />
              <span>BS2B</span>
            </button>
          }
          content={bs2bEnabled ? 'BS2B 耳塞互馈声场已开启' : '点击开启 BS2B 声场互馈'}
        />

        {/* Bit-Perfect 直通胶囊 */}
        <FloatingCard
          trigger={
            <button
              type="button"
              onClick={() => toggleBitPerfect()}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1 ${
                bitPerfectEnabled
                  ? 'bg-[var(--bg-elevated)] text-[var(--accent-mint)] border-[var(--accent-mint)]'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border-[var(--border-subtle)]'
              }`}
            >
              <SvgIcons name="bit-perfect" size={11} />
              <span>Bit-Perfect</span>
            </button>
          }
          content={bitPerfectEnabled ? '硬件直通已点亮' : '点击开启硬件独占直通'}
        />

        {/* 播放模式循环切换 */}
        <FloatingCard
          trigger={
            <button
              type="button"
              onClick={handleModeCycle}
              className="w-7 h-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <SvgIcons name={modeInfo.icon} size={15} />
            </button>
          }
          content={modeInfo.label}
        />

        {/* 音量滑块与静音切换 */}
        <div className="flex items-center gap-1.5 w-24">
          <button
            type="button"
            onClick={toggleMute}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <SvgIcons name={isMuted ? 'volume-mute' : 'volume'} size={15} />
          </button>
          <div className="flex-1">
            <FluidSlider
              value={isMuted ? 0 : status.volume}
              min={0}
              max={1}
              onChange={(v) => setVolume(v)}
              className="h-3"
            />
          </div>
        </div>

        {/* 播放队列抽屉开关 */}
        <FloatingCard
          trigger={
            <button
              type="button"
              onClick={toggleQueueDrawer}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                isQueueDrawerOpen
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <SvgIcons name="list" size={16} />
            </button>
          }
          content="播放队列"
        />
      </div>
    </motion.aside>
  );
};

export default FloatingPlayerDock;
