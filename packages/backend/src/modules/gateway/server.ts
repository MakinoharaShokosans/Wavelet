import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWs from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import {
  hostOriginGuard,
  isAllowedOrigin,
  isLoopbackHost,
  redactUrl,
  safeCompareTokens,
} from './middleware/host-origin-guard.js';
import { getOrCreateSessionSecret, sessionGuard } from './middleware/session-guard.js';
import { backupRoute } from './routes/backup.route.js';
import { importRoute } from './routes/import.route.js';
import { playerRoute } from './routes/player.route.js';
import { playlistsRoute } from './routes/playlists.route.js';
import { settingsRoute } from './routes/settings.route.js';
import { statsRoute } from './routes/stats.route.js';
import { streamRoute } from './routes/stream.route.js';
import { tracksRoute } from './routes/tracks.route.js';
import { registerWsClient } from './ws/broadcaster.js';

let appInstance: FastifyInstance | null = null;

export async function createServer(): Promise<FastifyInstance> {
  const config = getConfig();

  const fastify = Fastify({
    logger: false, // 由外部统一定义的 Pino 管理，避免冗余包装
  });

  // 1. 注册全局 Host 与 Origin 安全防线 (防 DNS Rebinding 与伪造请求)
  fastify.addHook('onRequest', hostOriginGuard);

  // 2. 注册 CORS 跨域插件
  await fastify.register(cors, {
    origin: config.server.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // 3. 注册 WebSocket 实时通信通道并进行握手鉴权
  await fastify.register(fastifyWs);

  fastify.get('/ws/live', { websocket: true }, (socket, request) => {
    const origin = request.headers.origin;
    if (
      origin &&
      !isAllowedOrigin(origin, config.server.corsOrigins, config.server.host, config.server.port)
    ) {
      socket.close(4403, 'Forbidden Origin');
      return;
    }

    const queryToken = (request.query as Record<string, string>)?.token;
    if (!safeCompareTokens(queryToken, getOrCreateSessionSecret())) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    registerWsClient(socket);
    logger.info('[WebSocket] 前端客户端已接入 60fps 实时通信通道');
  });

  // 4. 挂载 HTTP 请求响应生命周期实时日志 (脱敏 URL 中的敏感 Token)
  fastify.addHook('onResponse', async (request, reply) => {
    // 聚焦 API 与 WebSocket 路由，忽略高频前端静态资源
    if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
      const duration = Math.round(reply.elapsedTime);
      const status = reply.statusCode;
      const method = request.method;
      const url = redactUrl(request.url);
      const logMsg = `[HTTP] ${method} ${url} -> ${status} (${duration}ms)`;
      if (status >= 500) {
        logger.error({ method, url, status, duration }, logMsg);
      } else if (status >= 400) {
        logger.warn({ method, url, status, duration }, logMsg);
      } else {
        logger.info(logMsg);
      }
    }
  });

  fastify.addHook('onError', async (request, _reply, error) => {
    logger.error(
      { err: error, method: request.method, url: redactUrl(request.url) },
      `[HTTP] 请求执行异常: ${error.message}`
    );
  });

  // 5. 挂载本地访问安全令牌守卫中间件
  fastify.addHook('preHandler', sessionGuard);

  // 4. 注册业务路由
  await fastify.register(statsRoute);
  await fastify.register(tracksRoute);
  await fastify.register(playlistsRoute);
  await fastify.register(playerRoute);
  await fastify.register(importRoute);
  await fastify.register(streamRoute);
  await fastify.register(settingsRoute);
  await fastify.register(backupRoute);

  // 5. 挂载前端生产打包 SPA 静态托管 (若 dist 存在)
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    process.env.WAVELET_FRONTEND_DIST,
    process.env.WAVELET_PROJECT_ROOT
      ? path.resolve(process.env.WAVELET_PROJECT_ROOT, 'packages/frontend/dist')
      : undefined,
    path.resolve(currentDir, '../../frontend/dist'),
    path.resolve(currentDir, '../frontend/dist'),
    path.resolve(process.cwd(), 'packages/frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ].filter((p): p is string => Boolean(p && typeof p === 'string'));

  const frontendDist = possiblePaths.find((p) => fs.existsSync(p));
  if (frontendDist) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });

    // 针对非 API 路径的 SPA 客户端路由，统一回退至 index.html
    fastify.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api') && !request.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      reply.status(404).send({ error: '资源不存在' });
    });
  }

  appInstance = fastify;
  return fastify;
}

export function assertAccessKeyIfRequired(host: string): void {
  if (!isLoopbackHost(host) && !process.env.WAVELET_ACCESS_KEY) {
    throw new Error(
      `[Wavelet Security] 当前配置监听非回环地址 ${host}，但未检测到环境变量 WAVELET_ACCESS_KEY。为了系统安全性，拒绝在缺少口令保护的情况下启动服务。`
    );
  }
}

export async function startServer(): Promise<string> {
  const config = getConfig();
  assertAccessKeyIfRequired(config.server.host);

  const server = appInstance || (await createServer());

  const address = await server.listen({
    host: config.server.host,
    port: config.server.port,
  });

  logger.info({ address }, '[Gateway] Fastify 本地网关监听就绪');
  return address;
}

export async function stopServer(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
    logger.info('[Gateway] Fastify 本地网关已安全停机');
  }
}
