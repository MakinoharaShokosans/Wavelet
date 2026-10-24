import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../../../config/index.js';
import { isLoopbackHost, safeCompareTokens } from '../middleware/host-origin-guard.js';
import { getOrCreateSessionSecret } from '../middleware/session-guard.js';

export const settingsRoute: FastifyPluginAsync = async (fastify) => {
  // 1. 获取本地会话认证 Token
  fastify.get('/api/auth/token', async (request, reply) => {
    const config = getConfig();
    if (!isLoopbackHost(config.server.host)) {
      const accessKey = request.headers['x-wavelet-access-key'] as string | undefined;
      const requiredKey = process.env.WAVELET_ACCESS_KEY;
      if (!requiredKey || !safeCompareTokens(accessKey, requiredKey)) {
        return reply.status(401).send({
          error: '未授权：访问非回环服务需要提供有效的 x-wavelet-access-key',
          requiresAccessKey: true,
        });
      }
    }
    return { token: getOrCreateSessionSecret() };
  });

  // 2. 获取当前系统配置
  fastify.get('/api/settings', async () => {
    return getConfig();
  });

  // 3. 读取最近坏损体检自愈审计日志
  fastify.get('/api/inspection-logs', async () => {
    const config = getConfig();
    const logPath = path.join(config.storage.logsDir, 'inspection.log');

    if (!fs.existsSync(logPath)) {
      return { logs: [] };
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const lastLines = lines.slice(-100);

    return {
      logs: lastLines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line };
        }
      }),
    };
  });

  // 4. 优雅关闭系统进程
  fastify.post('/api/system/shutdown', async () => {
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 200);
    return { success: true, message: 'Wavelet 服务正在优雅关闭...' };
  });
};
