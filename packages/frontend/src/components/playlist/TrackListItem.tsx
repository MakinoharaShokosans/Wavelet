import type { Track } from '@wavelet/shared';
import type React from 'react';
import { useState } from 'react';
import { useLibraryStore } from '../../stores/library.store.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { FloatingCard } from '../common/FloatingCard.js';
import { SvgIcons } from '../common/SvgIcons.js';
import { TrackEditModal } from '../common/TrackEditModal.js';

export interface TrackListItemProps {
  track: Track;
  index: number;
  playlistId: string;
  allTracks: Track[];
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const TrackListItem: React.FC<TrackListItemProps> = ({
  track,
  index,
  playlistId,
  allTracks,
}) => {
  const { playTrack, currentTrack, isPlaying, addToQueue } = usePlayerStore();
  const {
    currentPlaylist,
    toggleTrackFavorite,
    removeTrackFromPlaylist,
    trashTrack,
    restoreTrack,
    purgeTrack,
  } = useLibraryStore();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isCurrent = currentTrack?.id === track.id;
  const isHiRes = track.sampleRate >= 96000 || track.bitDepth >= 24;
  const isTrashPlaylist = playlistId === 'default_trash';
  const isCustomPlaylist = currentPlaylist && !currentPlaylist.isDefault;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void playTrack(track, allTracks, currentPlaylist?.name);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackFavorite(track.id);
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue([track]);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const handleRemoveFromPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeTrackFromPlaylist(playlistId, track.id);
  };

  const handleMoveToTrash = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`将歌曲“${track.title}”移入回收歌单？（本地物理文件将完整保留）`)) {
      trashTrack(track.id);
    }
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    restoreTrack(track.id);
  };

  const handlePurge = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      window.confirm(
        `【高危警告】确定要彻底永久删除歌曲“${track.title}”吗？\n该操作将直接擦除磁盘上的物理音频文件 (${track.filePath})，不可恢复！`
      )
    ) {
      purgeTrack(track.id);
    }
  };

  return (
    <>
      <div
        className={`group relative flex items-center justify-between px-4 py-3 rounded-2xl select-none transition-all duration-150 ${
          isCurrent
            ? 'bg-white shadow-[var(--shadow-card)] font-medium text-[var(--text-primary)]'
            : 'hover:bg-white hover:shadow-[var(--shadow-xs)] text-[var(--text-secondary)]'
        }`}
      >
        {/* 左侧：序号与标题艺术家 (可点击播放) */}
        <button
          type="button"
          onClick={handlePlayClick}
          className="flex items-center gap-4 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer text-inherit"
        >
          <span className="w-6 text-center text-xs text-[var(--text-tertiary)] font-mono">
            {isCurrent && isPlaying ? (
              <span className="text-[var(--accent-mint)] animate-pulse flex justify-center">
                <SvgIcons name="wave" size={14} />
              </span>
            ) : (
              (index + 1).toString().padStart(2, '0')
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold truncate text-[var(--text-primary)]">
                {track.title}
              </span>
              {isHiRes && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--bg-elevated)] text-[var(--accent-mint)] border border-[var(--border-subtle)]">
                  {Math.round(track.sampleRate / 1000)}k/{track.bitDepth}b
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
              {track.artist} · {track.album}
            </p>
          </div>
        </button>

        {/* 右侧悬浮交互小岛 (常态隐藏，Hover 平滑浮出) */}
        <div className="flex items-center gap-3">
          <div className="hidden group-hover:flex items-center gap-1.5 transition-all">
            {/* 非回收站状态下的标准按钮 */}
            {!isTrashPlaylist && (
              <>
                <FloatingCard
                  trigger={
                    <button
                      type="button"
                      onClick={handleFavoriteClick}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                    >
                      <SvgIcons
                        name={track.isFavorite ? 'heart-filled' : 'heart'}
                        size={15}
                        color={track.isFavorite ? 'var(--accent-coral)' : 'currentColor'}
                      />
                    </button>
                  }
                  content={track.isFavorite ? '取消心动收藏' : '加入心动收藏'}
                />

                <FloatingCard
                  trigger={
                    <button
                      type="button"
                      onClick={handleAddToQueue}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)] cursor-pointer"
                    >
                      <SvgIcons name="plus" size={15} />
                    </button>
                  }
                  content="加入播放队列"
                />
              </>
            )}

            {/* 编辑元数据与封面 */}
            <FloatingCard
              trigger={
                <button
                  type="button"
                  onClick={handleEditClick}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)] cursor-pointer"
                >
                  <SvgIcons name="edit" size={14} />
                </button>
              }
              content="编辑元数据与封面"
            />

            {/* 场景自适应删除/移除/恢复按钮 */}
            {isTrashPlaylist ? (
              <>
                <FloatingCard
                  trigger={
                    <button
                      type="button"
                      onClick={handleRestore}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors text-[var(--accent-mint)] cursor-pointer"
                    >
                      <SvgIcons name="restore" size={15} />
                    </button>
                  }
                  content="恢复歌曲至曲库"
                />

                <FloatingCard
                  trigger={
                    <button
                      type="button"
                      onClick={handlePurge}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-[var(--accent-coral)] cursor-pointer"
                    >
                      <SvgIcons name="trash" size={15} />
                    </button>
                  }
                  content="彻底永久删除文件"
                />
              </>
            ) : (
              <>
                {isCustomPlaylist && (
                  <FloatingCard
                    trigger={
                      <button
                        type="button"
                        onClick={handleRemoveFromPlaylist}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <SvgIcons name="close" size={14} />
                      </button>
                    }
                    content="从当前歌单中移出"
                  />
                )}

                <FloatingCard
                  trigger={
                    <button
                      type="button"
                      onClick={handleMoveToTrash}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-[var(--text-tertiary)] hover:text-[var(--accent-coral)] cursor-pointer"
                    >
                      <SvgIcons name="trash" size={14} />
                    </button>
                  }
                  content="移入回收歌单"
                />
              </>
            )}
          </div>

          {/* 时长与健康度微指示 */}
          <span className="text-xs text-[var(--text-tertiary)] font-mono min-w-[42px] text-right">
            {formatDuration(track.duration)}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              track.healthyStatus === 'healthy' || track.healthyStatus === 'repaired'
                ? 'bg-[var(--accent-mint)]'
                : 'bg-[var(--accent-coral)]'
            }`}
            title={`状态: ${track.healthyStatus}`}
          />
        </div>
      </div>

      <TrackEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        track={track}
      />
    </>
  );
};

export default TrackListItem;
