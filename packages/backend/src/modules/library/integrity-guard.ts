import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';
import { TrackRepository } from './repositories/track.repository.js';

export interface IntegrityAuditResult {
  totalChecked: number;
  missingCount: number;
  missingTrackIds: string[];
}

export class IntegrityGuard {
  private trackRepo: TrackRepository;

  constructor(trackRepo?: TrackRepository) {
    this.trackRepo = trackRepo || new TrackRepository();
  }

  /**
   * 启动快速断链巡检 (幽灵曲目探测)
   * 快速比对数据库中的物理路径与磁盘实际存在性
   */
  auditMissingFiles(): IntegrityAuditResult {
    const allTracks = this.trackRepo.getAllFilePaths();
    const missingTrackIds: string[] = [];

    for (const { id, filePath } of allTracks) {
      if (!fs.existsSync(filePath)) {
        this.trackRepo.update(id, { healthyStatus: 'missing' });
        missingTrackIds.push(id);
      }
    }

    if (missingTrackIds.length > 0) {
      logger.warn(
        { count: missingTrackIds.length, missingTrackIds },
        '[IntegrityGuard] 巡检查出外部物理断链曲目，已标记为 MISSING 状态'
      );
    } else {
      logger.info(
        { totalChecked: allTracks.length },
        '[IntegrityGuard] 曲库完整性巡检通过，未发现断链'
      );
    }

    return {
      totalChecked: allTracks.length,
      missingCount: missingTrackIds.length,
      missingTrackIds,
    };
  }

  /**
   * 级联彻底删除曲目
   * 1. 物理移除音频文件
   * 2. 移除封面 WebP 缩略图缓存
   * 3. 级联删除 SQLite 数据与歌单关联
   */
  purgeTrackCompletely(trackId: string): boolean {
    const track = this.trackRepo.findById(trackId);
    if (!track) return false;

    // 1. 删除物理音频文件
    if (fs.existsSync(track.filePath)) {
      try {
        fs.unlinkSync(track.filePath);
        logger.info({ filePath: track.filePath }, '[IntegrityGuard] 物理音频文件已彻底擦除');
      } catch (err) {
        logger.error({ filePath: track.filePath, err }, '[IntegrityGuard] 物理音频文件删除失败');
      }
    }

    // 2. 删除内嵌封面缓存
    const config = getConfig();
    const coverPath = path.join(config.storage.cacheDir, 'covers', `${track.fileHash}.webp`);
    if (fs.existsSync(coverPath)) {
      try {
        fs.unlinkSync(coverPath);
      } catch {
        // 忽略封面删除失败
      }
    }

    // 3. 删除数据库记录 (SQLite 级联外键自动清除 playlist_tracks 与 lyrics)
    return this.trackRepo.delete(trackId);
  }

  /**
   * 清理上次非正常退出遗留的临时自愈切片
   */
  cleanTempDirectory(): number {
    const config = getConfig();
    const tempDir = path.join(config.storage.cacheDir, 'temp');

    if (!fs.existsSync(tempDir)) return 0;

    let cleaned = 0;
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        const fullPath = path.join(tempDir, file);
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleaned++;
      }
      if (cleaned > 0) {
        logger.info({ cleaned }, '[IntegrityGuard] 清理遗留临时切片文件成功');
      }
    } catch (err) {
      logger.warn({ err }, '[IntegrityGuard] 清理临时目录时发生轻微异常');
    }

    return cleaned;
  }
}
