import type { Track } from '@wavelet/shared';
import apiClient from './apiClient.js';

export interface ImportDirectoryResponse {
  success: boolean;
  directory: string;
  totalScanned: number;
  importedCount: number;
  tracks: Track[];
  errors: { filePath: string; error: string }[];
}

export interface SyncMusicsResponse {
  success: boolean;
  libraryDir: string;
  totalScanned: number;
  importedCount: number;
  tracks: Track[];
}

export const importService = {
  /**
   * 获取当前曲库绑定的物理目录路径
   */
  async getLibraryDir(): Promise<{ libraryDir: string }> {
    return apiClient.get<{ libraryDir: string }>('/api/import/library-dir');
  },

  /**
   * 一键原地同步工程根目录 musics 目录
   */
  async scanMusics(): Promise<SyncMusicsResponse> {
    return apiClient.post<SyncMusicsResponse>('/api/import/musics');
  },

  /**
   * 递归扫描指定目录并原地建立全量音频索引
   */
  async importDirectory(directoryPath: string): Promise<ImportDirectoryResponse> {
    return apiClient.post<ImportDirectoryResponse>('/api/import/directory', {
      directoryPath,
    });
  },
};

export default importService;
