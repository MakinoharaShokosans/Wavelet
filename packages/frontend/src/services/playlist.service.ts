import type { Playlist, PlaylistTreeNode, Track } from '@wavelet/shared';
import apiClient from './apiClient.js';

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  parentId?: string;
  isFolder?: boolean;
}

export interface UpdatePlaylistInput {
  name?: string;
  description?: string;
  parentId?: string | null;
  isFolder?: boolean;
}

export const playlistService = {
  /**
   * 获取所有平铺歌单列表
   */
  async getPlaylists(): Promise<Playlist[]> {
    return apiClient.get<Playlist[]>('/api/playlists');
  },

  /**
   * 获取组装好的完整嵌套树状目录
   */
  async getPlaylistTree(): Promise<PlaylistTreeNode[]> {
    return apiClient.get<PlaylistTreeNode[]>('/api/playlists/tree');
  },

  /**
   * 创建实体歌单或分类目录文件夹
   */
  async createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    const res = await apiClient.post<{ playlist?: Playlist } & Playlist>('/api/playlists', input);
    return res.playlist || res;
  },

  /**
   * 更新歌单元数据、移动层级或切换文件夹形态
   */
  async updatePlaylist(id: string, input: UpdatePlaylistInput): Promise<Playlist> {
    const res = await apiClient.patch<{ playlist?: Playlist } & Playlist>(
      `/api/playlists/${encodeURIComponent(id)}`,
      input
    );
    return res.playlist || res;
  },

  /**
   * 删除歌单及其映射（如果是目录则级联处理）
   */
  async deletePlaylist(id: string): Promise<{ success: boolean }> {
    return apiClient.del<{ success: boolean }>(`/api/playlists/${encodeURIComponent(id)}`);
  },

  /**
   * 获取歌单内部挂载的曲目列表
   */
  async getPlaylistTracks(id: string): Promise<Track[]> {
    return apiClient.get<Track[]>(`/api/playlists/${encodeURIComponent(id)}/tracks`);
  },

  /**
   * 向歌单添加歌曲（若歌单为目录文件夹则被拦截；添加成功后曲目自动脱离未集成歌单）
   */
  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
      { trackId }
    );
  },

  /**
   * 批量向歌单添加多首歌曲
   */
  async addTracksToPlaylist(
    playlistId: string,
    trackIds: string[]
  ): Promise<{ success: boolean; count?: number }> {
    return apiClient.post<{ success: boolean; count?: number }>(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
      { trackIds }
    );
  },

  /**
   * 从歌单中移除指定歌曲
   */
  async removeTrackFromPlaylist(
    playlistId: string,
    trackId: string
  ): Promise<{ success: boolean }> {
    return apiClient.del<{ success: boolean }>(
      `/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`
    );
  },

  /**
   * 获取歌单封面图片 URL
   */
  getCoverUrl(id: string, timestamp?: number): string {
    return apiClient.getCoverUrl(id, timestamp);
  },

  /**
   * 上传或更新歌单自定义封面
   */
  async updateCover(
    id: string,
    coverBase64: string
  ): Promise<{ success: boolean; coverImagePath?: string }> {
    return apiClient.post<{ success: boolean; coverImagePath?: string }>(
      `/api/playlists/${encodeURIComponent(id)}/cover`,
      { coverBase64 }
    );
  },

  /**
   * 从曲目一键拷贝封面至歌单 (若未指定 trackId 则自动拷贝歌单首首含封面歌曲)
   */
  async copyCoverFromTrack(
    id: string,
    trackId?: string
  ): Promise<{ success: boolean; coverImagePath?: string }> {
    return apiClient.post<{ success: boolean; coverImagePath?: string }>(
      `/api/playlists/${encodeURIComponent(id)}/cover/copy-from-track`,
      { trackId }
    );
  },

  /**
   * 移除歌单自定义封面
   */
  async removeCover(id: string): Promise<{ success: boolean }> {
    return apiClient.del<{ success: boolean }>(`/api/playlists/${encodeURIComponent(id)}/cover`);
  },

  /**
   * 清空回收歌单中的所有歌曲（彻底物理删除）
   */
  async emptyTrash(): Promise<{ success: boolean; purgedCount: number }> {
    return apiClient.post<{ success: boolean; purgedCount: number }>(
      '/api/playlists/default_trash/empty'
    );
  },

  /**
   * 校准所有歌单的有效曲目数与清理幽灵引用 (ISSUE-08)
   */
  async recalibrateCounts(): Promise<{
    success: boolean;
    updatedPlaylists: number;
    cleanedGhostRelations: number;
  }> {
    return apiClient.post<{
      success: boolean;
      updatedPlaylists: number;
      cleanedGhostRelations: number;
    }>('/api/playlists/recalibrate-counts');
  },
};

export default playlistService;
