import {
  assertAccessKeyIfRequired,
  createServer,
  getDatabase,
  getOrCreateSessionSecret,
  isAllowedHost,
  isAllowedOrigin,
  isLoopbackHost,
  loadConfig,
  redactUrl,
  resetPlaybackRouter,
  runMigrations,
  safeCompareTokens,
} from '@wavelet/backend';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Integration Test: Gateway Security & Anti-Rebinding Hardening', () => {
  let app: FastifyInstance;
  let sandbox: ReturnType<typeof createTestSandbox>;
  let sessionToken: string;

  beforeAll(async () => {
    // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
    delete process.env.WAVELET_HOST;
    // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
    delete process.env.WAVELET_ACCESS_KEY;
    resetPlaybackRouter();
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    app = await createServer();
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/auth/token',
    });
    sessionToken = JSON.parse(authRes.body).token;
  });

  afterAll(async () => {
    // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
    delete process.env.WAVELET_HOST;
    // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
    delete process.env.WAVELET_ACCESS_KEY;
    await app.close();
    resetPlaybackRouter();
    sandbox.cleanup();
  });

  describe('1. 实用工具函数 (安全守卫基础能力)', () => {
    it('redactUrl 能够精准脱敏 URL 中的敏感 token 参数并保留其他参数', () => {
      expect(redactUrl('http://127.0.0.1:8848/api/stream/trk_1?token=abcdef123')).toBe(
        'http://127.0.0.1:8848/api/stream/trk_1?token=[REDACTED]'
      );
      expect(redactUrl('/api/stream/trk_1?other=1&token=sec_123456&format=flac')).toBe(
        '/api/stream/trk_1?other=1&token=[REDACTED]&format=flac'
      );
      expect(redactUrl('/api/stats')).toBe('/api/stats');
    });

    it('safeCompareTokens 常量时间安全比对防时序侧信道', () => {
      const secret = 'a'.repeat(64);
      expect(safeCompareTokens(secret, secret)).toBe(true);
      expect(safeCompareTokens(secret, `${'a'.repeat(63)}b`)).toBe(false);
      expect(safeCompareTokens(secret, 'short')).toBe(false);
      expect(safeCompareTokens(undefined, secret)).toBe(false);
      expect(safeCompareTokens(secret, null)).toBe(false);
      expect(safeCompareTokens('', secret)).toBe(false);
    });

    it('isLoopbackHost 正确判断回环与非回环主机', () => {
      expect(isLoopbackHost('127.0.0.1')).toBe(true);
      expect(isLoopbackHost('localhost')).toBe(true);
      expect(isLoopbackHost('::1')).toBe(true);
      expect(isLoopbackHost('[::1]')).toBe(true);
      expect(isLoopbackHost('0.0.0.0')).toBe(false);
      expect(isLoopbackHost('192.168.1.100')).toBe(false);
      expect(isLoopbackHost('example.com')).toBe(false);
    });

    it('isAllowedHost 正确拦截非法 Host 标头', () => {
      expect(isAllowedHost('127.0.0.1:8848', '127.0.0.1', 8848)).toBe(true);
      expect(isAllowedHost('localhost:8848', '127.0.0.1', 8848)).toBe(true);
      expect(isAllowedHost('127.0.0.1:45678', '127.0.0.1', 8848)).toBe(true);
      expect(isAllowedHost('evil.attacker.com', '127.0.0.1', 8848)).toBe(false);
      expect(isAllowedHost('attacker.com:8848', '127.0.0.1', 8848)).toBe(false);
    });

    it('assertAccessKeyIfRequired 在非回环暴露且无密钥时拒绝启动', () => {
      expect(() => assertAccessKeyIfRequired('127.0.0.1')).not.toThrow();
      expect(() => assertAccessKeyIfRequired('localhost')).not.toThrow();

      const origKey = process.env.WAVELET_ACCESS_KEY;
      try {
        // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
        delete process.env.WAVELET_ACCESS_KEY;
        expect(() => assertAccessKeyIfRequired('0.0.0.0')).toThrow(/WAVELET_ACCESS_KEY/);
        expect(() => assertAccessKeyIfRequired('192.168.1.50')).toThrow(/WAVELET_ACCESS_KEY/);

        process.env.WAVELET_ACCESS_KEY = 'super_secret';
        expect(() => assertAccessKeyIfRequired('0.0.0.0')).not.toThrow();
      } finally {
        if (origKey !== undefined) {
          process.env.WAVELET_ACCESS_KEY = origKey;
        } else {
          // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
          delete process.env.WAVELET_ACCESS_KEY;
        }
      }
    });
  });

  describe('2. HTTP 防御守卫 (DNS Rebinding & CSRF)', () => {
    it('当 Host 为未授权恶意域名时应被 onRequest 拦截并返回 421', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/stats',
        headers: {
          host: 'evil.attacker.com',
          'x-wavelet-session': sessionToken,
        },
      });
      expect(res.statusCode).toBe(421);
      expect(JSON.parse(res.body).error).toContain('Misdirected Request');
    });

    it('当 Origin 为非法跨域来源请求 /api/auth/token 时应返回 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/token',
        headers: {
          origin: 'http://malicious-site.com',
        },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain('Forbidden');
    });

    it('当 Origin 为非法跨域来源请求 /ws/live 时应被 onRequest 守卫拦截返回 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/ws/live',
        headers: {
          origin: 'http://malicious-site.com',
        },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error).toContain('Forbidden');
    });

    it('合法同源 Origin 换取 token 应成功返回 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/token',
        headers: {
          origin: 'http://127.0.0.1:8848',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).token).toBeDefined();
    });

    it('普通 API 不允许使用 URL Query Token 伪装鉴权，防止 Token 泄露到浏览器历史', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/stats?token=${sessionToken}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('3. 非回环环境 WAVELET_ACCESS_KEY 双重认证', () => {
    it('非回环环境未携带 x-wavelet-access-key 时应返回 401 及 requiresAccessKey', async () => {
      const prevKey = process.env.WAVELET_ACCESS_KEY;
      const prevHost = process.env.WAVELET_HOST;
      try {
        process.env.WAVELET_ACCESS_KEY = 'lan_secret_123';
        process.env.WAVELET_HOST = '0.0.0.0';
        loadConfig(sandbox.configPath);

        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/token',
        });
        expect(res.statusCode).toBe(401);
        const data = JSON.parse(res.body);
        expect(data.requiresAccessKey).toBe(true);

        // 携带错误密钥
        const wrongRes = await app.inject({
          method: 'GET',
          url: '/api/auth/token',
          headers: {
            'x-wavelet-access-key': 'wrong_key',
          },
        });
        expect(wrongRes.statusCode).toBe(401);

        // 携带正确密钥
        const rightRes = await app.inject({
          method: 'GET',
          url: '/api/auth/token',
          headers: {
            'x-wavelet-access-key': 'lan_secret_123',
          },
        });
        expect(rightRes.statusCode).toBe(200);
        expect(JSON.parse(rightRes.body).token).toBeDefined();
      } finally {
        if (prevKey !== undefined) {
          process.env.WAVELET_ACCESS_KEY = prevKey;
        } else {
          // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
          delete process.env.WAVELET_ACCESS_KEY;
        }
        if (prevHost !== undefined) {
          process.env.WAVELET_HOST = prevHost;
        } else {
          // biome-ignore lint/performance/noDelete: Node.js process.env requires delete to unset variables
          delete process.env.WAVELET_HOST;
        }
        loadConfig(sandbox.configPath);
      }
    });
  });

  describe('4. WebSocket 握手安全性与鉴权逻辑', () => {
    it('isAllowedOrigin 严密校验 WebSocket 连接来源', () => {
      const corsOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];
      // 合法同源
      expect(isAllowedOrigin('http://127.0.0.1:8848', corsOrigins, '127.0.0.1', 8848)).toBe(true);
      expect(isAllowedOrigin('http://localhost:8848', corsOrigins, '127.0.0.1', 8848)).toBe(true);
      // 白名单前端
      expect(isAllowedOrigin('http://127.0.0.1:5173', corsOrigins, '127.0.0.1', 8848)).toBe(true);
      // 恶意跨域来源即便配置有 * 也拒绝敏感握手
      expect(isAllowedOrigin('http://evil.com', ['*'], '127.0.0.1', 8848, false)).toBe(false);
      expect(isAllowedOrigin('http://evil.com', corsOrigins, '127.0.0.1', 8848)).toBe(false);
    });

    it('safeCompareTokens 与 getOrCreateSessionSecret 确保会话令牌安全握手', () => {
      const currentSecret = getOrCreateSessionSecret();
      expect(typeof currentSecret).toBe('string');
      expect(currentSecret.length).toBe(64);

      // 错误 Token 比对失败
      expect(safeCompareTokens('wrong_token', currentSecret)).toBe(false);
      expect(safeCompareTokens(undefined, currentSecret)).toBe(false);

      // 正确 Token 比对成功
      expect(safeCompareTokens(currentSecret, currentSecret)).toBe(true);
    });
  });
});
