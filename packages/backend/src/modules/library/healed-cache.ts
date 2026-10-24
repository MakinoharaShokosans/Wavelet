import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '@wavelet/shared';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';

export class HealedCacheManager {
  /**
   * 获取自愈缓存基准目录
   */
  getHealedDir(): string {
    const config = getConfig();
    return path.join(config.storage.cacheDir, 'healed');
  }

  /**
   * 计算指定曲目自愈缓存的确定性物理路径
   */
  getCachePath(trackId: string, ext = '.flac'): string {
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
    return path.join(this.getHealedDir(), `${trackId}${normalizedExt}`);
  }

  /**
   * 将临时自愈音频原子性持久化至缓存目录
   * 采用 renameSync 或跨设备回退 copyFileSync + unlinkSync
   */
  persist(trackId: string, tempFilePath: string, ext?: string): string {
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`待持久化的自愈临时文件不存在: ${tempFilePath}`);
    }

    const healedDir = this.getHealedDir();
    if (!fs.existsSync(healedDir)) {
      fs.mkdirSync(healedDir, { recursive: true });
    }

    const fileExt = ext || path.extname(tempFilePath) || '.flac';
    const targetPath = this.getCachePath(trackId, fileExt);

    try {
      // 优先尝试原子性重命名 (同文件系统下耗时 < 1ms)
      fs.renameSync(tempFilePath, targetPath);
    } catch {
      // 跨设备挂载或跨分区时回退为 copy + unlink
      fs.copyFileSync(tempFilePath, targetPath);
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // 忽略临时文件解链异常
      }
    }

    return targetPath;
  }

  /**
   * 快速定位或失效指定曲目的自愈缓存
   * 采用确定性物理探测替代 readdirSync 全量扫盘 (ISSUE-12)
   */
  findCacheFile(trackId: string): string | null {
    const healedDir = this.getHealedDir();
    if (!fs.existsSync(healedDir)) return null;

    const commonExts = ['.flac', '.wav', '.m4a', '.mp3', '.ogg', '.opus', '.ape'];
    for (const ext of commonExts) {
      const candidate = path.join(healedDir, `${trackId}${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * 使指定 trackId 的自愈缓存失效 (安全删除物理缓存文件)
   */
  invalidate(trackId: string): void {
    const cacheFile = this.findCacheFile(trackId);
    if (cacheFile && fs.existsSync(cacheFile)) {
      try {
        fs.unlinkSync(cacheFile);
        logger.debug({ trackId, cacheFile }, '[HealedCache] 已清除失效的自愈物理缓存');
      } catch (err) {
        logger.warn({ trackId, cacheFile, err }, '[HealedCache] 清除自愈物理缓存失败');
      }
    }
  }

  /**
   * 解析曲目的最终可播放物理路径
   * 若曲目处于 repaired 状态：
   * 1. 检查自愈缓存是否存在
   * 2. 检查母盘原始文件是否存在，若原始文件 mtime > 缓存 mtime，判定缓存过期失效并自动移除
   * 3. 若缓存有效，返回缓存物理路径
   * 否则回退返回 track.filePath
   */
  resolvePlayablePath(track: Track): string {
    if (track.healthyStatus === 'repaired') {
      const cachePath = this.findCacheFile(track.id);
      if (cachePath) {
        try {
          const cacheStat = fs.statSync(cachePath);
          if (fs.existsSync(track.filePath)) {
            const rawStat = fs.statSync(track.filePath);
            // 若原文件修改时间晚于缓存时间，说明源文件被外部改动，当前缓存失效
            if (rawStat.mtimeMs > cacheStat.mtimeMs) {
              logger.info(
                { trackId: track.id, rawMtime: rawStat.mtime, cacheMtime: cacheStat.mtime },
                '[HealedCache] 原物理文件发生改动，自愈缓存已过期，自动失效并回退原文件'
              );
              this.invalidate(track.id);
              return track.filePath;
            }
          }
          return cachePath;
        } catch {
          return track.filePath;
        }
      }
    }
    return track.filePath;
  }
}

export const healedCache = new HealedCacheManager();

/**
 * 兼容旧版调用的导出适配器
 */
export function resolvePlayableAudioPath(track: Track): string {
  return healedCache.resolvePlayablePath(track);
}
