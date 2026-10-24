import path from 'node:path';
import type { Track } from '@wavelet/shared';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig, resolveHome } from '../../../config/index.js';
import {
  findAudioFilesRecursively,
  processSingleAudioFile,
  syncMusicsDirectory,
} from '../../library/musics-syncer.js';
import { assertRootRegistrable } from '../../library/path-guard.js';
import { LibraryRootRepository } from '../../library/repositories/library-root.repository.js';
import { PlaylistRepository } from '../../library/repositories/playlist.repository.js';
import { TrackRepository } from '../../library/repositories/track.repository.js';
import { broadcastTaskProgress } from '../ws/broadcaster.js';

export const importRoute: FastifyPluginAsync = async (fastify) => {
  const trackRepo = new TrackRepository();
  const playlistRepo = new PlaylistRepository();
  const libraryRootRepo = new LibraryRootRepository();

  // 1. 获取当前曲库专属物理目录路径
  fastify.get('/api/import/library-dir', async () => {
    const config = getConfig();
    return { libraryDir: config.storage.libraryDir };
  });

  // 2. 原地一键同步工程根目录 musics/ 专属曲库
  fastify.post('/api/import/musics', async (request) => {
    const body = (request.body as { force?: boolean; resyncMetadata?: boolean } | undefined) || {};
    const config = getConfig();
    const result = await syncMusicsDirectory(config.storage.libraryDir, {
      force: body.force,
      resyncMetadata: body.resyncMetadata,
    });
    return {
      success: !result.circuitBreakerTriggered,
      circuitBreakerTriggered: !!result.circuitBreakerTriggered,
      message: result.circuitBreakerTriggered
        ? '扫描目录为空但数据库存量曲目 > 0，已触发防灾熔断保护，未作任何修改'
        : undefined,
      libraryDir: config.storage.libraryDir,
      totalScanned: result.scanned,
      importedCount: result.imported,
      refreshedCount: result.refreshed,
      tracks: result.tracks,
    };
  });

  // 3. 目录文件夹递归批量导入 (兼容任意自定义目录)
  fastify.post('/api/import/directory', async (request, reply) => {
    const body = request.body as { directoryPath?: string };
    const targetDir = body?.directoryPath ? resolveHome(body.directoryPath) : '';
    const config = getConfig();

    try {
      assertRootRegistrable(targetDir, config.storage.dataDir);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }

    const audioFiles = findAudioFilesRecursively(targetDir);
    if (audioFiles.length === 0) {
      return reply.status(400).send({ error: '指定目录下未找到支持的音频文件' });
    }

    // 登记持久化曲库根 (ISSUE-11)
    libraryRootRepo.upsertRoot(targetDir, 'imported');

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

  // 4. 获取所有注册的曲库根目录
  fastify.get('/api/import/roots', async () => {
    return { roots: libraryRootRepo.getAllRoots() };
  });

  // 5. 移除已导入的曲库根目录 (保护主曲库不被误删)
  fastify.delete('/api/import/roots', async (request, reply) => {
    const body = request.body as { path?: string };
    if (!body?.path) {
      return reply.status(400).send({ error: '缺少待移除的根目录路径参数 path' });
    }
    const resolvedPath = path.resolve(resolveHome(body.path));
    const root = libraryRootRepo.getRoot(resolvedPath);
    if (!root) {
      return reply.status(404).send({ error: '指定的曲库根目录未找到' });
    }
    if (root.kind === 'primary') {
      return reply.status(400).send({ error: '主曲库根目录禁止移除' });
    }
    libraryRootRepo.deleteRoot(resolvedPath);
    return { success: true, removedPath: resolvedPath };
  });
};
