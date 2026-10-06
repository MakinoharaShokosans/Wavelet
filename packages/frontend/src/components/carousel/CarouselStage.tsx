import { motion } from 'motion/react';
import type React from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from './DropCascadeEngine.js';
import PlaylistCard from './PlaylistCard.js';

export const CarouselStage: React.FC = () => {
  const { playlists, selectPlaylist } = useLibraryStore();
  const { navigate, pushBreadcrumb } = useUIStore();

  // 仅在一级展示根歌单（没有 parentId 的歌单）
  const rootPlaylists = playlists.filter((p) => !p.parentId);

  const {
    containerRef,
    activeIndex,
    setActiveIndex,
    hasEntered,
    handleWheel,
    snapOffset,
    getItemDelay,
  } = useCarouselSnap({ totalItems: rootPlaylists.length });

  const handleCardClick = (index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index);
    } else {
      const target = rootPlaylists[index];
      selectPlaylist(target);
      pushBreadcrumb({ id: target.id, name: target.name, isFolder: Boolean(target.isFolder) });
      navigate('playlist-detail');
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="w-full h-full flex flex-col justify-center overflow-hidden relative select-none"
    >
      {/* 顶部轻量引导说明 */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">音律大厅</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          滚轮横向滑动切换 · 点击卡片展开内部歌曲与分类
        </p>
      </div>

      {/* 横向吸附轮播轨道 */}
      <motion.div
        animate={{ x: snapOffset }}
        transition={hasEntered ? springMotion.rebound : { duration: 0 }}
        className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max"
      >
        {rootPlaylists.map((pl, idx) => (
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
        ))}
      </motion.div>
    </div>
  );
};

export default CarouselStage;
