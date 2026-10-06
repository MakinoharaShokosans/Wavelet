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
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  isActive,
  onClick,
  onEdit,
  onDelete,
}) => {
  const isDefault = playlist.isDefault;
  const isFolder = playlist.isFolder;
  const isFavorites = playlist.id === 'default_favorites';

  return (
    <motion.div
      layout
      onClick={onClick}
      animate={{
        scale: isActive ? 1.05 : 0.92,
        opacity: isActive ? 1 : 0.7,
      }}
      transition={springMotion.gentle}
      className={`relative w-64 h-80 rounded-3xl bg-white border border-[var(--border-subtle)] p-5 flex flex-col justify-between cursor-pointer select-none transition-shadow duration-300 ${
        isActive
          ? 'shadow-[var(--shadow-hover)] z-10'
          : 'shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-hover)]'
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
              <span>心动收藏</span>
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

      {/* 几何同心圆或封面渲染区 */}
      <div className="w-full flex-1 flex items-center justify-center my-4 overflow-hidden rounded-2xl bg-[var(--bg-subtle)] relative">
        {playlist.coverImagePath ? (
          <img
            src={playlistService.getCoverUrl(playlist.id)}
            alt={playlist.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-24 h-24 rounded-full border border-[var(--border-subtle)] bg-white flex items-center justify-center shadow-[var(--shadow-xs)]">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center text-[var(--text-secondary)]">
              <SvgIcons name={isFolder ? 'folder' : 'music'} size={20} />
            </div>
          </div>
        )}
      </div>

      {/* 底部歌单名称与描述 */}
      <div className="space-y-1">
        <h3 className="font-semibold text-base text-[var(--text-primary)] tracking-tight truncate">
          {playlist.name}
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] truncate">
          {playlist.description || (isFolder ? '分类目录文件夹' : '无损发烧母带精选')}
        </p>
      </div>
    </motion.div>
  );
};

export default PlaylistCard;
