import type { Playlist, Track } from '@wavelet/shared';
import type React from 'react';
import { useState } from 'react';
import { playlistService } from '../../services/playlist.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { usePlayerStore } from '../../stores/player.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import type { SvgIconName } from '../../types/component.js';
import { AddTracksModal } from '../common/AddTracksModal.js';
import { FloatingCard } from '../common/FloatingCard.js';
import { PlaylistModal } from '../common/PlaylistModal.js';
import { SvgIcons } from '../common/SvgIcons.js';
import SubPlaylistCarousel from './SubPlaylistCarousel.js';
import TrackCarouselView from './TrackCarouselView.js';
import TrackListView from './TrackListView.js';

function getPlaylistTypeBadge(pl: Playlist): string {
  if (pl.isFolder) return '分类目录';
  if (pl.id === 'default_favorites') return '心动收藏';
  if (pl.id === 'default_trash') return '系统回收站';
  if (pl.isDefault) return '核心音库';
  return '自定义歌单';
}

function getPlaylistDescription(pl: Playlist): string {
  if (pl.description) return pl.description;
  if (pl.isFolder) return '纯分类目录文件夹，仅承载下级歌单';
  if (pl.id === 'default_trash') return '包含已删除待清理或恢复的音乐，本地物理文件完好保留';
  return '发烧级母带音轨集';
}

function getPlaylistIconConfig(pl: Playlist): { name: SvgIconName; color: string } {
  if (pl.isFolder) return { name: 'folder', color: 'currentColor' };
  if (pl.id === 'default_favorites') return { name: 'heart-filled', color: 'var(--accent-coral)' };
  if (pl.id === 'default_trash') return { name: 'trash', color: 'var(--text-tertiary)' };
  return { name: 'music', color: 'currentColor' };
}

interface PlaylistInfoBlockProps {
  playlist: Playlist;
  trackCount: number;
  subItemCount?: number;
  tracks?: Track[];
  onCopyFirstTrackCover?: () => void;
}

const PlaylistInfoBlock: React.FC<PlaylistInfoBlockProps> = ({
  playlist,
  trackCount,
  subItemCount,
  tracks,
  onCopyFirstTrackCover,
}) => {
  const iconConfig = getPlaylistIconConfig(playlist);
  const badge = getPlaylistTypeBadge(playlist);
  const description = getPlaylistDescription(playlist);
  const hasCover = Boolean(playlist.coverImagePath);
  const canCopyCover =
    !hasCover &&
    !playlist.isFolder &&
    playlist.id !== 'default_trash' &&
    tracks?.some((t) => t.hasEmbeddedCover);

  return (
    <div className="flex items-center gap-6">
      <div className="w-24 h-24 rounded-3xl bg-white border border-[var(--border-subtle)] shadow-[var(--shadow-card)] flex items-center justify-center text-[var(--text-primary)] overflow-hidden flex-shrink-0">
        {hasCover ? (
          <img
            src={playlistService.getCoverUrl(playlist.id)}
            alt={playlist.name || '歌单封面'}
            className="w-full h-full object-cover"
          />
        ) : (
          <SvgIcons name={iconConfig.name} size={36} color={iconConfig.color} />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            {badge}
          </span>
          {playlist.isFolder ? (
            <span className="text-xs text-[var(--text-tertiary)]">
              {subItemCount ?? 0} 个子歌单
            </span>
          ) : (
            <span className="text-xs text-[var(--text-tertiary)]">{trackCount} 首音乐</span>
          )}
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {playlist.name || '未命名歌单'}
        </h1>
        <p className="text-xs text-[var(--text-tertiary)] max-w-lg">{description}</p>

        {canCopyCover && onCopyFirstTrackCover && (
          <button
            type="button"
            onClick={onCopyFirstTrackCover}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-secondary)] transition-colors cursor-pointer mt-0.5"
            title="将歌单中第一首包含封面的曲目封面拷贝为歌单封面"
          >
            <SvgIcons name="image" size={12} />
            <span>拷贝首曲封面为歌单封面</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface ViewModeToggleProps {
  viewMode: 'list' | 'cards';
  onChange: (mode: 'list' | 'cards') => void;
}

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ viewMode, onChange }) => (
  <div className="flex items-center rounded-xl bg-[var(--bg-subtle)] p-0.5 border border-[var(--border-subtle)] ml-2">
    <FloatingCard
      trigger={
        <button
          type="button"
          onClick={() => onChange('list')}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            viewMode === 'list'
              ? 'bg-white shadow-[var(--shadow-xs)] text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SvgIcons name="list" size={15} />
        </button>
      }
      content="无边框列表模式"
    />

    <FloatingCard
      trigger={
        <button
          type="button"
          onClick={() => onChange('cards')}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            viewMode === 'cards'
              ? 'bg-white shadow-[var(--shadow-xs)] text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SvgIcons name="grid" size={15} />
        </button>
      }
      content="封面卡片轮播模式"
    />
  </div>
);

interface PlaylistActionsProps {
  playlist: Playlist;
  hasTracks: boolean;
  onPlayAll: () => void;
  onShufflePlayAll: () => void;
  onEditPlaylist: () => void;
  onDeletePlaylist: () => void;
  onEmptyTrash: () => void;
  onAddTracks?: () => void;
  onCreateSubPlaylist?: () => void;
  viewMode: 'list' | 'cards';
  onViewModeChange: (mode: 'list' | 'cards') => void;
}

const PlaylistActions: React.FC<PlaylistActionsProps> = ({
  playlist,
  hasTracks,
  onPlayAll,
  onShufflePlayAll,
  onEditPlaylist,
  onDeletePlaylist,
  onEmptyTrash,
  onAddTracks,
  onCreateSubPlaylist,
  viewMode,
  onViewModeChange,
}) => {
  const isTrash = playlist.id === 'default_trash';
  const isCustom = !playlist.isDefault;
  const isFolder = Boolean(playlist.isFolder);

  if (isTrash) {
    return (
      <div className="flex items-center gap-3">
        {hasTracks && (
          <button
            type="button"
            onClick={onEmptyTrash}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-[var(--accent-coral)] border border-red-200 text-xs font-semibold hover:bg-[var(--accent-coral)] hover:text-white transition-all duration-150 cursor-pointer shadow-[var(--shadow-xs)]"
          >
            <SvgIcons name="trash" size={14} />
            <span>清空回收站</span>
          </button>
        )}
        <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />
      </div>
    );
  }

  if (isFolder) {
    return (
      <div className="flex items-center gap-3">
        {onCreateSubPlaylist && (
          <button
            type="button"
            onClick={onCreateSubPlaylist}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <SvgIcons name="plus" size={14} />
            <span>新建内部歌单</span>
          </button>
        )}

        {isCustom && (
          <>
            <button
              type="button"
              onClick={onEditPlaylist}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-semibold hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-[var(--shadow-xs)]"
              title="编辑分类目录信息"
            >
              <SvgIcons name="edit" size={14} />
              <span>编辑目录</span>
            </button>

            <button
              type="button"
              onClick={onDeletePlaylist}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[var(--accent-coral)] border border-[var(--border-subtle)] text-xs font-semibold hover:bg-red-50 transition-all cursor-pointer shadow-[var(--shadow-xs)]"
              title="删除分类目录"
            >
              <SvgIcons name="trash" size={14} />
              <span>删除目录</span>
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {onAddTracks && (
        <button
          type="button"
          onClick={onAddTracks}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-semibold hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-all cursor-pointer shadow-[var(--shadow-xs)]"
          title="从曲库中批量选择添加歌曲"
        >
          <SvgIcons name="plus" size={14} />
          <span>添加歌曲</span>
        </button>
      )}

      {hasTracks && (
        <>
          <button
            type="button"
            onClick={onPlayAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <SvgIcons name="play" size={14} />
            <span>播放全部</span>
          </button>

          <button
            type="button"
            onClick={onShufflePlayAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-semibold shadow-[var(--shadow-xs)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <SvgIcons name="shuffle" size={14} />
            <span>随机播放</span>
          </button>
        </>
      )}

      {isCustom && (
        <>
          <button
            type="button"
            onClick={onEditPlaylist}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-semibold hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-[var(--shadow-xs)]"
            title="编辑歌单信息"
          >
            <SvgIcons name="edit" size={14} />
            <span>编辑</span>
          </button>

          <button
            type="button"
            onClick={onDeletePlaylist}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-[var(--accent-coral)] border border-[var(--border-subtle)] text-xs font-semibold hover:bg-red-50 transition-all cursor-pointer shadow-[var(--shadow-xs)]"
            title="删除歌单"
          >
            <SvgIcons name="trash" size={14} />
            <span>删除</span>
          </button>
        </>
      )}

      {hasTracks && <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />}
    </div>
  );
};

interface TracksRendererProps {
  playlist: Playlist;
  tracks: Track[];
  isLoading: boolean;
  viewMode: 'list' | 'cards';
  onAddTracks?: () => void;
  onCreateSubPlaylist?: () => void;
  onEditSubPlaylist?: (child: Playlist) => void;
  onDeleteSubPlaylist?: (child: Playlist) => void;
}

const TracksRenderer: React.FC<TracksRendererProps> = ({
  playlist,
  tracks,
  isLoading,
  viewMode,
  onAddTracks,
  onCreateSubPlaylist,
  onEditSubPlaylist,
  onDeleteSubPlaylist,
}) => {
  if (playlist.isFolder) {
    return (
      <SubPlaylistCarousel
        folder={playlist}
        onCreateSubPlaylist={onCreateSubPlaylist}
        onEditSubPlaylist={onEditSubPlaylist}
        onDeleteSubPlaylist={onDeleteSubPlaylist}
      />
    );
  }
  if (isLoading && tracks.length === 0) {
    return (
      <div className="w-full flex items-center justify-center py-20 text-xs text-[var(--text-tertiary)]">
        正在载入曲目...
      </div>
    );
  }
  if (tracks.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-20 text-xs text-[var(--text-tertiary)] gap-2">
        <SvgIcons name="music" size={32} />
        <span>{playlist.id === 'default_trash' ? '回收歌单为空' : '该歌单暂无歌曲'}</span>
        {!playlist.isFolder && playlist.id !== 'default_trash' && onAddTracks && (
          <button
            type="button"
            onClick={onAddTracks}
            className="mt-3 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-semibold shadow-[var(--shadow-xs)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <SvgIcons name="plus" size={14} />
            <span>从曲库批量添加歌曲</span>
          </button>
        )}
      </div>
    );
  }
  if (viewMode === 'cards') {
    return <TrackCarouselView tracks={tracks} playlistId={playlist.id} />;
  }
  return <TrackListView tracks={tracks} playlistId={playlist.id} />;
};

export const PlaylistDetailView: React.FC = () => {
  const {
    playlists,
    currentPlaylist,
    currentPlaylistTracks,
    isLoading,
    deletePlaylist,
    emptyTrash,
    copyPlaylistCoverFromTrack,
  } = useLibraryStore();
  const { playlistViewMode, setPlaylistViewMode, navigate, resetBreadcrumbs } = useUIStore();
  const { playTrack, setPlayMode } = usePlayerStore();
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    playlist: Playlist | null;
    defaultParentId?: string;
  }>({
    isOpen: false,
    playlist: null,
  });
  const [isAddTracksOpen, setIsAddTracksOpen] = useState(false);

  if (!currentPlaylist) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">
        请选择一个歌单
      </div>
    );
  }

  const handleOpenCreateSubModal = (folderId: string) => {
    setModalState({
      isOpen: true,
      playlist: null,
      defaultParentId: folderId,
    });
  };

  const handleOpenEditModal = (targetPlaylist: Playlist) => {
    setModalState({
      isOpen: true,
      playlist: targetPlaylist,
    });
  };

  const handleDeletePlaylist = async (targetPlaylist: Playlist) => {
    const isFolder = Boolean(targetPlaylist.isFolder);
    const msg = isFolder
      ? `确定要删除分类目录“${targetPlaylist.name}”及其所有子歌单吗？`
      : `确定要删除歌单“${targetPlaylist.name}”吗？歌单内的歌曲不会被删除。`;

    if (window.confirm(msg)) {
      const isCurrent = currentPlaylist.id === targetPlaylist.id;
      await deletePlaylist(targetPlaylist.id);
      if (isCurrent) {
        resetBreadcrumbs();
        navigate('carousel');
      }
    }
  };

  const handlePlayAll = () => {
    if (currentPlaylistTracks.length > 0) {
      void playTrack(currentPlaylistTracks[0], currentPlaylistTracks, currentPlaylist.name);
    }
  };

  const handleShufflePlayAll = () => {
    if (currentPlaylistTracks.length > 0) {
      void setPlayMode('shuffle');
      const randomIdx = Math.floor(Math.random() * currentPlaylistTracks.length);
      void playTrack(currentPlaylistTracks[randomIdx], currentPlaylistTracks, currentPlaylist.name);
    }
  };

  const handleEmptyTrash = async () => {
    if (
      window.confirm(
        '【高危操作】确定要彻底清空回收歌单吗？回收站内的所有本地母带物理音频文件与元数据记录都将被永久擦除，不可恢复！'
      )
    ) {
      await emptyTrash();
    }
  };

  const displayTrackCount =
    currentPlaylistTracks.length > 0 ? currentPlaylistTracks.length : currentPlaylist.trackCount;
  const subItemCount = playlists.filter((p) => p.parentId === currentPlaylist.id).length;

  return (
    <div className="w-full h-full flex flex-col px-8 pb-32 overflow-y-auto select-none">
      {/* 歌单主头图区 */}
      <div className="flex items-start justify-between mb-8 pt-2">
        <PlaylistInfoBlock
          playlist={currentPlaylist}
          trackCount={displayTrackCount}
          subItemCount={subItemCount}
          tracks={currentPlaylistTracks}
          onCopyFirstTrackCover={() => copyPlaylistCoverFromTrack(currentPlaylist.id)}
        />
        <PlaylistActions
          playlist={currentPlaylist}
          hasTracks={currentPlaylistTracks.length > 0}
          onPlayAll={handlePlayAll}
          onShufflePlayAll={handleShufflePlayAll}
          onEditPlaylist={() => handleOpenEditModal(currentPlaylist)}
          onDeletePlaylist={() => handleDeletePlaylist(currentPlaylist)}
          onEmptyTrash={handleEmptyTrash}
          onAddTracks={() => setIsAddTracksOpen(true)}
          onCreateSubPlaylist={() => handleOpenCreateSubModal(currentPlaylist.id)}
          viewMode={playlistViewMode}
          onViewModeChange={setPlaylistViewMode}
        />
      </div>

      {/* 核心互斥内容分流渲染 */}
      <TracksRenderer
        playlist={currentPlaylist}
        tracks={currentPlaylistTracks}
        isLoading={isLoading}
        viewMode={playlistViewMode}
        onAddTracks={() => setIsAddTracksOpen(true)}
        onCreateSubPlaylist={() => handleOpenCreateSubModal(currentPlaylist.id)}
        onEditSubPlaylist={handleOpenEditModal}
        onDeleteSubPlaylist={handleDeletePlaylist}
      />

      {/* 歌单/分类目录创建与编辑弹窗 */}
      <PlaylistModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, playlist: null })}
        playlist={modalState.playlist}
        defaultParentId={modalState.defaultParentId}
      />

      {/* 批量添加歌曲模态框 */}
      {currentPlaylist && !currentPlaylist.isFolder && (
        <AddTracksModal
          isOpen={isAddTracksOpen}
          onClose={() => setIsAddTracksOpen(false)}
          playlist={currentPlaylist}
          existingTrackIds={currentPlaylistTracks.map((t) => t.id)}
        />
      )}
    </div>
  );
};

export default PlaylistDetailView;
