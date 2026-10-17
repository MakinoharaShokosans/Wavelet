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
      : isFolder
      ? '母带子歌单目录'
      : `${playlist.trackCount || 0} 首音轨 · 发烧母带`;

  return (
    <motion.div
      layout
      onClick={onClick}
      animate={
        isGrid
          ? { scale: 1, opacity: 1 }
          : {
              scale: isActive ? 1.05 : 0.92,
              opacity: isActive ? 1 : 0.65,
            }
      }
      transition={springMotion.gentle}
      className={`group relative w-64 h-80 rounded-3xl bg-white border border-[var(--border-subtle)] p-5 flex flex-col justify-between cursor-pointer select-none transition-all duration-300 ${
        isGrid
          ? 'shadow-[var(--shadow-card)] hover:shadow-xl hover:-translate-y-1'
          : isActive
          ? 'shadow-2xl ring-1 ring-black/5 z-10'
          : 'shadow-[var(--shadow-card)] hover:shadow-lg'
      }`}
    >
      {/* 顶部标签与指示微标 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1.5">
          {isFolder ? (
            <>
              <SvgIcons name="folder" size={14} />
              <span>目录分类</span>
            </>
          ) : isFavorites ? (
            <>
              <span className="text-[var(--accent-coral)]">
                <SvgIcons name="heart-filled" size={14} />
              </span>
              <span>收藏</span>
            </>
          ) : (
            <>
              <SvgIcons name="music" size={14} />
              <span>{isDefault ? '系统根歌单' : '独立歌单'}</span>
            </>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {!isFolder && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--bg-subtle)] font-medium text-[var(--text-secondary)]">
              {playlist.trackCount} 首
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

      {/* 几何同心圆或封面渲染区 */}
      <div className="w-full flex-1 flex items-center justify-center my-4 overflow-hidden rounded-2xl bg-[var(--bg-subtle)] relative group/cover">
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

        {/* 悬停快捷播放整单按钮 */}
        {onPlay && !isFolder && (playlist.trackCount || 0) > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(playlist);
            }}
            className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md text-white flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer z-10"
            title={`立即播放《${playlist.name}》`}
          >
            <div className="ml-0.5">
              <SvgIcons name="play" size={16} />
            </div>
          </button>
        )}
      </div>

      {/* 底部歌单名称与描述 */}
      <div className="space-y-1">
        <h3 className="font-semibold text-base text-[var(--text-primary)] tracking-tight truncate group-hover:text-black transition-colors">
          {playlist.name}
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] truncate">
          {subtitle}
        </p>
      </div>
    </motion.div>
  );
};

export default PlaylistCard;

