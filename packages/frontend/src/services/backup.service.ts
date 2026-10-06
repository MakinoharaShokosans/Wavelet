import apiClient from './apiClient.js';

export interface ExportBackupResponse {
  success: boolean;
  data: {
    success: boolean;
    targetZipPath: string;
    fileSize: number;
    trackCount: number;
    playlistCount: number;
  };
  downloadUrl: string;
}

export interface ImportBackupResponse {
  success: boolean;
  data: {
    success: boolean;
    restoredTracks: number;
    restoredPlaylists: number;
    destinationAudioDir: string;
  };
}

export const backupService = {
  /**
   * 触发曲库全量备份导出为 .zip
   */
  async exportBackup(options?: {
    targetZipPath?: string;
    includeAudio?: boolean;
  }): Promise<ExportBackupResponse> {
    return apiClient.post<ExportBackupResponse>('/api/backup/export', options ?? {});
  },

  /**
   * 获取流式下载备份包的 URL 地址
   */
  getDownloadUrl(): string {
    return '/api/backup/download';
  },

  /**
   * 触发曲库备份包还原恢复
   */
  async importBackup(options: {
    zipFilePath: string;
    destinationAudioDir?: string;
  }): Promise<ImportBackupResponse> {
    return apiClient.post<ImportBackupResponse>('/api/backup/import', options);
  },
};

export default backupService;
