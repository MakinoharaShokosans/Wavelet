import type { FastifyPluginAsync } from 'fastify';
import { TrackRepository } from '../../library/repositories/track.repository.js';

export const statsRoute: FastifyPluginAsync = async (fastify) => {
  const trackRepo = new TrackRepository();

  // 1. 获取曲库宏观数据看板聚合 (供 SplashView 启动页与数据看板秒开呈现)
  fastify.get('/api/stats', async () => {
    return trackRepo.getStats();
  });
};
