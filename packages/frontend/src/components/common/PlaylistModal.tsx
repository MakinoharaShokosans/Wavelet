import type { Playlist, Track } from '@wavelet/shared';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { playlistService } from '../../services/playlist.service.js';
import { trackService } from '../../services/track.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { SvgIcons } from './SvgIcons.js';

export interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist?: Playlist | null;
  defaultParentId?: string;
}

interface CoverPickerProps {
  coverPreview: string | null;
  onPick: () => void;
  onRemove: () => void;
  candidateTracks?: Track[];
  onCopyFromTrack?: (track: Track) => void;
}

const CoverPicker: React.FC<CoverPickerProps> = ({
  coverPreview,
  onPick,
  onRemove,
  candidateTracks,
  onCopyFromTrack,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onPick}
        className="w-20 h-20 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center cursor-pointer hover:border-[var(--text-tertiary)] transition-colors overflow-hidden group relative flex-shrink-0"
        title="点击更换歌单封面"
      >
        {coverPreview ? (
          <img src={coverPreview} alt="Playlist Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[var(--text-tertiary)]">
            <SvgIcons name="image" size={20} />
            <span className="text-[10px]">上传封面</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity font-medium">
          修改
        </div>
      </button>

      <div className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-[var(--text-primary)]">歌单封面</span>
        <span className="text-[var(--text-tertiary)] text-[11px]">
          支持上传图片、从歌曲拷贝或直接 Ctrl+V 粘贴
        </span>
        {coverPreview && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[var(--accent-coral)] hover:underline text-left mt-0.5 text-[11px] cursor-pointer"
          >
            移除封面
          </button>
        )}
      </div>
    </div>

    {/* 从歌单歌曲一键拷贝封面 */}
    {candidateTracks && candidateTracks.length > 0 && (
      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
        <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
          <SvgIcons name="music" size={12} />
          <span>从歌曲拷贝:</span>
        </span>
        {candidateTracks.slice(0, 3).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onCopyFromTrack?.(t)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title={`拷贝《${t.title}》的专辑封面`}
          >
            <span className="max-w-[80px] truncate">{t.title}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  playlist,
  defaultParentId,
}) => {
  const {
    playlists,
    createPlaylist,
    updatePlaylist,
    updatePlaylistCover,
    copyPlaylistCoverFromTrack,
    removePlaylistCover,
  } = useLibraryStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isFolder, setIsFolder] = useState(false);
  const [parentId, setParentId] = useState<string>('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [sourceTrackId, setSourceTrackId] = useState<string | null>(null);
  const [candidateTracks, setCandidateTracks] = useState<Track[]>([]);
  const [coverChanged, setCoverChanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(playlist);

  const availableFolders = playlists.filter(
    (p) => p.isFolder && (!playlist || p.id !== playlist.id)
  );

  useEffect(() => {
    if (!isOpen) return;
    if (playlist) {
      setName(playlist.name || '');
      setDescription(playlist.description || '');
      setIsFolder(Boolean(playlist.isFolder));
      setParentId(playlist.parentId || '');
      setCoverPreview(
        playlist.coverImagePath && playlist.id ? playlistService.getCoverUrl(playlist.id) : null
      );
      if (playlist.id) {
        playlistService
          .getPlaylistTracks(playlist.id)
          .then((tracks) => setCandidateTracks(tracks.filter((t) => t.hasEmbeddedCover)))
          .catch(() => setCandidateTracks([]));
      } else {
        setCandidateTracks([]);
      }
    } else {
      setName('');
      setDescription('');
      setIsFolder(false);
      setParentId(defaultParentId || '');
      setCoverPreview(null);
      setCandidateTracks([]);
    }
    setCoverBase64(null);
    setSourceTrackId(null);
    setCoverChanged(false);
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, playlist, defaultParentId]);

  // 剪贴板 Ctrl+V 直接粘贴图片
  useEffect(() => {
    if (!isOpen || isFolder) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              setCoverPreview(res);
              setCoverBase64(res);
              setSourceTrackId(null);
              setCoverChanged(true);
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, isFolder]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择有效的图片文件 (JPG, PNG, WebP)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCoverPreview(result);
      setCoverBase64(result);
      setSourceTrackId(null);
      setCoverChanged(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCopyFromTrack = (track: Track) => {
    setCoverPreview(trackService.getCoverUrl(track.id));
    setSourceTrackId(track.id);
    setCoverBase64(null);
    setCoverChanged(true);
  };

  const applyCover = async (targetId: string) => {
    if (!coverChanged) return;
    if (sourceTrackId) {
      await copyPlaylistCoverFromTrack(targetId, sourceTrackId);
    } else if (coverBase64) {
      await updatePlaylistCover(targetId, coverBase64);
    } else if (isEdit) {
      await removePlaylistCover(targetId);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanName = (name || '').trim();
    if (!cleanName) {
      setError('歌单名称不能为空');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      if (isEdit && playlist) {
        await updatePlaylist(playlist.id, {
          name: cleanName,
          description: (description || '').trim() || undefined,
          isFolder,
          parentId: parentId || null,
        });
        await applyCover(playlist.id);
      } else {
        const created = await createPlaylist({
          name: cleanName,
          description: (description || '').trim() || undefined,
          isFolder,
          parentId: parentId || undefined,
        });
        await applyCover(created.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存歌单失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={springMotion.gentle}
            className="bg-white rounded-3xl shadow-[var(--shadow-card)] border border-[var(--border-subtle)] w-full max-w-md overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏 */}
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]">
                  <SvgIcons name={isFolder ? 'folder' : 'list'} size={18} />
                </div>
                <h2 className="font-bold text-base text-[var(--text-primary)]">
                  {isEdit
                    ? isFolder
                      ? '编辑分类目录'
                      : '编辑歌单'
                    : defaultParentId
                      ? '新建内部歌单'
                      : '新建歌单'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <SvgIcons name="close" size={16} />
              </button>
            </div>

            {/* 表单主体 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 text-[var(--accent-coral)] text-xs border border-red-100 flex items-center gap-2">
                  <span className="font-medium">{error}</span>
                </div>
              )}

              {/* 封面设置 */}
              {!isFolder && (
                <>
                  <CoverPicker
                    coverPreview={coverPreview}
                    onPick={() => fileInputRef.current?.click()}
                    onRemove={() => {
                      setCoverPreview(null);
                      setCoverBase64(null);
                      setSourceTrackId(null);
                      setCoverChanged(true);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    candidateTracks={candidateTracks}
                    onCopyFromTrack={handleCopyFromTrack}
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </>
              )}

              {/* 歌单名称 */}
              <div>
                <label
                  htmlFor="pl-name-input"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  歌单名称 <span className="text-[var(--accent-coral)]">*</span>
                </label>
                <input
                  id="pl-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如: 80年代经典母带、雨天咖啡馆"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors"
                />
              </div>

              {/* 歌单描述 */}
              <div>
                <label
                  htmlFor="pl-desc-input"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  简介描述
                </label>
                <textarea
                  id="pl-desc-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="描述歌单的音乐风格、情绪或背景..."
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors resize-none"
                />
              </div>

              {/* 目录文件夹开关与父级分类 */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      分类目录文件夹
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      作为层级目录，仅收纳子歌单，不直接包含歌曲
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isEdit && (playlist?.trackCount ?? 0) > 0}
                    onClick={() => setIsFolder(!isFolder)}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${
                      isFolder ? 'bg-[var(--text-primary)]' : 'bg-[var(--border-subtle)]'
                    } ${isEdit && (playlist?.trackCount ?? 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        isFolder ? 'left-5' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {availableFolders.length > 0 && (
                  <div>
                    <label
                      htmlFor="pl-parent-select"
                      className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                    >
                      父级目录
                    </label>
                    <select
                      id="pl-parent-select"
                      value={parentId}
                      onChange={(e) => setParentId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors cursor-pointer"
                    >
                      <option value="">(根目录 / 无父级)</option>
                      {availableFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 底部按钮栏 */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name || !name.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--text-primary)] text-white hover:scale-105 active:scale-95 transition-all shadow-[var(--shadow-xs)] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
                >
                  {isSubmitting ? '保存中...' : isEdit ? '保存更改' : '立即创建'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlaylistModal;
