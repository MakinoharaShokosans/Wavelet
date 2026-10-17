import type { Playlist, Track } from '@wavelet/shared';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { trackService } from '../../services/track.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { SvgIcons } from './SvgIcons.js';

export interface AddTracksModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist;
  existingTrackIds?: string[];
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface TrackSelectionItemProps {
  track: Track;
  isAlreadyIn: boolean;
  isChecked: boolean;
  hasImageError: boolean;
  onImageError: (trackId: string) => void;
  onToggle: (trackId: string) => void;
}

const TrackSelectionItem: React.FC<TrackSelectionItemProps> = ({
  track,
  isAlreadyIn,
  isChecked,
  hasImageError,
  onImageError,
  onToggle,
}) => {
  const isHiRes = track.sampleRate >= 96000 || track.bitDepth >= 24;
  const format = (track.filePath.split('.').pop() || 'AUDIO').toUpperCase();

  return (
    <button
      type="button"
      disabled={isAlreadyIn}
      onClick={() => onToggle(track.id)}
      className={`w-full text-left flex items-center justify-between px-3 py-2.5 rounded-2xl transition-colors select-none ${
        isAlreadyIn
          ? 'opacity-50 cursor-not-allowed bg-[var(--bg-subtle)]/30'
          : isChecked
            ? 'bg-blue-50/50 border border-blue-200/60 cursor-pointer'
            : 'hover:bg-[var(--bg-subtle)]/60 border border-transparent cursor-pointer'
      }`}
    >
      {/* 左侧：复选框与封面信息 */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors flex-shrink-0 ${
            isAlreadyIn
              ? 'border-gray-300 bg-gray-100 text-gray-400'
              : isChecked
                ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-white shadow-xs'
                : 'border-[var(--border-subtle)] bg-white'
          }`}
        >
          {(isChecked || isAlreadyIn) && <SvgIcons name="check" size={12} />}
        </div>

        {/* 封面微略图 */}
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center flex-shrink-0">
          {track.hasEmbeddedCover && !hasImageError ? (
            <img
              src={trackService.getCoverUrl(track.id)}
              alt={track.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => onImageError(track.id)}
            />
          ) : (
            <span className="text-[var(--text-tertiary)]">
              <SvgIcons name="music" size={16} />
            </span>
          )}
        </div>

        {/* 标题与艺术家 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-primary)] truncate">
              {track.title}
            </span>
            {isHiRes && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--bg-elevated)] text-[var(--accent-mint)] border border-[var(--border-subtle)] flex-shrink-0">
                Hi-Res
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
            {track.artist} · {track.album}
          </p>
        </div>
      </div>

      {/* 右侧：状态指示、格式与时长 */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        {isAlreadyIn ? (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
            已在歌单
          </span>
        ) : (
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] font-medium">
            {format} · {Math.round(track.sampleRate / 1000)}k/{track.bitDepth}b
          </span>
        )}
        <span className="text-[11px] font-mono text-[var(--text-tertiary)] min-w-[38px] text-right">
          {formatDuration(track.duration)}
        </span>
      </div>
    </button>
  );
};

export const AddTracksModal: React.FC<AddTracksModalProps> = ({
  isOpen,
  onClose,
  playlist,
  existingTrackIds = [],
}) => {
  const { addTracksToPlaylist } = useLibraryStore();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const existingSet = useMemo(() => new Set(existingTrackIds), [existingTrackIds]);

  // 打开弹窗时拉取曲库所有歌曲并重置选中状态
  useEffect(() => {
    if (!isOpen) {
      setSelectedTrackIds(new Set());
      setSearchQuery('');
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    trackService
      .getTracks({ limit: 1000 })
      .then((res) => {
        if (isMounted) {
          setTracks(res.items);
          setIsLoading(false);
        }
      })
      .catch((_err) => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // 搜索关键字多维过滤
  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        t.filePath.toLowerCase().includes(q)
    );
  }, [tracks, searchQuery]);

  // 可供添加的候选曲目（排除已在当前歌单中的）
  const selectableVisibleTracks = useMemo(
    () => filteredTracks.filter((t) => !existingSet.has(t.id)),
    [filteredTracks, existingSet]
  );

  // 全选 / 取消全选逻辑
  const isAllSelectableChecked =
    selectableVisibleTracks.length > 0 &&
    selectableVisibleTracks.every((t) => selectedTrackIds.has(t.id));

  const handleToggleSelectAll = () => {
    const next = new Set(selectedTrackIds);
    if (isAllSelectableChecked) {
      for (const t of selectableVisibleTracks) {
        next.delete(t.id);
      }
    } else {
      for (const t of selectableVisibleTracks) {
        next.add(t.id);
      }
    }
    setSelectedTrackIds(next);
  };

  const handleToggleTrack = (trackId: string) => {
    if (existingSet.has(trackId)) return;
    const next = new Set(selectedTrackIds);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    setSelectedTrackIds(next);
  };

  const handleConfirmAdd = async () => {
    if (selectedTrackIds.size === 0 || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await addTracksToPlaylist(playlist.id, Array.from(selectedTrackIds));
      setIsSubmitting(false);
      onClose();
    } catch (_err) {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="add-tracks-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 select-none"
        >
          <motion.div
            key="add-tracks-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={springMotion.gentle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[var(--border-subtle)] shadow-[var(--shadow-hover)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* 顶栏头部 */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  添加歌曲至「{playlist.name}」
                </h3>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  从曲库中快速搜索并批量勾选想要归纳的音频曲目
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <SvgIcons name="close" size={16} />
              </button>
            </div>

            {/* 搜索栏与批量控制区 */}
            <div className="px-6 py-3.5 bg-[var(--bg-subtle)]/40 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
                  <SvgIcons name="search" size={14} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索歌曲名、歌手、专辑..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)] transition-colors shadow-[var(--shadow-xs)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <SvgIcons name="close" size={12} />
                  </button>
                )}
              </div>

              {selectableVisibleTracks.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-[var(--shadow-xs)] flex-shrink-0"
                >
                  {isAllSelectableChecked ? '取消全选' : '全选候选'}
                </button>
              )}
            </div>

            {/* 歌曲列表渲染区 */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1">
              {isLoading ? (
                <div className="py-24 flex items-center justify-center text-xs text-[var(--text-tertiary)]">
                  正在读取曲库全部曲目...
                </div>
              ) : filteredTracks.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center text-xs text-[var(--text-tertiary)] gap-2">
                  <SvgIcons name="search" size={24} />
                  <span>未检索到匹配的曲目</span>
                </div>
              ) : (
                filteredTracks.map((track) => (
                  <TrackSelectionItem
                    key={track.id}
                    track={track}
                    isAlreadyIn={existingSet.has(track.id)}
                    isChecked={selectedTrackIds.has(track.id)}
                    hasImageError={!!imageErrors[track.id]}
                    onImageError={(trackId) =>
                      setImageErrors((prev) => ({ ...prev, [trackId]: true }))
                    }
                    onToggle={handleToggleTrack}
                  />
                ))
              )}
            </div>

            {/* 底部确认栏 */}
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 flex items-center justify-between">
              <div className="text-xs text-[var(--text-secondary)]">
                {selectedTrackIds.size > 0 ? (
                  <span>
                    已选中{' '}
                    <strong className="text-[var(--text-primary)] font-bold">
                      {selectedTrackIds.size}
                    </strong>{' '}
                    首新曲目
                  </span>
                ) : (
                  <span className="text-[var(--text-tertiary)]">请勾选要加入的歌曲</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  disabled={selectedTrackIds.size === 0 || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all cursor-pointer"
                >
                  {isSubmitting ? '添加中...' : `确认添加 (${selectedTrackIds.size})`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddTracksModal;
