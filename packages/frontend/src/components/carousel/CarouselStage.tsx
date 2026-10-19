import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { playlistService } from '../../services/playlist.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from './DropCascadeEngine.js';
import PlaylistCard from './PlaylistCard.js';

export const CarouselStage: React.FC = () => {
  const { playlists, selectPlaylist, stats, refreshStats } = useLibraryStore();
  const { navigate, resetBreadcrumbs, pushBreadcrumb } = useUIStore();

  useEffect(() => {
    if (!stats) {
      void refreshStats();
    }
  }, [stats, refreshStats]);

  // 仅展示实际可播放的自定义歌单（排除系统默认全部/未集成/收藏/回收歌单，以及分类文件夹容器）
  const displayPlaylists = playlists.filter((p) => !p.isDefault && !p.isFolder);
  const totalTracksCount = displayPlaylists.reduce((acc, p) => acc + (p.trackCount || 0), 0);

  const {
    containerRef,
    activeIndex,
    setActiveIndex,
    hasEntered,
    handleWheel,
    snapOffset,
    getItemDelay,
    dragProps,
    isDraggingRef,
  } = useCarouselSnap({ totalItems: displayPlaylists.length });

  const activePlaylist = displayPlaylists[activeIndex];
  const activeCoverUrl =
    activePlaylist && activePlaylist.coverImagePath
      ? playlistService.getCoverUrl(activePlaylist.id)
      : null;

  const handleCardClick = (index: number) => {
    if (isDraggingRef.current) return;
    if (index !== activeIndex) {
      setActiveIndex(index);
    } else {
      const target = displayPlaylists[index];
      selectPlaylist(target);
      resetBreadcrumbs();

      // 递归回溯父级目录，构建完整的导航路径 (例如 曲库大厅 > GalGame > Rewrite)
      const chain: { id: string; name: string; isFolder: boolean }[] = [];
      let curr: typeof target | undefined = target;
      while (curr) {
        chain.unshift({ id: curr.id, name: curr.name, isFolder: Boolean(curr.isFolder) });
        if (curr.parentId) {
          curr = playlists.find((p) => p.id === curr?.parentId);
        } else {
          curr = undefined;
        }
      }
      for (const item of chain) {
        pushBreadcrumb(item);
      }

      navigate('playlist-detail');
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="w-full h-full flex flex-col justify-between pt-5 pb-24 overflow-hidden relative select-none"
    >
      {/* 封面自适应环境弥散流体光晕 (Dynamic Ambient Aura - 增强扩散与舞台投光) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
        <AnimatePresence mode="wait">
          {activeCoverUrl ? (
            <motion.div
              key={activeCoverUrl}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.42, scale: 1.15 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="w-[880px] h-[640px] rounded-full blur-[130px] transform-gpu pointer-events-none"
              style={{
                backgroundImage: `url(${activeCoverUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ) : (
            <motion.div
              key="default-aura"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.12 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="w-[680px] h-[480px] rounded-full bg-[var(--text-tertiary)] blur-[120px] transform-gpu pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>

      {/* 顶部母带策展仪表盘 (消灭孤立与大面积惨白空白) */}
      <div className="flex flex-col items-center text-center relative z-10 px-8 flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/75 backdrop-blur-md border border-[var(--border-subtle)] shadow-[0_2px_8px_rgba(0,0,0,0.03)] mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-mint)] animate-pulse" />
          <span className="text-[10px] tracking-[0.24em] font-semibold text-[var(--text-secondary)] uppercase">
            Master Acoustic Gallery
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] mb-2">
          曲库
        </h1>
        <div className="flex items-center gap-2.5 text-xs text-[var(--text-tertiary)] font-medium">
          <span>{displayPlaylists.length} 部典藏歌单</span>
          <span className="opacity-40">·</span>
          <span>{totalTracksCount || stats?.trackCount || 0} 首在席音轨</span>
          <span className="opacity-40">·</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] text-[10px] font-mono font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            <span className="w-1 h-1 rounded-full bg-[var(--accent-mint)]" />
            Hi-Res Lossless
          </span>
        </div>
      </div>

      {/* 横向吸附轮播轨道 */}
      {displayPlaylists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)] text-xs relative z-10 my-auto">
          <p>暂无歌单</p>
          <p className="mt-1">点击左侧【+】新建歌单</p>
        </div>
      ) : (
        <motion.div
          animate={{ x: snapOffset }}
          transition={hasEntered ? springMotion.rebound : { duration: 0 }}
          style={{ willChange: 'transform' }}
          className="flex items-center gap-12 pl-0 cursor-grab active:cursor-grabbing w-max transform-gpu relative z-10 py-4 my-auto"
          {...dragProps}
        >
          {displayPlaylists.map((pl, idx) => {
            const isNear = Math.abs(idx - activeIndex) <= 6;
            if (!isNear) {
              return (
                <div
                  key={pl.id}
                  className="w-[280px] h-[420px] rounded-3xl flex-shrink-0 pointer-events-none opacity-0"
                />
              );
            }
            return (
              <motion.div
                key={pl.id}
                initial={{ y: defaultDropCascadeConfig.dropInitialY, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  ...springMotion.gentle,
                  delay: getItemDelay(idx),
                }}
              >
                <PlaylistCard
                  playlist={pl}
                  isActive={idx === activeIndex}
                  onClick={() => handleCardClick(idx)}
                  index={idx}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* 底部微间距占位以防与播放坞产生视觉重叠 */}
      <div className="h-2 flex-shrink-0" />
    </div>
  );
};

export default CarouselStage;
