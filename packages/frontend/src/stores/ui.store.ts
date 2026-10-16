import { create } from 'zustand';
import type { AppView, BreadcrumbItem, PlaylistViewMode } from '../types/view.js';

export interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'warn' | 'error' | 'success';
  durationMs?: number;
}

export interface UIState {
  currentView: AppView;
  previousView: AppView | null;
  isSidebarCollapsed: boolean;
  isQueueDrawerOpen: boolean;
  isBackupModalOpen: boolean;
  playlistViewMode: PlaylistViewMode;
  breadcrumbStack: BreadcrumbItem[];
  toasts: Toast[];

  navigate: (view: AppView) => void;
  goBack: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleQueueDrawer: () => void;
  setQueueDrawerOpen: (open: boolean) => void;
  setBackupModalOpen: (open: boolean) => void;
  setPlaylistViewMode: (mode: PlaylistViewMode) => void;
  pushBreadcrumb: (item: BreadcrumbItem) => void;
  popBreadcrumb: (toIndex?: number) => void;
  resetBreadcrumbs: () => void;
  showToast: (
    message: string,
    type?: 'info' | 'warn' | 'error' | 'success',
    durationMs?: number
  ) => void;
  dismissToast: (id: string) => void;
}

const initialBreadcrumb: BreadcrumbItem = {
  id: 'root',
  name: '曲库大厅',
  isFolder: true,
};

export const useUIStore = create<UIState>((set, get) => ({
  currentView: 'splash',
  previousView: null,
  isSidebarCollapsed: false,
  isQueueDrawerOpen: false,
  isBackupModalOpen: false,
  playlistViewMode: 'list',
  breadcrumbStack: [initialBreadcrumb],
  toasts: [],

  navigate: (view: AppView) => {
    const current = get().currentView;
    if (current === view) return;
    set({ previousView: current, currentView: view });
  },

  goBack: () => {
    const prev = get().previousView || 'carousel';
    set({ currentView: prev, previousView: null });
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }));
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ isSidebarCollapsed: collapsed });
  },

  toggleQueueDrawer: () => {
    set((state) => ({ isQueueDrawerOpen: !state.isQueueDrawerOpen }));
  },

  setQueueDrawerOpen: (open: boolean) => {
    set({ isQueueDrawerOpen: open });
  },

  setBackupModalOpen: (open: boolean) => {
    set({ isBackupModalOpen: open });
  },

  setPlaylistViewMode: (mode: PlaylistViewMode) => {
    set({ playlistViewMode: mode });
  },

  pushBreadcrumb: (item: BreadcrumbItem) => {
    set((state) => {
      // 避免重复追加
      if (state.breadcrumbStack.some((b) => b.id === item.id)) {
        return state;
      }
      return { breadcrumbStack: [...state.breadcrumbStack, item] };
    });
  },

  popBreadcrumb: (toIndex?: number) => {
    set((state) => {
      if (toIndex === undefined) {
        if (state.breadcrumbStack.length <= 1) return state;
        return { breadcrumbStack: state.breadcrumbStack.slice(0, -1) };
      }
      return { breadcrumbStack: state.breadcrumbStack.slice(0, toIndex + 1) };
    });
  },

  resetBreadcrumbs: () => {
    set({ breadcrumbStack: [initialBreadcrumb] });
  },

  showToast: (message: string, type = 'info', durationMs = 3500) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, durationMs }],
    }));
    if (durationMs > 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, durationMs);
    }
  },

  dismissToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export default useUIStore;
