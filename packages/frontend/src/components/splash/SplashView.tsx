import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth.store.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { SvgIcons } from '../common/SvgIcons.js';

// 5 组德国亨勒原典刻铜精度的极简矢量乐符
const ClefGlyph: React.FC = () => (
  <svg
    viewBox="0 0 24 28"
    width="22"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="overflow-visible"
  >
    <path d="M12 25 C10 25 8.5 23.5 8.5 21.8 C8.5 20 10 18.5 12 18.5 C13.8 18.5 15.2 19.8 15.2 21.5 C15.2 23.5 13.5 25 12 25 Z" fill="currentColor" opacity="0.12" />
    <path d="M12 2.5 C11 2.5 10 3.5 10 5 C10 7.5 13.5 10 13.5 13 C13.5 15.5 11.5 17 9.5 17 C7.5 17 6 15.5 6 13.5 C6 11 8 9.5 10.5 9.5 C11.5 9.5 12.2 9.8 12.8 10.2 L12.8 3 C12.8 2.7 12.4 2.5 12 2.5 Z M12.8 10.2 L12.8 22 C12.8 23.5 11.5 24.5 10 24.5 C8.5 24.5 7.5 23.5 7.5 22.2 C7.5 21 8.5 20.2 9.8 20.2 C10.6 20.2 11.2 20.6 11.5 21.2" />
    <circle cx="9.8" cy="22.2" r="1.2" fill="currentColor" />
  </svg>
);

const BeamedNotesGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className="overflow-visible">
    <line x1="6.8" y1="5.5" x2="19.2" y2="3.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <line x1="7" y1="5.5" x2="7" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="19" y1="3.5" x2="19" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="5" cy="17" rx="3.2" ry="2.2" transform="rotate(-30 5 17)" fill="currentColor" />
    <ellipse cx="17" cy="15" rx="3.2" ry="2.2" transform="rotate(-30 17 15)" fill="currentColor" />
  </svg>
);

const QuarterNoteGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className="overflow-visible">
    <line x1="11.2" y1="4" x2="11.2" y2="17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="8.5" cy="17.5" rx="3.4" ry="2.3" transform="rotate(-30 8.5 17.5)" fill="currentColor" />
  </svg>
);

const FlagNoteGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className="overflow-visible">
    <line x1="8.5" y1="4" x2="8.5" y2="17.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="6" cy="17.5" rx="3.4" ry="2.3" transform="rotate(-30 6 17.5)" fill="currentColor" />
    <path
      d="M8.5 4 C13 7, 15 10.5, 15 13.5 C14 12.8, 12 11.5, 8.5 10.5"
      fill="currentColor"
    />
  </svg>
);

const SixteenthNotesGlyph: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className="overflow-visible">
    <line x1="6.8" y1="5" x2="19.2" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="6.8" y1="8.5" x2="19.2" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="7" y1="5" x2="7" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="19" y1="3" x2="19" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <ellipse cx="5" cy="17" rx="3.2" ry="2.2" transform="rotate(-30 5 17)" fill="currentColor" />
    <ellipse cx="17" cy="15" rx="3.2" ry="2.2" transform="rotate(-30 17 15)" fill="currentColor" />
  </svg>
);

const REFINED_NOTES = [
  { id: 'clef', Component: ClefGlyph },
  { id: 'beamed', Component: BeamedNotesGlyph },
  { id: 'quarter', Component: QuarterNoteGlyph },
  { id: 'flag', Component: FlagNoteGlyph },
  { id: 'sixteenth', Component: SixteenthNotesGlyph },
];

export const SplashView: React.FC = () => {
  const { authenticate } = useAuthStore();
  const { fetchPlaylists, fetchPlaylistTree, refreshStats, stats } = useLibraryStore();
  const { navigate } = useUIStore();

  const [notesLanded, setNotesLanded] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    // 1. 高阻尼沉降计时器
    const timer = setTimeout(() => {
      setNotesLanded(true);
    }, 600);

    // 2. 静默完成握手与曲库数据预热
    const bootData = async () => {
      try {
        await authenticate();
        await Promise.all([fetchPlaylists(), fetchPlaylistTree(), refreshStats()]);
        setDataReady(true);
      } catch {
        // 网络异常容灾降级
        setDataReady(true);
      }
    };

    bootData();

    return () => clearTimeout(timer);
  }, [authenticate, fetchPlaylists, fetchPlaylistTree, refreshStats]);

  // 当音符就位且数据就绪后，停留给用户感知，随后无缝分流转场
  useEffect(() => {
    if (!notesLanded || !dataReady) return;

    const transitionTimer = setTimeout(() => {
      const trackCount = stats?.trackCount ?? 0;
      if (trackCount === 0) {
        navigate('zero');
      } else {
        navigate('carousel');
      }
    }, 1800);

    return () => clearTimeout(transitionTimer);
  }, [notesLanded, dataReady, stats, navigate]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-canvas)] select-none px-6">
      {/* 顶部 Wavelet 品牌与发烧母带标示 */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center gap-1.5 mb-8"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-[var(--text-primary)] text-white flex items-center justify-center shadow-[var(--shadow-xs)]">
            <SvgIcons name="wave" size={11} />
          </div>
          <span className="font-bold text-xs tracking-[0.24em] text-[var(--text-primary)] uppercase">
            Wavelet
          </span>
        </div>
        <span className="text-[10px] font-mono tracking-widest text-[var(--text-tertiary)] uppercase opacity-80">
          Bit-Perfect Master Audio Engine
        </span>
      </motion.div>

      {/* 核心符号群与 0.75px 声学小波基准线 */}
      <div className="relative flex items-center justify-center my-4 py-5 w-72">
        {/* 背景 0.75px 极细声学小波基准线 */}
        <svg
          className="absolute w-full h-10 pointer-events-none overflow-visible text-[var(--border-subtle)]"
          viewBox="0 0 288 40"
        >
          <motion.path
            d="M 0 20 L 60 20 C 90 20, 105 14, 120 14 C 135 14, 150 26, 165 26 C 180 26, 195 20, 225 20 L 288 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="2 3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.7 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        </svg>

        {/* 5 个高阻尼落位与微浮沉极简乐符 */}
        <div className="relative z-10 flex items-center justify-between w-full px-2">
          {REFINED_NOTES.map(({ id, Component }, index) => (
            <motion.div
              key={id}
              initial={{ y: -10, opacity: 0 }}
              animate={
                notesLanded
                  ? { y: [0, -1.8, 0], opacity: 1 }
                  : { y: 0, opacity: 1 }
              }
              transition={
                notesLanded
                  ? {
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 3.2,
                      ease: 'easeInOut',
                      delay: index * 0.16,
                    }
                  : {
                      type: 'spring',
                      stiffness: 400,
                      damping: 32,
                      mass: 0.8,
                      delay: index * 0.08,
                    }
              }
              className="w-8 h-8 text-[var(--text-primary)] flex items-center justify-center select-none"
            >
              <Component />
            </motion.div>
          ))}
        </div>
      </div>

      {/* 画廊级极简数据看板 */}
      <div className="min-h-[90px] flex flex-col items-center justify-center text-center mt-6">
        {notesLanded && stats && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col items-center gap-2 text-xs"
          >
            <p className="font-medium text-[var(--text-secondary)] tracking-wide">
              曲库已就绪{' '}
              <span className="font-semibold text-[var(--text-primary)] font-mono">
                {stats.trackCount}
              </span>{' '}
              首母带无损音轨 ·{' '}
              <span className="font-semibold text-[var(--text-primary)] font-mono">
                {stats.playlistCount}
              </span>{' '}
              个歌单
            </p>

            <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)] font-mono">
              <span>单曲均长 {stats.avgDurationFormatted}</span>
              <span className="opacity-40">/</span>
              <span>历史累计 {stats.totalDurationFormatted}</span>
            </div>

            <div className="mt-1 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-mint)] animate-pulse" />
              <span>Bit-Perfect 纯净直通已就绪</span>
            </div>
          </motion.div>
        )}

        {notesLanded && !stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-[var(--text-tertiary)] font-mono tracking-wide"
          >
            正在自检本地母带高保真音频硬件直通...
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SplashView;
