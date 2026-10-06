import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

let sessionSecret = '';

/**
 * 初始化并在内存中生成单次启动随机 Local-Session-Key
 * 防止同机恶意后台软件在未授权情况下调用本地接口
 */
export function getOrCreateSessionSecret(): string {
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return sessionSecret;
}

/**
 * 本地访问安全守卫中间件
 */
export async function sessionGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // 1. 允许非 /api 前缀的静态网页资源、安全握手首次请求与封面只读 GET 请求
  if (
    !request.url.startsWith('/api') ||
    request.url.startsWith('/api/auth/token') ||
    (request.method === 'GET' && request.url.includes('/cover'))
  ) {
    return;
  }

  // 2. 媒体流与静态封面允许携带 Query token (供原生 <audio> 标签与 <img> 标签使用)
  const queryToken = (request.query as Record<string, string>)?.token;
  const headerToken = request.headers['x-wavelet-session'] || request.headers['local-session-key'];

  const token = headerToken || queryToken;

  if (!token || token !== getOrCreateSessionSecret()) {
    reply.status(401).send({ error: '未授权的本地请求：缺少有效 Local-Session-Key' });
  }
}
