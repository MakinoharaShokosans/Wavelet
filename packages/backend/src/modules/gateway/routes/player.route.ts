import type { PlayMode, Track } from '@wavelet/shared';
import type { FastifyPluginAsync } from 'fastify';
import { getDeviceManager } from '../../player/device-manager.js';
import { getPlaybackRouter } from '../../player/playback-router.js';

export const playerRoute: FastifyPluginAsync = async (fastify) => {
  const router = getPlaybackRouter();
  const deviceManager = getDeviceManager();

  // 1. 获取当前播放器状态
  fastify.get('/api/player/status', async () => {
    return router.getStatus();
  });

  // 2. 枚举硬件音频输出设备
  fastify.get('/api/player/devices', async () => {
    const devices = await deviceManager.listDevices();
    return { devices };
  });

  // 3. 启动播放
  fastify.post('/api/player/play', async (request, reply) => {
    const body = request.body as { trackId?: string; offsetMs?: number } | undefined;
    if (!body?.trackId) {
      return reply.status(400).send({ error: '缺少 trackId 参数' });
    }

    try {
      await router.play(body.trackId, body.offsetMs ?? 0);
      return { success: true, status: router.getStatus() };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 4. 暂停播放
  fastify.post('/api/player/pause', async () => {
    router.pause();
    return { success: true, status: router.getStatus() };
  });

  // 5. 恢复播放
  fastify.post('/api/player/resume', async () => {
    router.resume();
    return { success: true, status: router.getStatus() };
  });

  // 6. 停止播放
  fastify.post('/api/player/stop', async () => {
    router.stop();
    return { success: true, status: router.getStatus() };
  });

  // 7. 定位进度
  fastify.post('/api/player/seek', async (request, reply) => {
    const body = request.body as { offsetMs?: number } | undefined;
    if (typeof body?.offsetMs !== 'number') {
      return reply.status(400).send({ error: '缺少 offsetMs 参数' });
    }

    await router.seek(body.offsetMs);
    return { success: true, status: router.getStatus() };
  });

  // 8. 调节音量
  fastify.post('/api/player/volume', async (request, reply) => {
    const body = request.body as { volume?: number } | undefined;
    if (typeof body?.volume !== 'number') {
      return reply.status(400).send({ error: '缺少 volume 参数 (0.0 ~ 1.0)' });
    }

    router.setVolume(body.volume);
    return { success: true, status: router.getStatus() };
  });

  // 9. 切换输出模式或物理声卡
  fastify.post('/api/player/mode', async (request, _reply) => {
    const body = request.body as { mode?: 'direct' | 'web'; deviceId?: string } | undefined;
    if (body?.mode) {
      router.setOutputMode(body.mode);
    }
    if (body?.deviceId) {
      router.setOutputDevice(body.deviceId);
    }

    return { success: true, status: router.getStatus() };
  });

  // 9.1 Bit-Perfect 模式开关
  fastify.post('/api/player/bit-perfect', async (request) => {
    const body = request.body as { deviceName?: string; enabled?: boolean } | undefined;
    const mode = body?.enabled ? 'direct' : 'web';
    router.setOutputMode(mode);
    if (body?.deviceName) {
      router.setOutputDevice(body.deviceName);
    }
    return { success: true, status: router.getStatus() };
  });

  // 9.2 BS2B 耳塞互馈声场开关
  fastify.post('/api/player/bs2b', async (request, reply) => {
    const body = request.body as { enabled?: boolean } | undefined;
    if (typeof body?.enabled !== 'boolean') {
      return reply.status(400).send({ error: '缺少 enabled 布尔值参数' });
    }
    router.setBs2b(body.enabled);
    return { success: true, status: router.getStatus() };
  });

  // 10. 获取播放队列与当前播放索引
  fastify.get('/api/player/queue', async () => {
    return router.getQueue();
  });

  // 11. 设置/替换播放队列
  fastify.post('/api/player/queue', async (request, reply) => {
    const body = request.body as { tracks?: Track[]; startIndex?: number } | undefined;
    if (!Array.isArray(body?.tracks)) {
      return reply.status(400).send({ error: '缺少 tracks 数组参数' });
    }
    await router.setQueue(body.tracks, body.startIndex ?? 0);
    return { success: true, queue: router.getQueue() };
  });

  // 12. 追加曲目到队列 (支持 next: true 插队播放)
  fastify.post('/api/player/queue/add', async (request, reply) => {
    const body = request.body as { tracks?: Track[]; next?: boolean } | undefined;
    if (!Array.isArray(body?.tracks)) {
      return reply.status(400).send({ error: '缺少 tracks 数组参数' });
    }
    router.addToQueue(body.tracks, body.next ?? false);
    return { success: true, queue: router.getQueue() };
  });

  // 13. 从队列移除单首曲目
  fastify.delete('/api/player/queue/:index', async (request) => {
    const { index } = request.params as { index: string };
    router.removeFromQueue(Number(index));
    return { success: true, queue: router.getQueue() };
  });

  // 14. 清空队列
  fastify.delete('/api/player/queue', async () => {
    router.clearQueue();
    return { success: true, queue: router.getQueue() };
  });

  // 15. 下一首
  fastify.post('/api/player/next', async () => {
    await router.next();
    return { success: true, status: router.getStatus(), queue: router.getQueue() };
  });

  // 16. 上一首
  fastify.post('/api/player/previous', async () => {
    await router.previous();
    return { success: true, status: router.getStatus(), queue: router.getQueue() };
  });

  // 17. 切换播放模式
  fastify.post('/api/player/play-mode', async (request, reply) => {
    const body = request.body as { mode?: PlayMode } | undefined;
    const allowed: PlayMode[] = ['sequence', 'repeat-list', 'repeat-track', 'shuffle'];
    if (!body?.mode || !allowed.includes(body.mode)) {
      return reply.status(400).send({ error: `无效的播放模式，允许值: ${allowed.join(', ')}` });
    }
    router.setPlayMode(body.mode);
    return { success: true, queue: router.getQueue() };
  });
};
