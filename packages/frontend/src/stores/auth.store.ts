import { create } from 'zustand';
import apiClient from '../services/apiClient.js';
import wsClient from '../services/websocket.js';

export interface AuthState {
  token: string | null;
  isConnected: boolean;
  isAuthenticating: boolean;
  error: string | null;

  /**
   * 确保会话令牌建立并启动长连接
   */
  authenticate: () => Promise<string>;
  /**
   * 更新 WebSocket 网络连通状态
   */
  setConnected: (connected: boolean) => void;
  /**
   * 退出/重置会话
   */
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  isConnected: false,
  isAuthenticating: false,
  error: null,

  authenticate: async () => {
    if (get().token) {
      return get().token as string;
    }

    set({ isAuthenticating: true, error: null });
    try {
      const token = await apiClient.ensureSession();
      set({ token, isAuthenticating: false });

      // 握手成功后自动连接 WebSocket
      if (!wsClient.isConnected()) {
        wsClient.connect();
      }

      return token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '认证失败';
      set({ error: msg, isAuthenticating: false });
      throw err;
    }
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  logout: () => {
    apiClient.setToken(null);
    wsClient.disconnect();
    set({ token: null, isConnected: false, error: null });
  },
}));

export default useAuthStore;
