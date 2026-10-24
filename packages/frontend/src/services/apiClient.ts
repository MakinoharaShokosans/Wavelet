import config from '../config/index.js';

/**
 * API 业务错误类型
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly rawResponse?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 内存中持久化维护的 Session Token 单例
 */
let sessionToken: string | null = null;
let sessionPromise: Promise<string> | null = null;

export const apiClient = {
  /**
   * 获取当前缓存的 Session Token
   */
  getToken(): string | null {
    return sessionToken;
  },

  /**
   * 手动设置 Session Token
   */
  setToken(token: string | null): void {
    sessionToken = token;
  },

  /**
   * 确保 Session Token 存在（若不存在则自动发起握手换取）
   */
  async ensureSession(): Promise<string> {
    if (sessionToken) {
      return sessionToken;
    }

    if (sessionPromise) {
      return sessionPromise;
    }

    sessionPromise = (async () => {
      try {
        const url = `${config.apiBaseUrl}/api/auth/token`;
        const savedKey =
          typeof window !== 'undefined'
            ? window.sessionStorage?.getItem('wavelet_access_key')
            : null;
        let headers: Record<string, string> = {};
        if (savedKey) {
          headers['x-wavelet-access-key'] = savedKey;
        }

        let res = await fetch(url, { method: 'GET', headers });
        if (!res.ok && res.status === 401 && typeof window !== 'undefined') {
          const errData = (await res.json().catch(() => ({}))) as { requiresAccessKey?: boolean };
          if (errData?.requiresAccessKey) {
            const enteredKey = window.prompt(
              '当前服务运行在非回环网络环境下，请输入 WAVELET_ACCESS_KEY 进行访问认证：'
            );
            if (enteredKey) {
              window.sessionStorage?.setItem('wavelet_access_key', enteredKey);
              headers = { 'x-wavelet-access-key': enteredKey };
              res = await fetch(url, { method: 'GET', headers });
            }
          }
        }
        if (!res.ok) {
          throw new ApiError(res.status, '获取会话令牌失败');
        }
        const data = (await res.json()) as { token: string };
        sessionToken = data.token;
        return data.token;
      } finally {
        sessionPromise = null;
      }
    })();

    return sessionPromise;
  },

  /**
   * 统一网络请求封装（带自动 Token 注入与 401 自动重试）
   */
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.ensureSession();

    const headers = new Headers(options.headers || {});
    if (!headers.has('x-wavelet-session')) {
      headers.set('x-wavelet-session', token);
    }
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const fullUrl = path.startsWith('http') ? path : `${config.apiBaseUrl}${path}`;

    let res = await fetch(fullUrl, {
      ...options,
      headers,
    });

    // 若 Token 失效返回 401，尝试刷新一次 Token 并重试
    if (res.status === 401) {
      sessionToken = null;
      const newToken = await this.ensureSession();
      headers.set('x-wavelet-session', newToken);
      res = await fetch(fullUrl, {
        ...options,
        headers,
      });
    }

    if (!res.ok) {
      let errMsg = `请求失败: ${res.status} ${res.statusText}`;
      try {
        const errJson = (await res.json()) as { error?: string; message?: string };
        errMsg = errJson.error || errJson.message || errMsg;
      } catch {
        // 忽略非 JSON 响应解析错误
      }
      throw new ApiError(res.status, errMsg);
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return (await res.json()) as T;
  },

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  },

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
  },

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  async del<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  },

  /**
   * 构造带 Token 的原生音频流播放直连 URL
   */
  getAudioStreamUrl(trackId: string): string {
    const token = this.getToken() || '';
    return `${config.apiBaseUrl}/api/stream/${encodeURIComponent(trackId)}?token=${encodeURIComponent(token)}`;
  },

  /**
   * 构造带 Token 的歌单封面图片直连 URL
   */
  getCoverUrl(playlistId: string, timestamp?: number): string {
    const token = this.getToken() || '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (timestamp) params.set('t', timestamp.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return `${config.apiBaseUrl}/api/playlists/${encodeURIComponent(playlistId)}/cover${query}`;
  },

  /**
   * 构造带 Token 的曲目封面图片直连 URL
   */
  getTrackCoverUrl(trackId: string, timestamp?: number): string {
    const token = this.getToken() || '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (timestamp) params.set('t', timestamp.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return `${config.apiBaseUrl}/api/tracks/${encodeURIComponent(trackId)}/cover${query}`;
  },
};

export default apiClient;
