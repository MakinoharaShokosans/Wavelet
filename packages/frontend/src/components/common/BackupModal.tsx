import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import { useWaveletWs } from '../../hooks/useWaveletWs.js';
import { backupService } from '../../services/backup.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { SvgIcons } from './SvgIcons.js';

export const BackupModal: React.FC = () => {
  const { isBackupModalOpen, setBackupModalOpen, navigate } = useUIStore();
  const { fetchPlaylists, fetchPlaylistTree, refreshStats } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // 导出表单与状态
  const [exportPath, setExportPath] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    percent: number;
    stage: string;
    message: string;
  } | null>(null);
  const [exportResult, setExportResult] = useState<{
    targetZipPath: string;
    fileSize: number;
    trackCount: number;
    playlistCount: number;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // 还原表单与状态
  const [importZipPath, setImportZipPath] = useState('');
  const [destAudioDir, setDestAudioDir] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    percent: number;
    stage: string;
    message: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    restoredTracks: number;
    restoredPlaylists: number;
    destinationAudioDir: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // 监听 WebSocket 实时进度广播
  useWaveletWs({
    onTaskProgress: (data) => {
      if (data.taskId.startsWith('backup_exp_')) {
        setExportProgress({
          percent: data.percent,
          stage: data.stage,
          message: data.message || '',
        });
      } else if (data.taskId.startsWith('backup_imp_')) {
        setImportProgress({
          percent: data.percent,
          stage: data.stage,
          message: data.message || '',
        });
      }
    },
  });

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportResult(null);
    setExportProgress({ percent: 5, stage: 'initializing', message: '正在初始化全量曲库备份...' });

    try {
      const res = await backupService.exportBackup({
        targetZipPath: exportPath.trim() || undefined,
        includeAudio,
      });

      if (res.success && res.data) {
        setExportResult(res.data);
      }
    } catch (err) {
      setExportError((err as Error).message || '导出过程出现异常');
    } finally {
      setIsExporting(false);
    }
  };

  const handleStartImport = async () => {
    if (!importZipPath.trim()) {
      setImportError('请输入备份包 (.zip) 的本地物理路径');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);
    setImportProgress({ percent: 5, stage: 'initializing', message: '准备校验并解压备份包...' });

    try {
      const res = await backupService.importBackup({
        zipFilePath: importZipPath.trim(),
        destinationAudioDir: destAudioDir.trim() || undefined,
      });

      if (res.success && res.data) {
        setImportResult(res.data);
        await Promise.all([fetchPlaylists(), fetchPlaylistTree(), refreshStats()]);
      }
    } catch (err) {
      setImportError((err as Error).message || '恢复备份失败，请核对文件路径与完整性');
    } finally {
      setIsImporting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
  };

  const handleFinishAndNavigate = () => {
    setBackupModalOpen(false);
    navigate('carousel');
  };

  return (
    <AnimatePresence>
      {isBackupModalOpen && (
        <motion.div
          key="backup-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm select-none"
          onClick={() => (!isExporting && !isImporting ? setBackupModalOpen(false) : null)}
        >
          {/* 极简白质弹窗卡片 */}
          <motion.div
            key="backup-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={springMotion.stiff}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-[var(--shadow-hover)] border border-[var(--border-subtle)] z-10 flex flex-col max-h-[90vh] overflow-y-auto scrollbar-none"
          >
            {/* 顶部标题与关闭按钮 */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-primary)]">
                  <SvgIcons name="archive" size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">导入导出</h3>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    导出曲库与歌单，或从备份包恢复
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isExporting || isImporting}
                onClick={() => setBackupModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-30 cursor-pointer"
              >
                <SvgIcons name="close" size={18} />
              </button>
            </div>

            {/* 切换 Tab */}
            <div className="flex p-1 bg-[var(--bg-subtle)] rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('export')}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'export'
                    ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                导出 (.zip)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'import'
                    ? 'bg-white text-[var(--text-primary)] shadow-[var(--shadow-xs)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                导入 (.zip)
              </button>
            </div>

            {/* 导出区域 */}
            {activeTab === 'export' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="exportPathInput"
                    className="text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    导出文件保存路径 (可选)
                  </label>
                  <input
                    id="exportPathInput"
                    type="text"
                    value={exportPath}
                    disabled={isExporting}
                    onChange={(e) => setExportPath(e.target.value)}
                    placeholder="留空默认导出至 ~/Wavelet_Backup_时间.zip"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:bg-[var(--bg-subtle)]"
                  />
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                  <input
                    type="checkbox"
                    id="includeAudioCheck"
                    checked={includeAudio}
                    disabled={isExporting}
                    onChange={(e) => setIncludeAudio(e.target.checked)}
                    className="rounded border-[var(--border-subtle)] text-[var(--text-primary)] focus:ring-0 cursor-pointer"
                  />
                  <label
                    htmlFor="includeAudioCheck"
                    className="text-xs text-[var(--text-primary)] cursor-pointer select-none"
                  >
                    <span className="font-semibold">打包全部物理音频母带</span>
                    <span className="text-[var(--text-tertiary)] ml-1.5 block text-[11px]">
                      启用后将同时压缩全部本地无损音频，方便整体迁移至全新设备
                    </span>
                  </label>
                </div>

                {exportError && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-100">
                    {exportError}
                  </div>
                )}

                {/* 导出进度条 */}
                {isExporting && exportProgress && (
                  <div className="space-y-2 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
                      <span>{exportProgress.stage}</span>
                      <span>{exportProgress.percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--text-primary)] rounded-full transition-all duration-200"
                        style={{ width: `${exportProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                      {exportProgress.message}
                    </p>
                  </div>
                )}

                {/* 导出成功结果卡片 */}
                {exportResult && (
                  <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      曲库全量备份已就绪！
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] space-y-1">
                      <div>
                        曲目数：
                        <span className="font-medium text-[var(--text-primary)]">
                          {exportResult.trackCount} 首
                        </span>
                      </div>
                      <div>
                        歌单数：
                        <span className="font-medium text-[var(--text-primary)]">
                          {exportResult.playlistCount} 个
                        </span>
                      </div>
                      <div>
                        包大小：
                        <span className="font-medium text-[var(--text-primary)]">
                          {formatBytes(exportResult.fileSize)}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-tertiary)] pt-1">
                        路径：{exportResult.targetZipPath}
                      </div>
                    </div>
                    <a
                      href={backupService.getDownloadUrl()}
                      download
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-medium shadow-sm hover:opacity-95 transition-opacity"
                    >
                      <SvgIcons name="download" size={16} />
                      立即流式下载备份包 (.zip)
                    </a>
                  </div>
                )}

                {!exportResult && (
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleStartExport}
                    className="w-full py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-medium shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isExporting ? '正在打包中...' : '开始导出曲库备份'}
                  </button>
                )}
              </div>
            )}

            {/* 还原恢复区域 */}
            {activeTab === 'import' && (
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="importZipPathInput"
                    className="text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    备份包本地物理路径 (.zip) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="importZipPathInput"
                    type="text"
                    value={importZipPath}
                    disabled={isImporting}
                    onChange={(e) => setImportZipPath(e.target.value)}
                    placeholder="例如：~/Downloads/Wavelet_Backup_2026.zip"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:bg-[var(--bg-subtle)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="destAudioDirInput"
                    className="text-xs font-semibold text-[var(--text-secondary)]"
                  >
                    解压目标音乐目录 (可选)
                  </label>
                  <input
                    id="destAudioDirInput"
                    type="text"
                    value={destAudioDir}
                    disabled={isImporting}
                    onChange={(e) => setDestAudioDir(e.target.value)}
                    placeholder="留空默认解压至 ~/Music/Wavelet_Library"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:bg-[var(--bg-subtle)]"
                  />
                </div>

                {importError && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-100">
                    {importError}
                  </div>
                )}

                {/* 导入进度条 */}
                {isImporting && importProgress && (
                  <div className="space-y-2 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
                      <span>{importProgress.stage}</span>
                      <span>{importProgress.percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--text-primary)] rounded-full transition-all duration-200"
                        style={{ width: `${importProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                      {importProgress.message}
                    </p>
                  </div>
                )}

                {/* 还原成功结果卡片 */}
                {importResult && (
                  <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      曲库全量还原与重映射成功！
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] space-y-1">
                      <div>
                        已恢复曲目：
                        <span className="font-medium text-[var(--text-primary)]">
                          {importResult.restoredTracks} 首
                        </span>
                      </div>
                      <div>
                        已恢复歌单：
                        <span className="font-medium text-[var(--text-primary)]">
                          {importResult.restoredPlaylists} 个
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-tertiary)] pt-1">
                        物理存放位置：{importResult.destinationAudioDir}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleFinishAndNavigate}
                      className="w-full py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-medium shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
                    >
                      进入曲库
                    </button>
                  </div>
                )}

                {!importResult && (
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={handleStartImport}
                    className="w-full py-2.5 rounded-xl bg-[var(--text-primary)] text-white text-xs font-medium shadow-sm hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isImporting ? '正在恢复曲库中...' : '开始还原备份包'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BackupModal;
