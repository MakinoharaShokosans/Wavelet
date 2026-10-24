import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from '../../../config/index.js';

/**
 * 判断是否为本地回环主机地址
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().trim();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

/**
 * 校验 Host 头部是否位于合法白名单内 (防 DNS Rebinding 攻击)
 */
export function isAllowedHost(
  hostHeader: string | undefined,
  configHost: string,
  configPort: number
): boolean {
  if (!hostHeader) return false;
  const lower = hostHeader.toLowerCase().trim();

  // 回环以及配置的主机名
  const allowedBase = new Set([
    '127.0.0.1',
    'localhost',
    '::1',
    '[::1]',
    configHost.toLowerCase(),
    configHost.startsWith('[') ? configHost.toLowerCase() : `[${configHost.toLowerCase()}]`,
  ]);

  if (allowedBase.has(lower)) return true;

  // hostname:port 比对
  const lastColon = lower.lastIndexOf(':');
  if (lastColon !== -1) {
    const h = lower.slice(0, lastColon);
    const p = Number.parseInt(lower.slice(lastColon + 1), 10);
    if (isLoopbackHost(h)) {
      return true;
    }
    if (allowedBase.has(h) && (p === configPort || Number.isNaN(p))) {
      return true;
    }
  }

  return false;
}

/**
 * 校验 Origin 是否合法
 * 若无 Origin (curl/CLI/同源直连) 则放行；若存在则必须与 corsOrigins 匹配或同源
 */
export function isAllowedOrigin(
  originHeader: string | undefined,
  corsOrigins: string[],
  configHost: string,
  configPort: number,
  allowWildcard = false
): boolean {
  if (!originHeader) return true; // 非浏览器请求或同源无 Origin 头部放行

  if (allowWildcard && corsOrigins.includes('*')) {
    return true;
  }

  if (corsOrigins.includes(originHeader)) {
    return true;
  }

  try {
    const url = new URL(originHeader);
    return isAllowedHost(url.host, configHost, configPort);
  } catch {
    return false;
  }
}

/**
 * 常量时间安全比对两个 Token (防时序侧信道攻击)
 */
export function safeCompareTokens(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 剥除 URL 中的敏感 token 参数，防止其落入日志文件
 */
export function redactUrl(rawUrl: string): string {
  return rawUrl.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]');
}

/**
 * Fastify 全局 Host 与 Origin 安全守卫钩子
 */
export async function hostOriginGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = getConfig();

  // 1. 严格校验 Host 头
  const host = request.headers.host;
  if (!isAllowedHost(host, config.server.host, config.server.port)) {
    reply.status(421).send({ error: 'Misdirected Request: 非法 Host 标头，拒绝访问' });
    return;
  }

  // 2. 校验关键敏感接口的 Origin
  const pathname = request.url.split('?')[0];
  const origin = request.headers.origin;
  if (
    (pathname === '/api/auth/token' || pathname.startsWith('/ws')) &&
    origin &&
    !isAllowedOrigin(origin, config.server.corsOrigins, config.server.host, config.server.port)
  ) {
    reply.status(403).send({ error: 'Forbidden: 非法请求来源 Origin' });
  }
}
