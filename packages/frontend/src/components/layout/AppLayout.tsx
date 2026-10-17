import type React from 'react';
import { useState } from 'react';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { BackupModal } from '../common/BackupModal.js';
import { SvgIcons } from '../common/SvgIcons.js';
import Breadcrumb from './Breadcrumb.js';
import Sidebar from './Sidebar.js';

export interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, showSidebar = true }) => {
  const { syncMusicsDirectory } = useLibraryStore();
  const { showToast } = useUIStore();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleGlobalSync = async () => {
    try {
      setIsSyncing(true);
      const res = await syncMusicsDirectory(true);
      if (res.circuitBreakerTriggered) {
        showToast(res.message || '扫描目录为空，已触发防灾熔断', 'warn');
      } else {
        showToast(
          `曲库刷新完成：在席 ${res.imported} 首，热更新标签 ${res.refreshed} 首`,
          'success'
        );
      }
    } catch {
      showToast('刷新曲库失败，请检查网络或后端服务', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* 弹性伸缩侧边栏 */}
      {showSidebar && <Sidebar />}

      {/* 主舞台视窗容器 */}
      <main className="flex-1 h-full flex flex-col overflow-hidden relative">
        {/* 顶部常驻浮动导航栏 */}
        <header className="px-8 pt-5 pb-2 z-10 flex items-center justify-between min-h-[48px]">
          <div className="flex-1 min-w-0">
            <Breadcrumb />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleGlobalSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 backdrop-blur-md text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs font-semibold hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-all cursor-pointer shadow-[var(--shadow-xs)] disabled:opacity-50"
              title="重新扫描本地 musics 目录并热刷新标签与封面"
            >
              <span
                className={
                  isSyncing
                    ? 'animate-spin flex items-center text-[var(--accent-mint)]'
                    : 'flex items-center'
                }
              >
                <SvgIcons name="refresh" size={13} />
              </span>
              <span>{isSyncing ? '正在刷新...' : '刷新曲库'}</span>
            </button>
          </div>
        </header>

        {/* 核心内容区 */}
        <div className="flex-1 w-full h-full overflow-hidden relative">{children}</div>
      </main>

      {/* 曲库备份与跨机器迁移弹窗 */}
      <BackupModal />
    </div>
  );
};

export default AppLayout;

