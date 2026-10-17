import type { Playlist } from '@wavelet/shared';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from '../carousel/DropCascadeEngine.js';
import PlaylistCard from '../carousel/PlaylistCard.js';
import FloatingCard from '../common/FloatingCard.js';
import { SvgIcons } from '../common/SvgIcons.js';

export interface SubPlaylistCarouselProps {
  folder: Playlist;
  onCreateSubPlaylist?: () => void;
  onEditSubPlaylist?: (child: Playlist) => void;
  onDeleteSubPlaylist?: (child: Playlist) => void;
  onPlaySubPlaylist?: (child: Playlist) => void;
}

export const SubPlaylistCarousel: React.FC<SubPlaylistCarouselProps> = ({
  folder,
  onCreateSubPlaylist,
  onEditSubPlaylist,
  onDeleteSubPlaylist,
  onPlaySubPlaylist,
}) => {
  const { playlists, selectPlaylist } = useLibraryStore();
  const { pushBreadcrumb } = useUIStore();
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');

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
    dragProps,
    isDraggingRef,
  } = useCarouselSnap({ totalItems });

  const handleSelectChild = (child: Playlist) => {
    selectPlaylist(child);
    pushBreadcrumb({ id: child.id, name: child.name, isFolder: Boolean(child.isFolder) });
  };

  const handleChildCardClick = (child: Playlist, idx: number) => {
    if (isDraggingRef.current) return;
    if (idx !== activeIndex) {
      setActiveIndex(idx);
    } else {
      handleSelectChild(child);
    }
  };

  const handleCreateCardClick = (idx: number) => {
    if (isDraggingRef.current) return;
    setActiveIndex(idx);
    onCreateSubPlaylist?.();
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* 视图切换工具栏 */}
      {children.length > 0 && (
        <div className="flex items-center justify-end px-1 pt-1 pb-1">
          <div className="flex items-center rounded-xl bg-[var(--bg-subtle)] p-0.5 border border-[var(--border-subtle)]">
            <FloatingCard
              trigger={
                <button
                  type="button"
                  onClick={() => setViewMode('carousel')}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'carousel'
                      ? 'bg-white shadow-[var(--shadow-xs)] text-[var(--text-primary)] font-bold'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <SvgIcons name="music" size={14} />
                </button>
              }
              content="轮播"
            />
            <FloatingCard
              trigger={
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white shadow-[var(--shadow-xs)] text-[var(--text-primary)] font-bold'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <SvgIcons name="grid" size={14} />
                </button>
              }
              content="网格"
            />
          </div>
        </div>
      )}

      {children.length > 0 ? (
        <AnimatePresence mode="wait">
          {viewMode === 'carousel' ? (
            <motion.div
              key="carousel-mode"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              ref={containerRef}
              onWheel={handleWheel}
              className="w-full py-8 flex flex-col justify-center overflow-hidden relative select-none"
            >
              {/* 横向吸附轮播轨道 */}
              <motion.div
                animate={{ x: snapOffset }}
                transition={hasEntered ? springMotion.rebound : { duration: 0 }}
                style={{ willChange: 'transform' }}
                className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max transform-gpu"
                {...dragProps}
              >
                {children.map((child, idx) => {
                  const isNear = Math.abs(idx - activeIndex) <= 6;
                  if (!isNear) {
                    return (
                      <div
                        key={child.id}
                        className="w-64 h-80 rounded-3xl flex-shrink-0 pointer-events-none opacity-0"
                      />
                    );
                  }
                  return (
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
                        onPlay={onPlaySubPlaylist}
                        index={idx}
                      />
                    </motion.div>
                  );
                })}

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
                        opacity: activeIndex === children.length ? 1 : 0.65,
                      }}
                      transition={springMotion.gentle}
                      className={`relative w-64 h-80 rounded-3xl border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/50 p-5 flex flex-col items-center justify-center gap-4 cursor-pointer select-none transition-shadow duration-300 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] group flex-shrink-0 ${
                        activeIndex === children.length
                          ? 'shadow-2xl z-10 bg-white/70'
                          : 'shadow-[var(--shadow-card)] hover:shadow-lg bg-white/30'
                      }`}
                      title="在此分类目录下新建子歌单或分类"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] group-hover:bg-white group-hover:scale-110 flex items-center justify-center shadow-[var(--shadow-xs)] transition-all">
                        <SvgIcons name="plus" size={24} />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-semibold block text-[var(--text-primary)]">
                          新建歌单
                        </span>
                      </div>
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>

              {/* 底部 iOS 级交互式胶囊指示器 */}
              {totalItems > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    type="button"
                    onClick={prev}
                    disabled={activeIndex === 0}
                    className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-20 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
                    title="上一张"
                  >
                    <SvgIcons name="chevron-left" size={14} />
                  </button>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    {Array.from({ length: totalItems }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={`transition-all duration-300 rounded-full cursor-pointer ${
                          idx === activeIndex
                            ? 'w-5 h-1.5 bg-[var(--text-primary)]'
                            : 'w-1.5 h-1.5 bg-[var(--border-subtle)] hover:bg-[var(--text-tertiary)]'
                        }`}
                        title={`跳转至第 ${idx + 1} 张`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={next}
                    disabled={activeIndex === totalItems - 1}
                    className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-20 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
                    title="下一张"
                  >
                    <SvgIcons name="chevron-right" size={14} />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="grid-mode"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 justify-items-center"
            >
              {children.map((child, idx) => (
                <PlaylistCard
                  key={child.id}
                  playlist={child}
                  isActive={false}
                  isGrid={true}
                  onClick={() => handleSelectChild(child)}
                  onEdit={onEditSubPlaylist}
                  onDelete={onDeleteSubPlaylist}
                  onPlay={onPlaySubPlaylist}
                  index={idx}
                />
              ))}

              {onCreateSubPlaylist && (
                <button
                  type="button"
                  onClick={onCreateSubPlaylist}
                  className="relative w-64 h-80 rounded-3xl border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/50 p-5 flex flex-col items-center justify-center gap-4 cursor-pointer select-none transition-all duration-300 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] group shadow-[var(--shadow-card)] hover:shadow-lg bg-white/40"
                  title="在此分类目录下新建子歌单或分类"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] group-hover:bg-white group-hover:scale-110 flex items-center justify-center shadow-[var(--shadow-xs)] transition-all">
                    <SvgIcons name="plus" size={24} />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold block text-[var(--text-primary)]">
                      新建歌单
                    </span>
                  </div>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="py-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-tertiary)] mb-3">
            <SvgIcons name="folder" size={24} />
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            暂无歌单
          </p>
          {onCreateSubPlaylist && (
            <button
              type="button"
              onClick={onCreateSubPlaylist}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <SvgIcons name="plus" size={14} />
              <span>新建歌单</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SubPlaylistCarousel;
