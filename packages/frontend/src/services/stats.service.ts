import type { LibraryStats } from '@wavelet/shared';
import apiClient from './apiClient.js';

export const statsService = {
  /**
   * 获取启动看板聚合统计数据
   */
  async getStats(): Promise<LibraryStats> {
    return apiClient.get<LibraryStats>('/api/stats');
  },
};

export default statsService;
