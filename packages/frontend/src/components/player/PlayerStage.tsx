import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { trackService } from '../../services/track.service.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import type { PlayMode } from '../../types/index.js';
import { FloatingCard } from '../common/FloatingCard.js';
import { FluidSlider } from '../common/FluidSlider.js';
import { SvgIcons } from '../common/SvgIcons.js';
import FluidWaveform from './FluidWaveform.js';
import LyricsPanel from './LyricsPanel.js';
import VinylRecord from './VinylRecord.js';

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
  shuffle: { icon: 'shuffle', label: '随机乱序' },
};

const NEXT_PLAY_MODES: Record<PlayMode, PlayMode> = {
  sequence: 'repeat-list',
  'repeat-list': 'repeat-track',
  'repeat-track': 'shuffle',
  shuffle: 'sequence',
};

export const PlayerStage: React.FC = () => {
  const { goBack } = useUIStore();
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
    playMode,
    setPlayMode,
    status,
    setVolume,
    isMuted,
    toggleMute,
    bitPerfectEnabled,
    toggleBitPerfect,
    bs2bEnabled,
    toggleBs2b,
  } = usePlayerStore();

  const [scrubTimeMs, setScrubTimeMs] = useState<number | null>(null);

  // 支持键盘 ESC 键收起大舞台
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        goBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack]);

  if (!currentTrack) {
    return null;
  }

  const handleModeCycle = () => {
    setPlayMode(NEXT_PLAY_MODES[playMode]);
  };

  const modeInfo = PLAY_MODE_ICONS[playMode];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={springMotion.morph}
      className="fixed inset-0 z-50 bg-white flex flex-col justify-between p-8 select-none"
    >
      {/* 顶部工具栏与格式参数 */}
      <header className="w-full flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] transition-colors cursor-pointer"
        >
          <SvgIcons name="chevron-left" size={16} />
          <span>收起 (ESC)</span>
        </button>

        {/* 顶部发烧规格徽标 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            FLAC · {Math.round(currentTrack.sampleRate / 1000)}kHz / {currentTrack.bitDepth}bit
          </span>
          {bs2bEnabled && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--accent-mint)] text-[var(--accent-mint)] flex items-center gap-1">
              <SvgIcons name="headphones" size={13} />
              <span>BS2B 声场</span>
            </span>
          )}
          {bitPerfectEnabled && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--accent-mint)] text-[var(--accent-mint)] flex items-center gap-1">
              <SvgIcons name="bit-perfect" size={13} />
              <span>Bit-Perfect 直通</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={goBack}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors cursor-pointer"
        >
          <SvgIcons name="close" size={18} />
        </button>
      </header>

      {/* 主视觉中枢：黑胶唱盘 + 60fps 贝塞尔流体音波 + 歌词 */}
      <main className="flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 items-center gap-12 my-6 overflow-hidden">
        {/* 左侧：黑胶唱盘与流体波形 Canvas */}
        <div className="flex flex-col items-center justify-center space-y-8">
          <VinylRecord
            isPlaying={isPlaying}
            size={300}
            coverUrl={
              currentTrack.hasEmbeddedCover ? trackService.getCoverUrl(currentTrack.id) : undefined
            }
          />

          <div className="w-full max-w-md text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
              {currentTrack.title}
            </h2>
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-sm font-medium text-[var(--text-tertiary)] truncate">
                {currentTrack.artist} · {currentTrack.album}
              </p>
              {sourcePlaylistName && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-medium shadow-[var(--shadow-xs)]">
                  <SvgIcons name="music" size={12} />
                  <span>所在歌单：{sourcePlaylistName}</span>
                </div>
              )}
            </div>
          </div>

          {/* 60fps Catmull-Rom 贝塞尔流体音波 */}
          <div className="w-full max-w-md">
            <FluidWaveform isPlaying={isPlaying} />
          </div>
        </div>

        {/* 右侧：毫秒级时钟对齐居中滚动歌词 */}
        <div className="h-[460px] w-full rounded-3xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-hidden">
          <LyricsPanel lyricsText="" />
        </div>
      </main>

      {/* 底部播放控制中枢 */}
      <footer className="w-full max-w-3xl mx-auto flex flex-col items-center space-y-4">
        {/* 细微时间轴与 Seeking */}
        <div className="w-full flex items-center gap-3">
          <span className="text-xs text-[var(--text-tertiary)] font-mono min-w-[38px] text-right">
            {formatTime(scrubTimeMs !== null ? scrubTimeMs : currentTimeMs)}
          </span>
          <div className="flex-1">
            <FluidSlider
              value={scrubTimeMs !== null ? scrubTimeMs : currentTimeMs}
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
              className="h-4"
            />
          </div>
          <span className="text-xs text-[var(--text-tertiary)] font-mono min-w-[38px]">
            {formatTime(durationMs)}
          </span>
        </div>

        {/* 控制按钮与音量直通 */}
        <div className="w-full flex items-center justify-between">
          {/* 左下：播放模式 */}
          <FloatingCard
            trigger={
              <button
                type="button"
                onClick={handleModeCycle}
                className="w-9 h-9 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <SvgIcons name={modeInfo.icon} size={18} />
              </button>
            }
            content={modeInfo.label}
          />

          {/* 居中：核心切歌 */}
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={previous}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="上一曲"
            >
              <SvgIcons name="previous" size={20} />
            </button>

            <button
              type="button"
              onClick={togglePlayPause}
              className="w-14 h-14 rounded-full bg-[var(--text-primary)] text-white flex items-center justify-center shadow-[var(--shadow-card)] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
              title={isPlaying ? '暂停' : '播放'}
            >
              <SvgIcons name={isPlaying ? 'pause' : 'play'} size={24} />
            </button>

            <button
              type="button"
              onClick={next}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="下一曲"
            >
              <SvgIcons name="next" size={20} />
            </button>
          </div>

          {/* 右下：声场/硬件直通与音量 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleBs2b()}
              className={`p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                bs2bEnabled
                  ? 'text-[var(--accent-mint)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
              title="切换 BS2B 耳塞互馈声场"
            >
              <SvgIcons name="headphones" size={18} />
            </button>

            <button
              type="button"
              onClick={() => toggleBitPerfect()}
              className={`p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                bitPerfectEnabled
                  ? 'text-[var(--accent-mint)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
              title="切换 Bit-Perfect 硬件直通"
            >
              <SvgIcons name="bit-perfect" size={18} />
            </button>

            <div className="flex items-center gap-1.5 w-28">
              <button
                type="button"
                onClick={toggleMute}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <SvgIcons name={isMuted ? 'volume-mute' : 'volume'} size={17} />
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
          </div>
        </div>
      </footer>
    </motion.div>
  );
};

export default PlayerStage;
