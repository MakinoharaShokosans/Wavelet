import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { SvgIcons } from '../common/SvgIcons.js';

export const PlayQueueDrawer: React.FC = () => {
  const { isQueueDrawerOpen, setQueueDrawerOpen } = useUIStore();
  const { queue, currentIndex, isPlaying, playTrack, removeFromQueue, clearQueue } =
    usePlayerStore();

  return (
    <AnimatePresence>
      {isQueueDrawerOpen && (
        <>
          {/* 半透明遮罩背板 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQueueDrawerOpen(false)}
            className="fixed inset-0 bg-black/10 backdrop-blur-xs z-50 cursor-pointer"
          />

          {/* 右侧弹性滑出抽屉 */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={springMotion.sidebar}
            className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-[var(--border-subtle)] shadow-[var(--shadow-hover)] z-50 flex flex-col p-6 select-none"
          >
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">播放队列</h3>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  共 {queue.length} 首待播音轨
                </p>
              </div>

              <div className="flex items-center gap-2">
                {queue.length > 0 && (
                  <button
                    type="button"
                    onClick={() => clearQueue()}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-coral)] transition-colors px-2 py-1"
                  >
                    清空
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setQueueDrawerOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors"
                >
                  <SvgIcons name="close" size={16} />
                </button>
              </div>
            </div>

            {/* 队列曲目列表 */}
            <div className="flex-1 overflow-y-auto py-3 space-y-1 scrollbar-none">
              <AnimatePresence initial={false}>
                {queue.map((track, idx) => {
                  const isCurrent = idx === currentIndex;

                  return (
                    <motion.div
                      layout="position"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.18 }}
                      key={`${track.id}-${idx}`}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                        isCurrent
                          ? 'bg-[var(--bg-subtle)] font-medium text-[var(--text-primary)]'
                          : 'hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void playTrack(track, queue)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer text-inherit"
                      >
                        <span className="w-5 text-center text-xs text-[var(--text-tertiary)] font-mono">
                          {isCurrent && isPlaying ? (
                            <span className="text-[var(--accent-mint)] flex justify-center">
                              <SvgIcons name="wave" size={13} />
                            </span>
                          ) : (
                            idx + 1
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{track.title}</p>
                          <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                            {track.artist}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(idx);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--accent-coral)] p-1 transition-opacity cursor-pointer"
                        title="移出队列"
                      >
                        <SvgIcons name="close" size={13} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {queue.length === 0 && (
                <div className="py-20 text-center text-xs text-[var(--text-tertiary)]">
                  播放队列为空
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default PlayQueueDrawer;
