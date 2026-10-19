import type { Playlist } from '@wavelet/shared';
import { motion } from 'motion/react';
import type React from 'react';
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

  const subtitle =
    playlist.description && playlist.description !== playlist.name
      ? playlist.description
      : '';

  return (
    <motion.div
      layout
      onClick={onClick}
      animate={
        isGrid
          ? { scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }
          : {
              scale: isActive ? 1.05 : 0.90,
              opacity: isActive ? 1 : 0.55,
              y: isActive ? -4 : 0,
              filter: isActive ? 'blur(0px)' : 'blur(0.8px)',
            }
      }
      transition={springMotion.gentle}
      className={`group relative w-64 h-84 rounded-3xl bg-white/95 backdrop-blur-md border border-[var(--border-subtle)] p-5 flex flex-col justify-between cursor-pointer select-none transition-shadow duration-300 ${
        isGrid
          ? 'shadow-[var(--shadow-card)] hover:shadow-xl hover:-translate-y-1'
          : isActive
          ? 'ring-1 ring-black/[0.04] z-20'
          : 'shadow-[var(--shadow-card)] hover:opacity-85 hover:blur-none z-10'
      }`}
      style={{
        boxShadow:
          isActive && !isGrid
            ? '0 28px 56px -14px rgba(0, 0, 0, 0.12), 0 10px 20px -6px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.95)'
            : '0 4px 16px -2px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
      }}
    >
      {/* 顶部标签与指示微标 */}
      <div className="flex items-center justify-between z-10">
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
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-mint)]" />
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

      {/* 封面与物理黑胶唱片联动区 */}
      <div className="w-full flex-1 my-3 relative flex items-center justify-center">
        {/* 实体黑胶唱片 (Vinyl Record) - 仅在非目录歌单且处于轮播聚焦时优雅探出 */}
        {!isFolder && (
          <motion.div
            initial={false}
            animate={{
              x: isActive && !isGrid ? 30 : 0,
              rotate: isActive && !isGrid ? 25 : 0,
              opacity: isActive && !isGrid ? 1 : 0,
              scale: isActive && !isGrid ? 1 : 0.85,
            }}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 28,
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-[#141517] shadow-xl pointer-events-none z-0 flex items-center justify-center border-2 border-[#26272b]"
          >
            {/* 黑胶声学同心纹槽 (Concentric Grooves) */}
            <div className="absolute inset-2.5 rounded-full border border-white/[0.07]" />
            <div className="absolute inset-5 rounded-full border border-white/[0.05]" />
            <div className="absolute inset-8 rounded-full border border-white/[0.06]" />
            <div className="absolute inset-11 rounded-full border border-white/[0.05]" />

            {/* 黑胶盘心微标 (Center Label) */}
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#2b2c30] shadow-inner relative flex items-center justify-center bg-white">
              {playlist.coverImagePath ? (
                <img
                  src={playlistService.getCoverUrl(playlist.id)}
                  alt=""
                  className="w-full h-full object-cover scale-125"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-[var(--text-primary)] flex items-center justify-center text-white">
                  <SvgIcons name="music" size={12} />
                </div>
              )}
              {/* 唱机主轴孔 */}
              <div className="absolute w-2 h-2 rounded-full bg-[#141517] border border-white/20 shadow-inner" />
            </div>

            {/* 唱片径向反光条 (Radial Specular Reflection) */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none opacity-25"
              style={{
                background:
                  'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.25) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.25) 225deg, transparent 270deg)',
              }}
            />
          </motion.div>
        )}

        {/* 唱片封套本体 (Cover Jacket) */}
        <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-2xl bg-[var(--bg-subtle)] relative z-10 group/cover shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-black/[0.04]">
          {playlist.coverImagePath ? (
            <img
              src={playlistService.getCoverUrl(playlist.id)}
              alt={playlist.name}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border border-[var(--border-subtle)] bg-white flex items-center justify-center shadow-[var(--shadow-xs)] transition-transform duration-300 group-hover:scale-105">
              <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
                <SvgIcons name={isFolder ? 'folder' : 'music'} size={20} />
              </div>
            </div>
          )}

          {/* 封套内高光发丝线 (Inner Top Hairline) */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-inset ring-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" />

          {/* 悬停快捷播放整单按钮 - 晶透磨砂白 */}
          {onPlay && !isFolder && (playlist.trackCount || 0) > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(playlist);
              }}
              className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-white/95 hover:bg-white text-[var(--text-primary)] border border-white/60 shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer z-20 flex items-center justify-center backdrop-blur-md"
              title={`立即播放《${playlist.name}》`}
            >
              <div className="ml-0.5 text-[var(--text-primary)]">
                <SvgIcons name="play" size={16} />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* 底部歌单名称与描述 */}
      <div className="space-y-0.5 z-10">
        <h3 className="font-bold text-base text-[var(--text-primary)] tracking-tight truncate group-hover:text-black transition-colors">
          {playlist.name}
        </h3>
        {subtitle ? (
          <p className="text-xs text-[var(--text-tertiary)] truncate font-normal">
            {subtitle}
          </p>
        ) : (
          <p className="text-[10px] text-[var(--text-tertiary)]/70 uppercase tracking-widest font-mono">
            Master Acoustic
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default PlaylistCard;

