import type { Track } from '@wavelet/shared';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { trackService } from '../../services/track.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { SvgIcons } from './SvgIcons.js';

export interface TrackEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
}

interface CoverUploadCardProps {
  coverPreview: string | null;
  onPick: () => void;
  onRemove: () => void;
}

const CoverUploadCard: React.FC<CoverUploadCardProps> = ({ coverPreview, onPick, onRemove }) => (
  <div className="flex items-center gap-5 p-3 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
    <button
      type="button"
      onClick={onPick}
      className="w-24 h-24 rounded-2xl bg-white border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] flex items-center justify-center cursor-pointer hover:border-[var(--text-secondary)] transition-all overflow-hidden group relative flex-shrink-0"
      title="点击更换专辑封面"
    >
      {coverPreview ? (
        <img src={coverPreview} alt="Cover Preview" className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-[var(--text-tertiary)]">
          <SvgIcons name="music" size={24} />
          <span className="text-[10px] font-medium">无内嵌封面</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs transition-opacity font-medium">
        修改封面
      </div>
    </button>

    <div className="flex flex-col gap-1.5 min-w-0 flex-1 text-xs">
      <span className="font-bold text-sm text-[var(--text-primary)]">专辑封面图片</span>
      <p className="text-[var(--text-tertiary)] text-[11px] leading-relaxed">
        支持 JPG、PNG、WebP 等格式。修改后将自动同步至播放器卡片及移动端。
      </p>
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onPick}
          className="text-xs font-semibold text-[var(--text-primary)] hover:underline cursor-pointer"
        >
          上传新图片
        </button>
        {coverPreview && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-semibold text-[var(--accent-coral)] hover:underline cursor-pointer"
          >
            移除封面
          </button>
        )}
      </div>
    </div>
  </div>
);

export const TrackEditModal: React.FC<TrackEditModalProps> = ({ isOpen, onClose, track }) => {
  const { updateTrack, resetTrackMetadata, updateTrackCover, removeTrackCover } = useLibraryStore();

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [albumArtist, setAlbumArtist] = useState('');
  const [titleLocked, setTitleLocked] = useState(false);
  const [artistLocked, setArtistLocked] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBase64, setCoverBase64] = useState<string | null>(null);
  const [coverChanged, setCoverChanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !track) return;
    setTitle(track.title || '');
    setArtist(track.artist || '');
    setAlbum(track.album || '');
    setAlbumArtist(track.albumArtist || '');
    setTitleLocked(Boolean(track.titleLocked));
    setArtistLocked(Boolean(track.artistLocked));
    setCoverPreview(track.hasEmbeddedCover ? trackService.getCoverUrl(track.id, Date.now()) : null);
    setCoverBase64(null);
    setCoverChanged(false);
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, track]);

  const handleResetMetadata = async (fields: ('title' | 'artist')[]) => {
    if (!track) return;
    try {
      setIsResetting(true);
      setError(null);
      const updated = await resetTrackMetadata(track.id, fields);
      if (fields.includes('title')) {
        setTitle(updated.title);
        setTitleLocked(false);
      }
      if (fields.includes('artist')) {
        setArtist(updated.artist);
        setArtistLocked(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置元数据失败');
    } finally {
      setIsResetting(false);
    }
  };

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
      setCoverChanged(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveData = async () => {
    if (!track) return;
    await updateTrack(track.id, {
      title: (title || '').trim(),
      artist: (artist || '').trim() || 'Unknown',
      album: (album || '').trim() || 'Unknown',
      albumArtist: (albumArtist || '').trim() || undefined,
    });

    if (coverChanged) {
      if (coverBase64) {
        await updateTrackCover(track.id, coverBase64);
      } else {
        await removeTrackCover(track.id);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!track) return;
    if (!title || !title.trim()) {
      setError('歌曲标题不能为空');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await handleSaveData();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新歌曲元数据失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && track && (
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
            className="bg-white rounded-3xl shadow-[var(--shadow-card)] border border-[var(--border-subtle)] w-full max-w-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏 */}
            <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]">
                  <SvgIcons name="edit" size={16} />
                </div>
                <h2 className="font-bold text-base text-[var(--text-primary)]">
                  编辑歌曲元数据与封面
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

              {/* 封面上传与预览区 */}
              <CoverUploadCard
                coverPreview={coverPreview}
                onPick={() => fileInputRef.current?.click()}
                onRemove={() => {
                  setCoverPreview(null);
                  setCoverBase64(null);
                  setCoverChanged(true);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />

              {/* 标题 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="trk-title-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    歌曲标题 <span className="text-[var(--accent-coral)]">*</span>
                  </label>
                  {titleLocked && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        已手动锁定
                      </span>
                      <button
                        type="button"
                        onClick={() => handleResetMetadata(['title'])}
                        disabled={isResetting}
                        className="text-[10px] text-[var(--accent-coral)] hover:underline cursor-pointer disabled:opacity-50"
                      >
                        恢复为文件名
                      </button>
                    </div>
                  )}
                </div>
                <input
                  id="trk-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="歌曲名称"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 艺术家 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="trk-artist-input"
                      className="block text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      艺术家
                    </label>
                    {artistLocked && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          已手动锁定
                        </span>
                        <button
                          type="button"
                          onClick={() => handleResetMetadata(['artist'])}
                          disabled={isResetting}
                          className="text-[10px] text-[var(--accent-coral)] hover:underline cursor-pointer disabled:opacity-50"
                        >
                          恢复为文件名
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    id="trk-artist-input"
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="例如: 宇多田光"
                    className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors"
                  />
                </div>

                {/* 专辑 */}
                <div>
                  <label
                    htmlFor="trk-album-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    专辑名称
                  </label>
                  <input
                    id="trk-album-input"
                    type="text"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="例如: First Love"
                    className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              {/* 专辑艺术家 */}
              <div>
                <label
                  htmlFor="trk-albumartist-input"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  专辑艺术家 (选填)
                </label>
                <input
                  id="trk-albumartist-input"
                  type="text"
                  value={albumArtist}
                  onChange={(e) => setAlbumArtist(e.target.value)}
                  placeholder="留空则同艺术家"
                  className="w-full px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] focus:bg-white transition-colors"
                />
              </div>

              {/* 底部物理信息摘要 */}
              <div className="p-2.5 rounded-xl bg-[var(--bg-subtle)] text-[11px] text-[var(--text-tertiary)] flex items-center justify-between font-mono">
                <span className="truncate max-w-[280px]" title={track.filePath}>
                  路径: {track.filePath.split('/').pop()}
                </span>
                <span>
                  {Math.round(track.sampleRate / 1000)}kHz / {track.bitDepth}bit
                </span>
              </div>

              {/* 底部操作按钮 */}
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
                  disabled={isSubmitting || !title || !title.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--text-primary)] text-white hover:scale-105 active:scale-95 transition-all shadow-[var(--shadow-xs)] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
                >
                  {isSubmitting ? '保存中...' : '保存更改'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TrackEditModal;
