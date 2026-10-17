import type { Playlist } from '@wavelet/shared';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import type { SvgIconName } from '../../types/component.js';
import { FloatingCard } from '../common/FloatingCard.js';
import { PlaylistModal } from '../common/PlaylistModal.js';
import { SvgIcons } from '../common/SvgIcons.js';
import { playlistService } from '../../services/playlist.service.js';

function getDefaultPlaylistIcon(plId: string): { name: SvgIconName; color: string } {
  if (plId === 'default_favorites') return { name: 'heart-filled', color: 'var(--accent-coral)' };
  if (plId === 'default_unintegrated_tracks') return { name: 'wave', color: 'currentColor' };
  if (plId === 'default_trash') return { name: 'trash', color: 'var(--text-tertiary)' };
  return { name: 'music', color: 'currentColor' };
}

interface SidebarTreeNodeProps {
  playlist: Playlist;
  allPlaylists: Playlist[];
  currentPlaylistId: string | null;
  expandedFolders: Record<string, boolean>;
  isSidebarCollapsed: boolean;
  depth: number;
  onToggleFolder: (id: string) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
}

const SidebarTreeNode: React.FC<SidebarTreeNodeProps> = ({
  playlist,
  allPlaylists,
  currentPlaylistId,
  expandedFolders,
  isSidebarCollapsed,
  depth,
  onToggleFolder,
  onSelectPlaylist,
}) => {
  const [coverError, setCoverError] = useState(false);
  const children = allPlaylists.filter((p) => p.parentId === playlist.id);
  const isExpanded = Boolean(expandedFolders[playlist.id]);
  const isSelected = currentPlaylistId === playlist.id;

  useEffect(() => {
    setCoverError(false);
  }, [playlist.coverImagePath]);

  if (isSidebarCollapsed) {
    return (
      <button
        type="button"
        key={playlist.id}
        onClick={() => onSelectPlaylist(playlist)}
        className={`w-full text-left flex items-center justify-center p-2 rounded-xl cursor-pointer transition-all duration-150 ${
          isSelected
            ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
        }`}
      >
        <FloatingCard
          trigger={
            playlist.coverImagePath && !coverError ? (
              <img
                src={playlistService.getCoverUrl(playlist.id)}
                alt=""
                onError={() => setCoverError(true)}
                className="w-5 h-5 rounded-[4px] object-cover flex-shrink-0 border border-[var(--border-subtle)]/60 shadow-[var(--shadow-xs)]"
              />
            ) : (
              <SvgIcons name="music" size={18} />
            )
          }
          content={`${playlist.name} ${playlist.isFolder ? `(${children.length} 个子项)` : `(${playlist.trackCount})`}`}
          placement="right"
        />
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className={`group/item w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all duration-150 ${
          isSelected
            ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {playlist.isFolder ? (
          <button
            type="button"
            onClick={() => onToggleFolder(playlist.id)}
            className={`w-4 h-4 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mr-1.5 flex-shrink-0 ${
              children.length === 0 ? 'invisible pointer-events-none' : ''
            }`}
            title={isExpanded ? '收起分类目录' : '展开分类目录'}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <SvgIcons name="chevron-right" size={11} />
            </motion.span>
          </button>
        ) : (
          <span className="w-4 mr-1.5 flex-shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelectPlaylist(playlist)}
          className="flex items-center justify-between min-w-0 flex-1 text-left cursor-pointer bg-transparent border-0 p-0 focus:outline-hidden"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {playlist.coverImagePath && !coverError ? (
              <img
                src={playlistService.getCoverUrl(playlist.id)}
                alt=""
                onError={() => setCoverError(true)}
                className="w-[18px] h-[18px] rounded-[4px] object-cover flex-shrink-0 border border-[var(--border-subtle)]/60 shadow-[var(--shadow-xs)]"
              />
            ) : (
              <span className="flex-shrink-0 text-[var(--text-secondary)] group-hover/item:text-[var(--text-primary)]">
                <SvgIcons name="music" size={15} />
              </span>
            )}
            <span className="text-sm font-medium truncate flex-1">{playlist.name}</span>
          </div>

          {!playlist.isFolder ? (
            <span className="text-xs text-[var(--text-tertiary)] ml-1 flex-shrink-0">
              {playlist.trackCount}
            </span>
          ) : children.length > 0 ? (
            <span className="text-[10px] text-[var(--text-tertiary)] ml-1 flex-shrink-0 px-1.5 py-0.2 rounded-full bg-[var(--bg-subtle)]">
              {children.length}
            </span>
          ) : null}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {playlist.isFolder && isExpanded && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden space-y-0.5 mt-0.5"
          >
            {children.map((child) => (
              <SidebarTreeNode
                key={child.id}
                playlist={child}
                allPlaylists={allPlaylists}
                currentPlaylistId={currentPlaylistId}
                expandedFolders={expandedFolders}
                isSidebarCollapsed={isSidebarCollapsed}
                depth={depth + 1}
                onToggleFolder={onToggleFolder}
                onSelectPlaylist={onSelectPlaylist}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const {
    isSidebarCollapsed,
    toggleSidebar,
    navigate,
    resetBreadcrumbs,
    pushBreadcrumb,
    setBackupModalOpen,
  } = useUIStore();
  const { playlists, currentPlaylist, selectPlaylist } = useLibraryStore();
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const handleHomeClick = () => {
    resetBreadcrumbs();
    selectPlaylist(null);
    navigate('carousel');
  };

  const handlePlaylistClick = (playlist: Playlist) => {
    selectPlaylist(playlist);
    resetBreadcrumbs();

    // 自动重构父子层级完整面包屑路径
    const chain: { id: string; name: string; isFolder: boolean }[] = [];
    let curr: Playlist | undefined = playlist;
    while (curr) {
      chain.unshift({ id: curr.id, name: curr.name, isFolder: Boolean(curr.isFolder) });
      if (curr.parentId) {
        curr = playlists.find((p) => p.id === curr?.parentId);
      } else {
        break;
      }
    }
    for (const node of chain) {
      pushBreadcrumb(node);
    }
    navigate('playlist-detail');
  };

  // 严格仅展示没有 parentId 的自定义根歌单与顶层分类目录
  const rootCustomPlaylists = playlists.filter((p) => !p.isDefault && !p.parentId);

  // 选中任何下级子歌单或目录时，自动展开其所有的祖先分类目录
  useEffect(() => {
    if (!currentPlaylist) return;
    const toExpand: Record<string, boolean> = {};
    let currParentId = currentPlaylist.parentId;
    while (currParentId) {
      toExpand[currParentId] = true;
      const parentPl = playlists.find((p) => p.id === currParentId);
      currParentId = parentPl?.parentId;
    }
    if (Object.keys(toExpand).length > 0) {
      setExpandedFolders((prev) => ({ ...prev, ...toExpand }));
    }
  }, [currentPlaylist, playlists]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // 区分默认根歌单与自定义歌单，并按标准序排列核心音库
  const defaultOrder = [
    'default_all_tracks',
    'default_favorites',
    'default_unintegrated_tracks',
    'default_trash',
  ];
  const defaultPlaylists = playlists
    .filter((p) => p.isDefault)
    .sort((a, b) => defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id));

  return (
    <motion.aside
      animate={{ width: isSidebarCollapsed ? 72 : 240 }}
      transition={springMotion.sidebar}
      className="h-full bg-[var(--bg-subtle)] border-r border-[var(--border-subtle)] flex flex-col justify-between p-3 select-none flex-shrink-0 z-20"
    >
      {/* 顶部品牌与折叠开关 */}
      <div>
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          {!isSidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 cursor-pointer"
              onClick={handleHomeClick}
            >
              <div className="w-7 h-7 rounded-xl bg-[var(--text-primary)] text-white flex items-center justify-center shadow-[var(--shadow-xs)]">
                <SvgIcons name="wave" size={16} />
              </div>
              <span className="font-bold text-base tracking-tight text-[var(--text-primary)]">
                Wavelet
              </span>
            </motion.div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            className={`w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors ${
              isSidebarCollapsed ? 'mx-auto' : ''
            }`}
            title={isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            <SvgIcons name={isSidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={18} />
          </button>
        </div>

        {/* 核心主导航项 */}
        <div className="space-y-1 mb-6">
          <button
            type="button"
            onClick={handleHomeClick}
            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 ${
              !currentPlaylist
                ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
            }`}
          >
            {isSidebarCollapsed ? (
              <FloatingCard
                trigger={<SvgIcons name="grid" size={18} />}
                content="曲库"
                placement="right"
              />
            ) : (
              <>
                <SvgIcons name="grid" size={18} />
                <span className="text-sm font-medium">曲库</span>
              </>
            )}
          </button>
        </div>

        {/* 系统默认歌单 (全部、收藏、散落、回收) */}
        <div className="space-y-1 mb-6">
          {!isSidebarCollapsed && (
            <div className="text-[11px] font-semibold text-[var(--text-tertiary)] px-3 mb-2 tracking-wider uppercase">
              音库
            </div>
          )}
          {defaultPlaylists.map((pl) => {
            const isSelected = currentPlaylist?.id === pl.id;
            const icon = getDefaultPlaylistIcon(pl.id);

            return (
              <button
                type="button"
                key={pl.id}
                onClick={() => handlePlaylistClick(pl)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 ${
                  isSelected
                    ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isSidebarCollapsed ? (
                  <FloatingCard
                    trigger={
                      <span style={{ color: icon.color }}>
                        <SvgIcons name={icon.name} size={18} />
                      </span>
                    }
                    content={`${pl.name} (${pl.trackCount})`}
                    placement="right"
                  />
                ) : (
                  <>
                    <span style={{ color: icon.color }}>
                      <SvgIcons name={icon.name} size={18} />
                    </span>
                    <span className="text-sm font-medium truncate flex-1">{pl.name}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">{pl.trackCount}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* 用户分类与自定义歌单 */}
        <div className="space-y-1">
          {!isSidebarCollapsed && (
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-semibold text-[var(--text-tertiary)] tracking-wider uppercase">
                歌单
              </span>
              <button
                type="button"
                onClick={() => setIsCreatePlaylistOpen(true)}
                className="w-5 h-5 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                title="新建歌单"
              >
                <SvgIcons name="plus" size={13} />
              </button>
            </div>
          )}
          {rootCustomPlaylists.length > 0 ? (
            <div className="space-y-0.5 overflow-y-auto max-h-[35vh]">
              {rootCustomPlaylists.map((pl) => (
                <SidebarTreeNode
                  key={pl.id}
                  playlist={pl}
                  allPlaylists={playlists}
                  currentPlaylistId={currentPlaylist?.id || null}
                  expandedFolders={expandedFolders}
                  isSidebarCollapsed={isSidebarCollapsed}
                  depth={0}
                  onToggleFolder={toggleFolder}
                  onSelectPlaylist={handlePlaylistClick}
                />
              ))}
            </div>
          ) : (
            !isSidebarCollapsed && (
              <div className="px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                暂无歌单
              </div>
            )
          )}
        </div>
      </div>

      <PlaylistModal isOpen={isCreatePlaylistOpen} onClose={() => setIsCreatePlaylistOpen(false)} />

      {/* 底部功能区：导入与导出 */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setBackupModalOpen(true)}
          className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-150 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${
            isSidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          {isSidebarCollapsed ? (
            <FloatingCard
              trigger={<SvgIcons name="archive" size={18} />}
              content="导入导出"
              placement="right"
            />
          ) : (
            <>
              <SvgIcons name="archive" size={18} />
              <span className="text-sm font-medium">导入导出</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
