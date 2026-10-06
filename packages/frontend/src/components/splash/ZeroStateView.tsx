import { motion } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useWaveletWs } from '../../hooks/useWaveletWs.js';
import { importService } from '../../services/import.service.js';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { SvgIcons } from '../common/SvgIcons.js';

export const ZeroStateView: React.FC = () => {
  const { fetchPlaylists, fetchPlaylistTree, refreshStats } = useLibraryStore();
  const { navigate, setBackupModalOpen } = useUIStore();

  const [libraryDir, setLibraryDir] = useState<string>('musics');
  const [isCopied, setIsCopied] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    importService
      .getLibraryDir()
      .then((res) => {
        if (mounted && res.libraryDir) {
          setLibraryDir(res.libraryDir);
        }
      })
      .catch(() => {
        // 网络异常降级
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 监听 WebSocket 推送的任务原地扫描与自愈进度
  useWaveletWs({
    onTaskProgress: (data) => {
      setIsImporting(true);
      setProgressPercent(data.percent);
      setProgressStage(data.stage);
      if (data.message) {
        setCurrentFile(data.message);
      }
    },
  });

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(libraryDir);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // 容灾忽略
    }
  };

  const handleScanMusics = async () => {
    setIsImporting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setProgressPercent(10);
    setProgressStage('正在扫描 musics 目录...');

    try {
      const res = await importService.scanMusics();

      if (res.importedCount > 0) {
        setProgressPercent(100);
        setProgressStage(`原地索引完成！已录入 ${res.importedCount} 首曲目`);

        setTimeout(async () => {
          await Promise.all([fetchPlaylists(), fetchPlaylistTree(), refreshStats()]);
          navigate('carousel');
        }, 1000);
      } else {
        setIsImporting(false);
        setProgressPercent(0);
        setProgressStage('');
        setInfoMessage('未在 musics 目录下检测到音频文件。请放入音乐后再试。');
      }
    } catch (err) {
      setIsImporting(false);
      setErrorMessage((err as Error).message || '扫描目录失败，请确认 musics 目录权限正常');
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-canvas)] select-none px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full flex flex-col items-center text-center"
      >
        {/* 极简几何音乐微符 */}
        <div className="w-14 h-14 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] mb-6 shadow-[var(--shadow-xs)]">
          <SvgIcons name="music" size={28} />
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] mb-2">
          曲库暂无音乐
        </h2>
        <p className="text-xs text-[var(--text-secondary)] max-w-sm mb-6 leading-relaxed">
          Wavelet 已启用便携式一体化曲库，仅识别项目根目录{' '}
          <code className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-primary)] font-mono text-[11px]">
            musics
          </code>{' '}
          内的音频文件
        </p>

        {/* 导入进度状态条 */}
        {isImporting ? (
          <div className="w-full space-y-3 p-5 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
              <span>{progressStage || '正在就地索引音频...'}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--text-primary)] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {currentFile && (
              <p className="text-[11px] text-[var(--text-tertiary)] truncate text-left font-mono">
                {currentFile}
              </p>
            )}
          </div>
        ) : (
          <div className="w-full space-y-4">
            {/* 音乐物理目录展示卡片 */}
            <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-left space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                <span className="flex items-center gap-1.5">
                  <SvgIcons name="folder" size={14} />
                  音乐存放目录
                </span>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <>
                      <SvgIcons name="check" size={12} />
                      已复制
                    </>
                  ) : (
                    '复制路径'
                  )}
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--bg-elevated)] text-xs font-mono text-[var(--text-primary)] break-all select-all border border-[var(--border-subtle)]">
                {libraryDir}
              </div>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-normal">
                请将 FLAC、WAV、MP3 等音频文件放入上方目录中（支持多级子文件夹组织）。
              </p>
            </div>

            {/* 提示信息 */}
            {infoMessage && (
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 text-xs border border-amber-500/20 text-left">
                {infoMessage}
              </div>
            )}

            {/* 错误信息 */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500 text-xs border border-red-500/20 text-left">
                {errorMessage}
              </div>
            )}

            {/* 操作主按钮 */}
            <button
              type="button"
              onClick={handleScanMusics}
              className="w-full py-2.5 rounded-xl bg-[var(--text-primary)] text-[var(--bg-canvas)] text-xs font-medium hover:opacity-90 active:scale-[0.99] transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <SvgIcons name="wave" size={16} />
              立即扫描 musics 目录
            </button>

            {/* 分割线与备份恢复入口 */}
            <div className="pt-2 flex items-center justify-center gap-4 text-xs">
              <span className="text-[var(--text-tertiary)]">或者从另一台电脑迁移？</span>
              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] hover:underline cursor-pointer"
              >
                <SvgIcons name="archive" size={14} />
                从备份包还原 (.zip)
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ZeroStateView;
