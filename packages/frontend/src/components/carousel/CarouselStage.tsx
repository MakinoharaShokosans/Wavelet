import { motion } from 'motion/react';
import type React from 'react';
import { springMotion } from '../../assets/styles/motion.js';
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
  } = useCarouselSnap({ totalItems: displayPlaylists.length });

  const handleCardClick = (index: number) => {
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
      {/* 顶部轻量引导说明 */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">音律大厅</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          滚轮横向滑动切换 · 点击卡片展开内部歌曲与分类
        </p>
      </div>

      {/* 横向吸附轮播轨道 */}
      {displayPlaylists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)] text-xs">
          <p>暂无自定义歌单</p>
          <p className="mt-1">可在左侧边栏“分类与收藏”点击【+】创建您的专属歌单</p>
        </div>
      ) : (
        <motion.div
          animate={{ x: snapOffset }}
          transition={hasEntered ? springMotion.rebound : { duration: 0 }}
          className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max"
        >
          {displayPlaylists.map((pl, idx) => (
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
      )}
    </div>
  );
};

export default CarouselStage;
