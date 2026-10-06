import fs from 'node:fs';
import path from 'node:path';
import type { Track } from '@wavelet/shared';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig, resolveHome } from '../../../config/index.js';
import {
  findAudioFilesRecursively,
  processSingleAudioFile,
  syncMusicsDirectory,
} from '../../library/musics-syncer.js';
import { PlaylistRepository } from '../../library/repositories/playlist.repository.js';
import { TrackRepository } from '../../library/repositories/track.repository.js';
import { broadcastTaskProgress } from '../ws/broadcaster.js';

export const importRoute: FastifyPluginAsync = async (fastify) => {
  const trackRepo = new TrackRepository();
  const playlistRepo = new PlaylistRepository();

  // 1. 获取当前曲库专属物理目录路径
  fastify.get('/api/import/library-dir', async () => {
    const config = getConfig();
    return { libraryDir: config.storage.libraryDir };
  });

  // 2. 原地一键同步工程根目录 musics/ 专属曲库
  fastify.post('/api/import/musics', async () => {
    const config = getConfig();
    const result = await syncMusicsDirectory(config.storage.libraryDir);
    return {
      success: true,
      libraryDir: config.storage.libraryDir,
      totalScanned: result.scanned,
      importedCount: result.imported,
      tracks: result.tracks,
    };
  });

  // 3. 目录文件夹递归批量导入 (兼容任意自定义目录)
  fastify.post('/api/import/directory', async (request, reply) => {
    const body = request.body as { directoryPath?: string };
    const targetDir = body?.directoryPath ? resolveHome(body.directoryPath) : '';
    if (!targetDir || !fs.existsSync(targetDir)) {
      return reply
        .status(400)
        .send({ error: `无效的目录路径或目录不存在: ${body?.directoryPath || ''}` });
    }

    const audioFiles = findAudioFilesRecursively(targetDir);
    if (audioFiles.length === 0) {
      return reply.status(400).send({ error: '指定目录下未找到支持的音频文件' });
    }

    const dirTaskId = `dir_${Date.now()}`;
    const importedTracks: Track[] = [];
    const errors: { filePath: string; error: string }[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const filePath = audioFiles[i];
      broadcastTaskProgress({
        taskId: dirTaskId,
        stage: 'directory_scanning',
        percent: Math.round(((i + 1) / audioFiles.length) * 100),
        message: `正在原地索引 (${i + 1}/${audioFiles.length}): ${path.basename(filePath)}`,
      });

      const res = await processSingleAudioFile(
        filePath,
        trackRepo,
        playlistRepo,
        `${dirTaskId}_${i}`
      );
      if (res.track) {
        importedTracks.push(res.track);
      } else if (res.error) {
        errors.push({ filePath, error: res.error });
      }
    }

    return {
      success: true,
      directory: body.directoryPath,
      totalScanned: audioFiles.length,
      importedCount: importedTracks.length,
      tracks: importedTracks,
      errors,
    };
  });
};
