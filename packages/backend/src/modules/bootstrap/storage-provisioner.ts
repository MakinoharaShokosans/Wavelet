import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../../config/index.js';
import { logger } from './logger.js';

export interface StorageTopology {
  dataDir: string;
  libraryDir: string;
  quarantineDir: string;
  cacheDir: string;
  coversDir: string;
  healedDir: string;
  tempDir: string;
  logsDir: string;
}

/**
 * 幂等初始化 Wavelet 本地存储目录拓扑
 * 若目录不存在则递归创建，并校验磁盘可写权限
 */
export function provisionStorage(): StorageTopology {
  const config = getConfig();

  const topology: StorageTopology = {
    dataDir: config.storage.dataDir,
    libraryDir: config.storage.libraryDir,
    quarantineDir: config.storage.quarantineDir,
    cacheDir: config.storage.cacheDir,
    coversDir: path.join(config.storage.cacheDir, 'covers'),
    healedDir: path.join(config.storage.cacheDir, 'healed'),
    tempDir: path.join(config.storage.cacheDir, 'temp'),
    logsDir: config.storage.logsDir,
  };

  const directories = Object.values(topology);

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        logger.info({ dir }, '[StorageProvisioner] 创建目录拓扑节点成功');
      } catch (err) {
        logger.error({ dir, err }, '[StorageProvisioner] 创建目录失败，请检查文件系统权限');
        throw new Error(`无法创建本地目录 ${dir}: ${(err as Error).message}`);
      }
    }

    // 校验可写权限
    try {
      fs.accessSync(dir, fs.constants.W_OK | fs.constants.R_OK);
    } catch (err) {
      logger.error({ dir, err }, '[StorageProvisioner] 目录无读写权限');
      throw new Error(`目录 ${dir} 缺少读写权限`);
    }
  }

  return topology;
}
