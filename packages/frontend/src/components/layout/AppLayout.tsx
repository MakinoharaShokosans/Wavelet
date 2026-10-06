import type React from 'react';
import { BackupModal } from '../common/BackupModal.js';
import Breadcrumb from './Breadcrumb.js';
import Sidebar from './Sidebar.js';

export interface AppLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, showSidebar = true }) => {
  return (
    <div className="w-screen h-screen overflow-hidden flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* 弹性伸缩侧边栏 */}
      {showSidebar && <Sidebar />}

      {/* 主舞台视窗容器 */}
      <main className="flex-1 h-full flex flex-col overflow-hidden relative">
        {/* 顶部面包屑浮动栏 */}
        <header className="px-8 pt-6 pb-2 z-10">
          <Breadcrumb />
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
