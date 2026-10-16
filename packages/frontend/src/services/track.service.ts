import type { Track, TrackSortOption, WaveformData } from '@wavelet/shared';
import apiClient from './apiClient.js';

export interface GetTracksParams {
  query?: string;
  sort?: TrackSortOption;
  page?: number;
  limit?: number;
}

export interface GetTracksResponse {
  items: Track[];
  total: number;
}

export const trackService = {
  /**
   * 分页检索曲库列表，支持多种动态排序
   */
  async getTracks(params: GetTracksParams = {}): Promise<GetTracksResponse> {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set('query', params.query);
    if (params.sort) searchParams.set('sort', params.sort);
    if (params.page !== undefined) searchParams.set('page', String(params.page));
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit));

    const qs = searchParams.toString();
    const path = qs ? `/api/tracks?${qs}` : '/api/tracks';
    return apiClient.get<GetTracksResponse>(path);
  },

  /**
   * 获取指定单曲详情
   */
  async getTrack(id: string): Promise<Track> {
    return apiClient.get<Track>(`/api/tracks/${encodeURIComponent(id)}`);
  },

  /**
   * 获取整轨 128 点归一化波形峰值数据
   */
  async getWaveform(id: string): Promise<WaveformData> {
    return apiClient.get<WaveformData>(`/api/tracks/${encodeURIComponent(id)}/waveform`);
  },

  /**
   * 一键切换心动收藏状态
   */
  async toggleFavorite(id: string): Promise<{ isFavorite: boolean }> {
    return apiClient.post<{ isFavorite: boolean }>(
      `/api/tracks/${encodeURIComponent(id)}/favorite`
    );
  },

  /**
   * 获取音频流播放签名 URL
   */
  getAudioStreamUrl(id: string): string {
    return apiClient.getAudioStreamUrl(id);
  },

  /**
   * 手动重新读取并刷新单首曲目元数据 (ISSUE-06)
   */
  async refreshTrack(id: string): Promise<{ success: boolean; track: Track }> {
    return apiClient.post<{ success: boolean; track: Track }>(
      `/api/tracks/${encodeURIComponent(id)}/refresh`
    );
  },

  /**
   * 修改曲目元数据
   */
  async updateTrack(
    id: string,
    updates: { title?: string; artist?: string; album?: string; albumArtist?: string }
  ): Promise<{ success: boolean; track: Track }> {
    return apiClient.patch<{ success: boolean; track: Track }>(
      `/api/tracks/${encodeURIComponent(id)}`,
      updates
    );
  },

  /**
   * 将歌曲移入回收歌单（安全软删除，保留物理文件）
   */
  async trashTrack(id: string): Promise<{ success: boolean; trashed: boolean }> {
    return apiClient.del<{ success: boolean; trashed: boolean }>(
      `/api/tracks/${encodeURIComponent(id)}`
    );
  },

  /**
   * 从回收歌单恢复曲目
   */
  async restoreTrack(id: string): Promise<{ success: boolean; track: Track }> {
    return apiClient.post<{ success: boolean; track: Track }>(
      `/api/tracks/${encodeURIComponent(id)}/restore`
    );
  },

  /**
   * 彻底删除曲目（物理擦除本地音频文件与数据记录）
   */
  async purgeTrack(id: string): Promise<{ success: boolean; purged: boolean }> {
    return apiClient.del<{ success: boolean; purged: boolean }>(
      `/api/tracks/${encodeURIComponent(id)}?purge=true`
    );
  },

  /**
   * 批量彻底清理所有失联曲目 (ISSUE-03 方案 A: 用户主动一键清理)
   */
  async pruneMissingTracks(): Promise<{
    success: boolean;
    purgedCount: number;
    trackIds: string[];
  }> {
    return apiClient.post<{
      success: boolean;
      purgedCount: number;
      trackIds: string[];
    }>('/api/tracks/prune-missing');
  },

  /**
   * 上传或替换曲目封面
   */
  async updateCover(
    id: string,
    coverBase64: string
  ): Promise<{ success: boolean; hasEmbeddedCover: boolean }> {
    return apiClient.post<{ success: boolean; hasEmbeddedCover: boolean }>(
      `/api/tracks/${encodeURIComponent(id)}/cover`,
      { coverBase64 }
    );
  },

  /**
   * 移除曲目封面
   */
  async removeCover(id: string): Promise<{ success: boolean }> {
    return apiClient.del<{ success: boolean }>(`/api/tracks/${encodeURIComponent(id)}/cover`);
  },

  /**
   * 获取带 Token 的曲目封面图片直连 URL
   */
  getCoverUrl(id: string, timestamp?: number): string {
    return apiClient.getTrackCoverUrl(id, timestamp);
  },
};

export default trackService;
