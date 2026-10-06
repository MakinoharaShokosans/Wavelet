import type { Track } from '@wavelet/shared';
import { motion } from 'motion/react';
import type React from 'react';
import { useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { trackService } from '../../services/track.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { defaultDropCascadeConfig, useCarouselSnap } from '../carousel/DropCascadeEngine.js';
import { SvgIcons } from '../common/SvgIcons.js';
import { TrackEditModal } from '../common/TrackEditModal.js';

function formatTime(sec: number): string {
  const totalSec = Math.floor(sec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface CardActionButtonsProps {
  track: Track;
  isTrashPlaylist: boolean;
  isCustomPlaylist: boolean;
  onToggleFavorite: () => void;
  onAddToQueue: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onRemoveFromPlaylist: () => void;
  onMoveToTrash: () => void;
}

const CardActionButtons: React.FC<CardActionButtonsProps> = ({
  track,
  isTrashPlaylist,
  isCustomPlaylist,
  onToggleFavorite,
  onAddToQueue,
  onEdit,
  onRestore,
  onPurge,
  onRemoveFromPlaylist,
  onMoveToTrash,
}) => {
  return (
    <div className="flex items-center gap-1">
      {!isTrashPlaylist && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            title={track.isFavorite ? '取消心动收藏' : '加入心动收藏'}
          >
            <SvgIcons
              name={track.isFavorite ? 'heart-filled' : 'heart'}
              size={13}
              color={track.isFavorite ? 'var(--accent-coral)' : 'currentColor'}
            />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddToQueue();
            }}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            title="加入播放队列"
          >
            <SvgIcons name="plus" size={13} />
          </button>
        </>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
        title="编辑曲目信息与封面"
      >
        <SvgIcons name="edit" size={12} />
      </button>

      {isTrashPlaylist ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--accent-mint)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            title="恢复歌曲至曲库"
          >
            <SvgIcons name="restore" size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPurge();
            }}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-red-50 text-[var(--accent-coral)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            title="彻底永久删除文件"
          >
            <SvgIcons name="trash" size={13} />
          </button>
        </>
      ) : (
        <>
          {isCustomPlaylist && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromPlaylist();
              }}
              className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
              title="从当前歌单移出"
            >
              <SvgIcons name="close" size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveToTrash();
            }}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] hover:bg-red-50 text-[var(--text-tertiary)] hover:text-[var(--accent-coral)] flex items-center justify-center transition-colors cursor-pointer shadow-[var(--shadow-xs)]"
            title="移入回收歌单"
          >
            <SvgIcons name="trash" size={12} />
          </button>
        </>
      )}
    </div>
  );
};

interface TrackCarouselCardProps {
  track: Track;
  index: number;
  isActive: boolean;
  isCurrent: boolean;
  isPlaying: boolean;
  isTrashPlaylist: boolean;
  isCustomPlaylist: boolean;
  currentPlaylistName?: string;
  hasImageError: boolean;
  onImageError: () => void;
  onClick: () => void;
  onPlayDirectly: () => void;
  onToggleFavorite: () => void;
  onAddToQueue: () => void;
  onEdit: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onRemoveFromPlaylist: () => void;
  onMoveToTrash: () => void;
}

const TrackCarouselCard: React.FC<TrackCarouselCardProps> = ({
  track,
  index,
  isActive,
  isCurrent,
  isPlaying,
  isTrashPlaylist,
  isCustomPlaylist,
  currentPlaylistName,
  hasImageError,
  onImageError,
  onClick,
  onPlayDirectly,
  onToggleFavorite,
  onAddToQueue,
  onEdit,
  onRestore,
  onPurge,
  onRemoveFromPlaylist,
  onMoveToTrash,
}) => {
  const isHiRes = track.sampleRate >= 96000 || track.bitDepth >= 24;

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
      {/* 顶部标签与快捷小岛 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
            #{(index + 1).toString().padStart(2, '0')}
          </span>
          {isHiRes && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--accent-mint)] border border-[var(--border-subtle)]">
              Hi-Res
            </span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              track.healthyStatus === 'healthy' || track.healthyStatus === 'repaired'
                ? 'bg-[var(--accent-mint)]'
                : 'bg-[var(--accent-coral)]'
            }`}
            title={`状态: ${track.healthyStatus}`}
          />
        </div>

        <CardActionButtons
          track={track}
          isTrashPlaylist={isTrashPlaylist}
          isCustomPlaylist={isCustomPlaylist}
          onToggleFavorite={onToggleFavorite}
          onAddToQueue={onAddToQueue}
          onEdit={onEdit}
          onRestore={onRestore}
          onPurge={onPurge}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onMoveToTrash={onMoveToTrash}
        />
      </div>

      {/* 几何黑胶与封面渲染区 */}
      <div className="w-full flex-1 flex items-center justify-center my-3 overflow-hidden rounded-2xl bg-[var(--bg-subtle)] relative group/cover">
        {track.hasEmbeddedCover && !hasImageError ? (
          <img
            src={trackService.getCoverUrl(track.id)}
            alt={track.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={onImageError}
          />
        ) : (
          <div className="w-24 h-24 rounded-full border border-[var(--border-subtle)] bg-white flex items-center justify-center shadow-[var(--shadow-xs)]">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isCurrent && isPlaying
                  ? 'bg-[var(--accent-mint)] text-white animate-spin'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
              }`}
            >
              <SvgIcons name="music" size={20} />
            </div>
          </div>
        )}

        {/* 悬浮播放按钮微标 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlayDirectly();
          }}
          className={`absolute bottom-3 right-3 w-10 h-10 rounded-full shadow-[var(--shadow-card)] flex items-center justify-center transition-all cursor-pointer ${
            isCurrent && isPlaying
              ? 'bg-[var(--accent-mint)] text-white scale-100 opacity-100'
              : 'bg-white text-[var(--text-primary)] hover:scale-110 opacity-90 group-hover/cover:opacity-100'
          }`}
          title={isCurrent && isPlaying ? '暂停' : '立即播放'}
        >
          <SvgIcons name={isCurrent && isPlaying ? 'pause' : 'play'} size={16} />
        </button>
      </div>

      {/* 底部详细信息：歌曲名、歌手专辑、所在歌单与规格 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1">
          <h4 className="font-semibold text-base text-[var(--text-primary)] tracking-tight truncate">
            {track.title}
          </h4>
          <span className="text-xs text-[var(--text-tertiary)] font-mono flex-shrink-0">
            {formatTime(track.duration)}
          </span>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] truncate">
          {track.artist} · {track.album}
        </p>
        <div className="flex items-center justify-between pt-1 text-[10px]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-medium truncate max-w-[130px]">
            <SvgIcons name="music" size={10} />
            <span className="truncate">{currentPlaylistName || '全部音乐'}</span>
          </span>
          <span className="text-[var(--text-tertiary)] font-mono font-medium">
            {Math.round(track.sampleRate / 1000)}k/{track.bitDepth}b{' '}
            {(track.filePath.split('.').pop() || 'AUDIO').toUpperCase()}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export interface TrackCarouselViewProps {
  tracks: Track[];
  playlistId?: string;
}

export const TrackCarouselView: React.FC<TrackCarouselViewProps> = ({ tracks, playlistId }) => {
  const { playTrack, currentTrack, isPlaying, togglePlayPause, addToQueue } = usePlayerStore();
  const {
    currentPlaylist,
    toggleTrackFavorite,
    removeTrackFromPlaylist,
    trashTrack,
    restoreTrack,
    purgeTrack,
  } = useLibraryStore();
  const { navigate } = useUIStore();

  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const effectivePlaylistId = playlistId || currentPlaylist?.id || '';
  const isTrashPlaylist = effectivePlaylistId === 'default_trash';
  const isCustomPlaylist = currentPlaylist && !currentPlaylist.isDefault;

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
  } = useCarouselSnap({ totalItems: tracks.length });

  const handleCardClick = (track: Track, index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index);
    } else {
      void playTrack(track, tracks, currentPlaylist?.name);
      navigate('player-stage');
    }
  };

  const handlePlayDirectly = (track: Track) => {
    if (currentTrack?.id === track.id) {
      void togglePlayPause();
    } else {
      void playTrack(track, tracks, currentPlaylist?.name);
    }
  };

  const handlePurge = (track: Track) => {
    if (
      window.confirm(
        `【高危警告】确定要彻底永久删除歌曲“${track.title}”吗？\n该操作将直接擦除磁盘上的物理音频文件 (${track.filePath})，不可恢复！`
      )
    ) {
      purgeTrack(track.id);
    }
  };

  const handleMoveToTrash = (track: Track) => {
    if (window.confirm(`将歌曲“${track.title}”移入回收歌单？（本地物理文件将完整保留）`)) {
      trashTrack(track.id);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* 顶部轻量引导说明 */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-subtle)] text-[11px] text-[var(--text-secondary)] border border-[var(--border-subtle)] w-max">
          <SvgIcons name="grid" size={13} />
          <span>3D 唱片轮播 · 共 {tracks.length} 首</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          滚轮横向滑动切换 · 点击卡片展开音乐大舞台
        </p>
      </div>

      {/* 3D 轮播主舞台视窗 */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="w-full py-8 flex flex-col justify-center overflow-hidden relative select-none"
      >
        <motion.div
          animate={{ x: snapOffset }}
          transition={hasEntered ? springMotion.rebound : { duration: 0 }}
          className="flex items-center gap-8 pl-0 cursor-grab active:cursor-grabbing w-max"
        >
          {tracks.map((track, idx) => (
            <motion.div
              key={track.id}
              initial={{ y: defaultDropCascadeConfig.dropInitialY, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                ...springMotion.gentle,
                delay: getItemDelay(idx),
              }}
            >
              <TrackCarouselCard
                track={track}
                index={idx}
                isActive={idx === activeIndex}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying}
                isTrashPlaylist={isTrashPlaylist}
                isCustomPlaylist={Boolean(isCustomPlaylist)}
                currentPlaylistName={currentPlaylist?.name}
                hasImageError={Boolean(imageErrors[track.id])}
                onImageError={() =>
                  setImageErrors((prevErrors) => ({ ...prevErrors, [track.id]: true }))
                }
                onClick={() => handleCardClick(track, idx)}
                onPlayDirectly={() => handlePlayDirectly(track)}
                onToggleFavorite={() => toggleTrackFavorite(track.id)}
                onAddToQueue={() => addToQueue([track])}
                onEdit={() => setEditingTrack(track)}
                onRestore={() => restoreTrack(track.id)}
                onPurge={() => handlePurge(track)}
                onRemoveFromPlaylist={() => removeTrackFromPlaylist(effectivePlaylistId, track.id)}
                onMoveToTrash={() => handleMoveToTrash(track)}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* 翻页指示与微控制器 */}
        {tracks.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={prev}
              disabled={activeIndex === 0}
              className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
              title="上一首"
            >
              <SvgIcons name="chevron-left" size={14} />
            </button>
            <span className="text-xs font-mono text-[var(--text-tertiary)]">
              {activeIndex + 1} / {tracks.length}
            </span>
            <button
              type="button"
              onClick={next}
              disabled={activeIndex === tracks.length - 1}
              className="w-8 h-8 rounded-full bg-white border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed shadow-[var(--shadow-xs)] transition-all cursor-pointer"
              title="下一首"
            >
              <SvgIcons name="chevron-right" size={14} />
            </button>
          </div>
        )}
      </div>

      <TrackEditModal
        isOpen={Boolean(editingTrack)}
        onClose={() => setEditingTrack(null)}
        track={editingTrack}
      />
    </div>
  );
};

export default TrackCarouselView;
