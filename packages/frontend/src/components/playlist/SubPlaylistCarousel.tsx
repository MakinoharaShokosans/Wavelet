import type { Playlist } from '@wavelet/shared';
import { motion } from 'motion/react';
import type React from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from '../carousel/DropCascadeEngine.js';
import PlaylistCard from '../carousel/PlaylistCard.js';
import { SvgIcons } from '../common/SvgIcons.js';

export interface SubPlaylistCarouselProps {
  folder: Playlist;
  onCreateSubPlaylist?: () => void;
  onEditSubPlaylist?: (child: Playlist) => void;
  onDeleteSubPlaylist?: (child: Playlist) => void;
}

export const SubPlaylistCarousel: React.FC<SubPlaylistCarouselProps> = ({
  folder,
  onCreateSubPlaylist,
  onEditSubPlaylist,
  onDeleteSubPlaylist,
}) => {
  const { playlists, selectPlaylist } = useLibraryStore();
  const { pushBreadcrumb } = useUIStore();

  // 筛选属于当前目录的子级歌单与子目录
  const children = playlists.filter((p) => p.parentId === folder.id);
  const totalItems = children.length + (onCreateSubPlaylist ? 1 : 0);

  const {
    containerRef,
    activeIndex,
    setActiveIndex,
    hasEntered,
    handleWheel,
    prev,
    next,
    snapOffset,
    getItemDelay,
  } = useCarouselSnap({ totalItems });

  const handleSelectChild = (child: Playlist) => {
    selectPlaylist(child);
    pushBreadcrumb({ id: child.id, name: child.name, isFolder: Boolean(child.isFolder) });
  };

  const handleChildCardClick = (child: Playlist, idx: number) => {
    if (idx !== activeIndex) {
      setActiveIndex(idx);
    } else {
      handleSelectChild(child);
    }
  };

  const handleCreateCardClick = (idx: number) => {
    setActiveIndex(idx);
    onCreateSubPlaylist?.();
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* 互斥规则徽标提示与滑动操作说明 */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-subtle)] text-[11px] text-[var(--text-secondary)] border border-[var(--border-subtle)] w-max">
          <SvgIcons name="folder" size={14} />
          <span>分类目录文件夹：仅可容纳子歌单或下级分类，禁止挂载单曲</span>
        </div>
        {children.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            滚轮横向滑动切换 · 点击卡片展开内部歌曲与分类
          </p>
        )}
      </div>

      {children.length > 0 ? (
        <div
          ref={containerRef}
          onWheel={handleWheel}
          className="w-full py-8 flex flex-col justify-center overflow-hidden relative select-none"
        >
          {/* 横向吸附轮播轨道 */}
          <motion.div
            animate={{ x: snapOffset }}
            transition={hasEntered ? springMotion.rebound : { duration: 0 }}
            className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max"
          >
            {children.map((child, idx) => (
              <motion.div
                key={child.id}
                initial={{ y: defaultDropCascadeConfig.dropInitialY, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  ...springMotion.gentle,
                  delay: getItemDelay(idx),
                }}
              >
                <PlaylistCard
                  playlist={child}
                  isActive={idx === activeIndex}
                  onClick={() => handleChildCardClick(child, idx)}
                  onEdit={onEditSubPlaylist}
                  onDelete={onDeleteSubPlaylist}
                  index={idx}
                />
              </motion.div>
            ))}

            {onCreateSubPlaylist && (
              <motion.div
                key="create-sub-card"
                initial={{ y: defaultDropCascadeConfig.dropInitialY, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  ...springMotion.gentle,
                  delay: getItemDelay(children.length),
                }}
              >
                <motion.button
                  type="button"
                  onClick={() => handleCreateCardClick(children.length)}
                  animate={{
                    scale: activeIndex === children.length ? 1.05 : 0.92,
                    opacity: activeIndex === children.length ? 1 : 0.7,
                  }}
                  transition={springMotion.gentle}
                  className={`relative w-64 h-80 rounded-3xl border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/50 p-5 flex flex-col items-center justify-center gap-4 cursor-pointer select-none transition-shadow duration-300 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] group flex-shrink-0 ${
                    activeIndex === children.length
                      ? 'shadow-[var(--shadow-hover)] z-10 bg-white/60'
                      : 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-hover)] bg-white/30'
                  }`}
                  title="在此分类目录下新建子歌单或分类"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] group-hover:bg-white group-hover:scale-110 flex items-center justify-center shadow-[var(--shadow-xs)] transition-all">
                    <SvgIcons name="plus" size={24} />
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-sm font-bold block text-[var(--text-primary)]">
                      新建内部歌单
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)] block">
                      在此分类目录下创建
                    </span>
                  </div>
                </motion.button>
              </motion.div>
            )}
          </motion.div>

          {/* 底部翻页控制器 */}
          {totalItems > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={prev}
                disabled={activeIndex === 0}
                className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
                title="上一张"
              >
                <SvgIcons name="chevron-left" size={14} />
              </button>
              <span className="text-xs font-mono text-[var(--text-tertiary)]">
                {activeIndex + 1} / {totalItems}
              </span>
              <button
                type="button"
                onClick={next}
                disabled={activeIndex === totalItems - 1}
                className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
                title="下一张"
              >
                <SvgIcons name="chevron-right" size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-tertiary)] mb-3">
            <SvgIcons name="folder" size={24} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            当前分类目录尚未编入子歌单
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
            可新建下级子歌单或通过左侧管理进行归类编排
          </p>
          {onCreateSubPlaylist && (
            <button
              type="button"
              onClick={onCreateSubPlaylist}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <SvgIcons name="plus" size={14} />
              <span>新建首个子歌单</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SubPlaylistCarousel;
