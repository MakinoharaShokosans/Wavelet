import { AnimatePresence } from 'motion/react';
import type React from 'react';
import { useEffect } from 'react';
import CarouselStage from './components/carousel/CarouselStage.js';
import ToastContainer from './components/common/ToastContainer.js';
import AppLayout from './components/layout/AppLayout.js';
import FloatingPlayerDock from './components/player/FloatingPlayerDock.js';
import PlayQueueDrawer from './components/player/PlayQueueDrawer.js';
import PlayerStage from './components/player/PlayerStage.js';
import PlaylistDetailView from './components/playlist/PlaylistDetailView.js';
import SplashView from './components/splash/SplashView.js';
import ZeroStateView from './components/splash/ZeroStateView.js';
import { useWaveletWs } from './hooks/useWaveletWs.js';
import { useLibraryStore } from './stores/library.store.js';
import { usePlayerStore } from './stores/player.store.js';
import { useUIStore } from './stores/ui.store.js';
import type { Track } from './types/index.js';

export default function App(): React.JSX.Element {
  const { currentView, showToast } = useUIStore();
  const { initPlayer, syncPlayback, syncQueue, togglePlayPause } = usePlayerStore();

  // 1. 初始化播放器底层状态
  useEffect(() => {
    initPlayer();
  }, [initPlayer]);

  // 2. 挂载全局 WebSocket 60fps 时钟与队列广播监听
  useWaveletWs({
    onPlaybackSync: (sync) => {
      syncPlayback(sync);
    },
    onPlaybackMissing: (missing) => {
      const songTitle = missing.title || '当前曲目';
      const msg = missing.autoSkipped
        ? `《${songTitle}》物理文件已在磁盘丢失，已自动跳过`
        : `《${songTitle}》物理文件已在磁盘丢失，已停止播放`;
      showToast(msg, 'warn');
      if (missing.trackId) {
        useLibraryStore.getState().markTrackMissing(missing.trackId);
      }
    },
    onQueue: (queueData) => {
      if (Array.isArray(queueData.queue)) {
        syncQueue(queueData.queue as Track[], queueData.currentIndex);
      }
    },
  });

  // 3. 全局空格键切歌监听 (当光标未在输入框中时生效)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  // 4. 视图状态机分流渲染
  const renderCurrentView = () => {
    switch (currentView) {
      case 'splash':
        return <SplashView />;

      case 'zero':
        return (
          <AppLayout showSidebar={false}>
            <ZeroStateView />
          </AppLayout>
        );

      case 'carousel':
        return (
          <AppLayout>
            <CarouselStage />
            <FloatingPlayerDock />
            <PlayQueueDrawer />
          </AppLayout>
        );

      case 'playlist-detail':
        return (
          <AppLayout>
            <PlaylistDetailView />
            <FloatingPlayerDock />
            <PlayQueueDrawer />
          </AppLayout>
        );

      case 'player-stage':
        return <PlayerStage />;

      default:
        return <SplashView />;
    }
  };

  return (
    <div className="w-screen h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden font-sans select-none">
      <AnimatePresence mode="wait">{renderCurrentView()}</AnimatePresence>
      <ToastContainer />
    </div>
  );
}
