import type { Playlist } from '@wavelet/shared';
import { motion } from 'motion/react';
import type React from 'react';
import { useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { playlistService } from '../../services/playlist.service.js';
import { SvgIcons } from '../common/SvgIcons.js';

export interface PlaylistCardProps {
  playlist: Playlist;
  isActive: boolean;
  onClick: () => void;
  index: number;
  onEdit?: (playlist: Playlist) => void;
  onDelete?: (playlist: Playlist) => void;
  onPlay?: (playlist: Playlist) => void;
  isGrid?: boolean;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  isActive,
  onClick,
  onEdit,
  onDelete,
  onPlay,
  isGrid = false,
}) => {
  const isDefault = playlist.isDefault;
  const isFolder = playlist.isFolder;
  const isFavorites = playlist.id === 'default_favorites';

  // 3D 悬停磁吸视差物理计算 (3D Magnetic Tilt)
  const [tilt, setTilt] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isGrid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x, y, active: true });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0, active: false });
  };

  const subtitle =
    playlist.description && playlist.description !== playlist.name ? playlist.description : '';

  return (
    <motion.div
      layout
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={
        isGrid
          ? { scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }
          : {
              scale: isActive ? 1.05 : 0.9,
              opacity: isActive ? 1 : 0.55,
              y: isActive ? -4 : 0,
              filter: isActive ? 'blur(0px)' : 'blur(0.8px)',
            }
      }
      transition={springMotion.gentle}
      className={`group relative w-[280px] h-[384px] flex-shrink-0 rounded-3xl bg-white/95 backdrop-blur-md border border-[var(--border-subtle)] p-4 flex flex-col justify-between cursor-pointer select-none transition-shadow duration-300 ${
        isGrid
          ? 'shadow-[var(--shadow-card)] hover:shadow-xl hover:-translate-y-1'
          : isActive
            ? 'ring-1 ring-black/[0.04] z-20'
            : 'shadow-[var(--shadow-card)] hover:opacity-85 hover:blur-none z-10'
      }`}
      style={{
        transform: tilt.active
          ? `perspective(1000px) rotateY(${tilt.x * 8}deg) rotateX(${-tilt.y * 8}deg)`
          : 'perspective(1000px) rotateY(0deg) rotateX(0deg)',
        transition: tilt.active ? 'transform 0.08s ease-out' : 'transform 0.4s ease-out',
        boxShadow:
          isActive && !isGrid
            ? '0 28px 56px -14px rgba(0, 0, 0, 0.12), 0 10px 20px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
            : '0 4px 16px -2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85)',
      }}
    >
      {/* 3D 悬停表面釉面扫光层 */}
      {tilt.active && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none z-30 transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${(tilt.x + 0.5) * 100}% ${(tilt.y + 0.5) * 100}%, rgba(255,255,255,0.4) 0%, transparent 65%)`,
          }}
        />
      )}

      {/* 顶部标签与指示微标 */}
      <div className="flex items-center justify-between z-10 px-0.5 h-6">
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] flex items-center">
          {isFolder ? (
            <SvgIcons name="folder" size={14} />
          ) : isFavorites ? (
            <span className="text-[var(--accent-coral)]">
              <SvgIcons name="heart-filled" size={14} />
            </span>
          ) : (
            <SvgIcons name="music" size={14} />
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {!isFolder && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] font-medium text-[var(--text-secondary)] flex items-center gap-1.5 shadow-[var(--shadow-xs)]">
              <span>{playlist.trackCount} 首</span>
            </span>
          )}

          {/* 管理操作图标：平时收敛留白，悬停时自然平滑浮现 */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {onEdit && !isDefault && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(playlist);
                }}
                className="w-6 h-6 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
                title={isFolder ? '编辑目录信息' : '编辑歌单信息'}
              >
                <SvgIcons name="edit" size={12} />
              </button>
            )}
            {onDelete && !isDefault && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(playlist);
                }}
                className="w-6 h-6 rounded-lg bg-[var(--bg-subtle)] hover:bg-red-50 text-[var(--text-secondary)] hover:text-[var(--accent-coral)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
                title={isFolder ? '删除分类目录' : '删除歌单'}
              >
                <SvgIcons name="trash" size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 封面与物理黑胶唱片联动区 (绝对严格锁定 248px x 248px 统一正方形) */}
      <div className="relative w-full h-[248px] my-auto flex items-center justify-center shrink-0">
        {/* 实体黑胶唱片 - 激活时优雅探出 68px 并匀速自转 */}
        {!isFolder && (
          <motion.div
            initial={false}
            animate={{
              x: isActive && !isGrid ? 68 : 0,
              opacity: isActive && !isGrid ? 1 : 0,
              scale: isActive && !isGrid ? 1 : 0.88,
            }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 26,
            }}
            className="absolute right-0 top-0 bottom-0 w-[236px] h-[236px] m-auto pointer-events-none z-0 flex items-center justify-center"
          >
            {/* 唱片本体：激活态以真实转盘转速平滑自转 (22s/圈) */}
            <motion.div
              animate={isActive && !isGrid ? { rotate: 360 } : { rotate: 0 }}
              transition={
                isActive && !isGrid
                  ? { repeat: Number.POSITIVE_INFINITY, duration: 22, ease: 'linear' }
                  : { duration: 0.6, ease: 'easeOut' }
              }
              className="w-full h-full rounded-full bg-[#131417] shadow-xl relative flex items-center justify-center border-2 border-[#232428]"
            >
              {/* 黑胶声学同心纹槽 */}
              <div className="absolute inset-3 rounded-full border border-white/[0.08]" />
              <div className="absolute inset-7 rounded-full border border-white/[0.05]" />
              <div className="absolute inset-11 rounded-full border border-white/[0.07]" />
              <div className="absolute inset-15 rounded-full border border-white/[0.05]" />
              <div className="absolute inset-19 rounded-full border border-white/[0.06]" />

              {/* 黑胶盘心微标 */}
              <div className="w-18 h-18 rounded-full overflow-hidden border-2 border-[#2b2c30] shadow-inner relative flex items-center justify-center bg-white">
                {playlist.coverImagePath ? (
                  <img
                    src={playlistService.getCoverUrl(playlist.id)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover scale-125"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--text-primary)] flex items-center justify-center text-white">
                    <SvgIcons name="music" size={14} />
                  </div>
                )}
                {/* 唱机主轴孔与金属衬圈 */}
                <div className="absolute w-3 h-3 rounded-full bg-[#131417] border border-white/40 shadow-inner" />
              </div>

              {/* 唱片径向反光条 */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none opacity-30"
                style={{
                  background:
                    'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.25) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.25) 225deg, transparent 270deg)',
                }}
              />
            </motion.div>
          </motion.div>
        )}

        {/* 唱片封套本体 - 绝对保证 100% 纯正方形 248px x 248px */}
        <div className="w-[248px] h-[248px] rounded-2xl bg-[var(--bg-subtle)] relative z-10 group/cover overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-black/[0.06] shrink-0">
          {playlist.coverImagePath ? (
            <img
              src={playlistService.getCoverUrl(playlist.id)}
              alt={playlist.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] shadow-sm">
                <SvgIcons name={isFolder ? 'folder' : 'music'} size={24} />
              </div>
            </div>
          )}

          {/* 实体黑胶取盘内凹切口 */}
          {!isFolder && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-10 rounded-l-full bg-black/25 backdrop-blur-[2px] border-l border-white/20 shadow-[-2px_0_6px_rgba(0,0,0,0.2)] z-20 pointer-events-none" />
          )}

          {/* 封套内顶边高光发丝线 */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]" />

          {/* 悬停快捷播放按钮 - 晶透磨砂白 */}
          {onPlay && !isFolder && (playlist.trackCount || 0) > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(playlist);
              }}
              className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-white/95 hover:bg-white text-[var(--text-primary)] border border-white/70 shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer z-20 flex items-center justify-center backdrop-blur-md"
              title={`立即播放《${playlist.name}》`}
            >
              <div className="ml-0.5 text-[var(--text-primary)]">
                <SvgIcons name="play" size={16} />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 底部歌单名称与描述 (保持纯净，无冗余文字) */}
      <div className="space-y-0.5 z-10 px-0.5 min-h-[36px] flex flex-col justify-end">
        <h3 className="font-bold text-base text-[var(--text-primary)] tracking-tight truncate group-hover:text-black transition-colors">
          {playlist.name}
        </h3>
        {subtitle ? (
          <p className="text-xs text-[var(--text-tertiary)] truncate font-normal">{subtitle}</p>
        ) : null}
      </div>
    </motion.div>
  );
};

export default PlaylistCard;
