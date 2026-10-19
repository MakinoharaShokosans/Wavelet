import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { playlistService } from '../../services/playlist.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from './DropCascadeEngine.js';
import PlaylistCard from './PlaylistCard.js';

export const CarouselStage: React.FC = () => {
  const { playlists, selectPlaylist } = useLibraryStore();
  const { navigate, resetBreadcrumbs, pushBreadcrumb } = useUIStore();

  // 仅展示实际可播放的自定义歌单（排除系统默认全部/未集成/收藏/回收歌单，以及分类文件夹容器）
  const displayPlaylists = playlists.filter((p) => !p.isDefault && !p.isFolder);

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
      className="w-full h-full flex flex-col justify-center overflow-hidden relative select-none"
    >
      {/* 封面自适应环境弥散流体光晕 (Dynamic Ambient Aura) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0">
        <AnimatePresence mode="wait">
          {activeCoverUrl ? (
            <motion.div
              key={activeCoverUrl}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 0.26, scale: 1.15 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="w-[660px] h-[520px] rounded-full blur-[120px] transform-gpu pointer-events-none"
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
              animate={{ opacity: 0.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="w-[500px] h-[400px] rounded-full bg-[var(--text-tertiary)] blur-[110px] transform-gpu pointer-events-none"
            />
          )}
        </AnimatePresence>
      </div>

      {/* 顶部策展微排版 */}
      <div className="text-center mb-8 flex flex-col items-center relative z-10">
        <div className="flex items-center gap-2 mb-1.5 opacity-60">
          <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
          <span className="text-[10px] tracking-[0.28em] font-semibold text-[var(--text-tertiary)] uppercase">
            Master Acoustic Gallery
          </span>
          <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          曲库
        </h2>
      </div>

      {/* 横向吸附轮播轨道 */}
      {displayPlaylists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)] text-xs relative z-10">
          <p>暂无歌单</p>
          <p className="mt-1">点击左侧【+】新建歌单</p>
        </div>
      ) : (
        <motion.div
          animate={{ x: snapOffset }}
          transition={hasEntered ? springMotion.rebound : { duration: 0 }}
          style={{ willChange: 'transform' }}
          className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max transform-gpu relative z-10"
          {...dragProps}
        >
          {displayPlaylists.map((pl, idx) => {
            const isNear = Math.abs(idx - activeIndex) <= 6;
            if (!isNear) {
              return (
                <div
                  key={pl.id}
                  className="w-64 h-80 rounded-3xl flex-shrink-0 pointer-events-none opacity-0"
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
    </div>
  );
};

export default CarouselStage;
