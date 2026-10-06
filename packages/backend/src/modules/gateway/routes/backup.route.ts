import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { BackupManager } from '../../library/backup-manager.js';
import { broadcastTaskProgress } from '../ws/broadcaster.js';

let latestBackupZipPath = '';

function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export const backupRoute: FastifyPluginAsync = async (fastify) => {
  const backupManager = new BackupManager();

  // 1. 触发曲库全量备份导出
  fastify.post('/api/backup/export', async (request, reply) => {
    const body = (request.body as { targetZipPath?: string; includeAudio?: boolean }) || {};
    const taskId = `backup_exp_${Date.now()}`;
    const targetZipPath = body.targetZipPath ? resolveHome(body.targetZipPath) : undefined;

    try {
      const result = await backupManager.exportBackup({
        targetZipPath,
        includeAudio: body.includeAudio,
        onProgress: (stage, percent, message) => {
          broadcastTaskProgress({
            taskId,
            stage,
            percent,
            message,
          });
        },
      });

      latestBackupZipPath = result.targetZipPath;

      return {
        success: true,
        data: result,
        downloadUrl: '/api/backup/download',
      };
    } catch (err) {
      reply.status(500).send({ error: `备份导出失败: ${(err as Error).message}` });
    }
  });

  // 2. 流式下载最新生成的备份压缩包 (.zip)
  fastify.get('/api/backup/download', async (_request, reply) => {
    if (!latestBackupZipPath || !fs.existsSync(latestBackupZipPath)) {
      return reply.status(404).send({ error: '暂无可下载的备份包，请先执行导出' });
    }

    const filename = path.basename(latestBackupZipPath);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(latestBackupZipPath);
    return reply.send(stream);
  });

  // 3. 从备份包恢复曲库
  fastify.post('/api/backup/import', async (request, reply) => {
    const body = request.body as { zipFilePath?: string; destinationAudioDir?: string };
    const targetZip = body?.zipFilePath ? resolveHome(body.zipFilePath) : '';

    if (!targetZip || !fs.existsSync(targetZip)) {
      return reply
        .status(400)
        .send({ error: `无效的备份包路径或文件不存在: ${body?.zipFilePath || ''}` });
    }

    const taskId = `backup_imp_${Date.now()}`;
    const destinationAudioDir = body.destinationAudioDir
      ? resolveHome(body.destinationAudioDir)
      : undefined;

    try {
      const result = await backupManager.importBackup(targetZip, {
        destinationAudioDir,
        onProgress: (stage, percent, message) => {
          broadcastTaskProgress({
            taskId,
            stage,
            percent,
            message,
          });
        },
      });

      return {
        success: true,
        data: result,
      };
    } catch (err) {
      reply.status(500).send({ error: `备份包恢复失败: ${(err as Error).message}` });
    }
  });
};
