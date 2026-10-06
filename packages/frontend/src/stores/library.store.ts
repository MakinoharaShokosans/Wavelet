import type { LibraryStats, Playlist, PlaylistTreeNode, Track } from '@wavelet/shared';
import { create } from 'zustand';
import playlistService, {
  type CreatePlaylistInput,
  type UpdatePlaylistInput,
} from '../services/playlist.service.js';
import statsService from '../services/stats.service.js';
import trackService from '../services/track.service.js';

export interface LibraryState {
  playlists: Playlist[];
  playlistTree: PlaylistTreeNode[];
  currentPlaylist: Playlist | null;
  currentPlaylistTracks: Track[];
  unintegratedPlaylist: Playlist | null;
  favoritesPlaylist: Playlist | null;
  trashPlaylist: Playlist | null;
  stats: LibraryStats | null;
  isLoading: boolean;
  error: string | null;

  fetchPlaylists: () => Promise<void>;
  fetchPlaylistTree: () => Promise<void>;
  selectPlaylist: (playlist: Playlist | null) => Promise<void>;
  refreshStats: () => Promise<void>;
  createPlaylist: (input: CreatePlaylistInput) => Promise<Playlist>;
  updatePlaylist: (id: string, input: UpdatePlaylistInput) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  toggleTrackFavorite: (trackId: string) => Promise<boolean>;
  trashTrack: (trackId: string) => Promise<void>;
  restoreTrack: (trackId: string) => Promise<void>;
  purgeTrack: (trackId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  updateTrack: (
    id: string,
    updates: { title?: string; artist?: string; album?: string; albumArtist?: string }
  ) => Promise<Track>;
  updateTrackCover: (id: string, coverBase64: string) => Promise<void>;
  removeTrackCover: (id: string) => Promise<void>;
  updatePlaylistCover: (id: string, coverBase64: string) => Promise<void>;
  copyPlaylistCoverFromTrack: (id: string, trackId?: string) => Promise<void>;
  removePlaylistCover: (id: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  playlists: [],
  playlistTree: [],
  currentPlaylist: null,
  currentPlaylistTracks: [],
  unintegratedPlaylist: null,
  favoritesPlaylist: null,
  trashPlaylist: null,
  stats: null,
  isLoading: false,
  error: null,

  fetchPlaylists: async () => {
    try {
      set({ isLoading: true, error: null });
      const list = await playlistService.getPlaylists();

      const unintegrated = list.find((p) => p.id === 'default_unintegrated_tracks') || null;
      const favorites = list.find((p) => p.id === 'default_favorites') || null;
      const trash = list.find((p) => p.id === 'default_trash') || null;

      set({
        playlists: list,
        unintegratedPlaylist: unintegrated,
        favoritesPlaylist: favorites,
        trashPlaylist: trash,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取歌单失败',
        isLoading: false,
      });
    }
  },

  fetchPlaylistTree: async () => {
    try {
      const tree = await playlistService.getPlaylistTree();
      set({ playlistTree: tree });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '获取歌单目录树失败' });
    }
  },

  selectPlaylist: async (playlist: Playlist | null) => {
    set({ currentPlaylist: playlist });
    if (!playlist) {
      set({ currentPlaylistTracks: [] });
      return;
    }

    // 目录文件夹不包含单曲，直接清空
    if (playlist.isFolder) {
      set({ currentPlaylistTracks: [] });
      return;
    }

    try {
      set({ isLoading: true });
      const tracks = await playlistService.getPlaylistTracks(playlist.id);
      set({ currentPlaylistTracks: tracks, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : '获取歌单内歌曲失败',
        isLoading: false,
      });
    }
  },

  refreshStats: async () => {
    try {
      const stats = await statsService.getStats();
      set({ stats });
    } catch (err) {
      // 容灾忽略
    }
  },

  createPlaylist: async (input: CreatePlaylistInput) => {
    const pl = await playlistService.createPlaylist(input);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    await get().refreshStats();
    return pl;
  },

  updatePlaylist: async (id: string, input: UpdatePlaylistInput) => {
    const pl = await playlistService.updatePlaylist(id, input);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === id) {
      const updated = get().playlists.find((p) => p.id === id) || pl;
      set({ currentPlaylist: updated });
    }
    return pl;
  },

  deletePlaylist: async (id: string) => {
    await playlistService.deletePlaylist(id);
    if (get().currentPlaylist?.id === id) {
      set({ currentPlaylist: null, currentPlaylistTracks: [] });
    }
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    await get().refreshStats();
  },

  addTrackToPlaylist: async (playlistId: string, trackId: string) => {
    await playlistService.addTrackToPlaylist(playlistId, trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === playlistId) {
      const tracks = await playlistService.getPlaylistTracks(playlistId);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  addTracksToPlaylist: async (playlistId: string, trackIds: string[]) => {
    await playlistService.addTracksToPlaylist(playlistId, trackIds);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === playlistId) {
      const tracks = await playlistService.getPlaylistTracks(playlistId);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  removeTrackFromPlaylist: async (playlistId: string, trackId: string) => {
    await playlistService.removeTrackFromPlaylist(playlistId, trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === playlistId) {
      const tracks = await playlistService.getPlaylistTracks(playlistId);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  toggleTrackFavorite: async (trackId: string) => {
    const { isFavorite } = await trackService.toggleFavorite(trackId);

    // 局部更新当前歌单列表状态
    set((state) => ({
      currentPlaylistTracks: state.currentPlaylistTracks.map((t) =>
        t.id === trackId ? { ...t, isFavorite } : t
      ),
    }));

    await get().fetchPlaylists();
    return isFavorite;
  },

  trashTrack: async (trackId: string) => {
    await trackService.trashTrack(trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    const curr = get().currentPlaylist;
    if (curr) {
      const tracks = await playlistService.getPlaylistTracks(curr.id);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  restoreTrack: async (trackId: string) => {
    await trackService.restoreTrack(trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    const curr = get().currentPlaylist;
    if (curr) {
      const tracks = await playlistService.getPlaylistTracks(curr.id);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  purgeTrack: async (trackId: string) => {
    await trackService.purgeTrack(trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    const curr = get().currentPlaylist;
    if (curr) {
      const tracks = await playlistService.getPlaylistTracks(curr.id);
      set({ currentPlaylistTracks: tracks });
    }
    await get().refreshStats();
  },

  emptyTrash: async () => {
    await playlistService.emptyTrash();
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === 'default_trash') {
      set({ currentPlaylistTracks: [] });
    }
    await get().refreshStats();
  },

  updateTrack: async (id, updates) => {
    const res = await trackService.updateTrack(id, updates);
    const updated = res.track;
    set((state) => ({
      currentPlaylistTracks: state.currentPlaylistTracks.map((t) =>
        t.id === id ? { ...t, ...updated } : t
      ),
    }));
    return updated;
  },

  updateTrackCover: async (id, coverBase64) => {
    await trackService.updateCover(id, coverBase64);
    set((state) => ({
      currentPlaylistTracks: state.currentPlaylistTracks.map((t) =>
        t.id === id ? { ...t, hasEmbeddedCover: true } : t
      ),
    }));
  },

  removeTrackCover: async (id) => {
    await trackService.removeCover(id);
    set((state) => ({
      currentPlaylistTracks: state.currentPlaylistTracks.map((t) =>
        t.id === id ? { ...t, hasEmbeddedCover: false } : t
      ),
    }));
  },

  updatePlaylistCover: async (id, coverBase64) => {
    await playlistService.updateCover(id, coverBase64);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === id) {
      const updated = get().playlists.find((p) => p.id === id);
      if (updated) set({ currentPlaylist: updated });
    }
  },

  copyPlaylistCoverFromTrack: async (id, trackId) => {
    await playlistService.copyCoverFromTrack(id, trackId);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === id) {
      const updated = get().playlists.find((p) => p.id === id);
      if (updated) set({ currentPlaylist: updated });
    }
  },

  removePlaylistCover: async (id) => {
    await playlistService.removeCover(id);
    await get().fetchPlaylists();
    await get().fetchPlaylistTree();
    if (get().currentPlaylist?.id === id) {
      const updated = get().playlists.find((p) => p.id === id);
      if (updated) set({ currentPlaylist: updated });
    }
  },
}));

export default useLibraryStore;
