import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';

// 5 组纯几何手绘连杆艺术音符 SVG 路径
const ARTISTIC_NOTES = [
  {
    id: 'eighth-note',
    d: 'M9 18V5l6-2v4l-6 2v9a3 3 0 1 1-3-3c1.3 0 2.4.8 2.8 2',
  },
  {
    id: 'beamed-notes',
    d: 'M7 17V6l10-2v11M7 9l10-2M7 17a2.5 2.5 0 1 1-2.5-2.5c1.1 0 2.1.7 2.4 1.7M17 15a2.5 2.5 0 1 1-2.5-2.5c1.1 0 2.1.7 2.4 1.7',
  },
  {
    id: 'quarter-note',
    d: 'M10 18V6c0-.6.4-1 1-1h1v13a3 3 0 1 1-3-3c1.3 0 2.4.8 2.8 2',
  },
  {
    id: 'double-beamed',
    d: 'M6 18V5l12-3v14M6 9l12-3M6 13l12-3M6 18a2.5 2.5 0 1 1-2.5-2.5c1.1 0 2.1.7 2.4 1.7M18 16a2.5 2.5 0 1 1-2.5-2.5c1.1 0 2.1.7 2.4 1.7',
  },
  {
    id: 'curled-clef',
    d: 'M8 18V4l8 2v10a3 3 0 1 1-3-3c1.3 0 2.4.8 2.8 2M8 8l8 2',
  },
];

export const SplashView: React.FC = () => {
  const { authenticate } = useAuthStore();
  const { fetchPlaylists, fetchPlaylistTree, refreshStats, stats } = useLibraryStore();
  const { navigate } = useUIStore();

  const [notesLanded, setNotesLanded] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    // 1. 执行音符跳跃动画计时器 (500ms 依次落位)
    const timer = setTimeout(() => {
      setNotesLanded(true);
    }, 700);

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

  // 当音符就位且数据就绪后，停留 1.2 秒给用户感知看板，随后自动分流转场
  useEffect(() => {
    if (!notesLanded || !dataReady) return;

    const transitionTimer = setTimeout(() => {
      const trackCount = stats?.trackCount ?? 0;
      if (trackCount === 0) {
        navigate('zero');
      } else {
        navigate('carousel');
      }
    }, 1500);

    return () => clearTimeout(transitionTimer);
  }, [notesLanded, dataReady, stats, navigate]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-canvas)] select-none">
      {/* 5 组纯几何跳跃艺术音符 */}
      <div className="flex items-center gap-6 mb-12">
        {ARTISTIC_NOTES.map((note, index) => (
          <motion.div
            key={note.id}
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              ...springMotion.gentle,
              delay: index * 0.1,
            }}
            className="w-10 h-10 text-[var(--text-primary)] flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" width="36" height="36" className="overflow-visible">
              <title>艺术音符</title>
              <path d={note.d} fill="currentColor" />
            </svg>
          </motion.div>
        ))}
      </div>

      {/* 4 行阶梯轻盈浮现数据看板 */}
      <div className="min-h-[120px] flex flex-col items-center justify-center text-center">
        {notesLanded && stats && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="space-y-2.5 font-medium text-xs text-[var(--text-secondary)]"
          >
            <p className="tracking-wide">
              曲库已收录{' '}
              <span className="font-semibold text-[var(--text-primary)]">{stats.trackCount}</span>{' '}
              首母带无损音轨
            </p>
            <p className="tracking-wide text-[var(--text-tertiary)]">
              编排为{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {stats.playlistCount}
              </span>{' '}
              个层级分类与独立歌单
            </p>
            <p className="tracking-wide text-[var(--text-tertiary)]">
              单曲平均时长{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {stats.avgDurationFormatted}
              </span>
            </p>
            <p className="tracking-wide text-[var(--text-tertiary)] text-[11px]">
              历史累计呈现{' '}
              <span className="font-semibold text-[var(--text-primary)]">
                {stats.totalDurationFormatted}
              </span>{' '}
              发烧纯净音律
            </p>
          </motion.div>
        )}

        {notesLanded && !stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-[var(--text-tertiary)] font-medium"
          >
            正在唤醒 Wavelet 本地高保真音频引擎...
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SplashView;
