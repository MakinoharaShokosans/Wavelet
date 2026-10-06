import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { IntegrityGuard } from '../../library/integrity-guard.js';
import { PlaylistRepository } from '../../library/repositories/playlist.repository.js';
import { TrackRepository } from '../../library/repositories/track.repository.js';

export const playlistsRoute: FastifyPluginAsync = async (fastify) => {
  const playlistRepo = new PlaylistRepository();
  const trackRepo = new TrackRepository();
  const integrityGuard = new IntegrityGuard(trackRepo);

  // 1. 获取歌单完整目录树 (嵌套结构)
  fastify.get('/api/playlists/tree', async () => {
    return playlistRepo.findTree();
  });

  // 2. 获取所有歌单列表 (支持按 parentId 过滤)
  fastify.get('/api/playlists', async (request) => {
    const query = request.query as { parentId?: string; rootOnly?: string };
    if (query.rootOnly === 'true' || query.parentId === 'null') {
      return playlistRepo.findByParentId(null);
    }
    if (query.parentId) {
      return playlistRepo.findByParentId(query.parentId);
    }
    return playlistRepo.findAll();
  });

  // 3. 创建新歌单或分类目录文件夹
  fastify.post('/api/playlists', async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      parentId?: string | null;
      isFolder?: boolean;
    };
    if (!body?.name) {
      return reply.status(400).send({ error: '歌单名称不能为空' });
    }
    try {
      return playlistRepo.create(body.name, body.description, {
        parentId: body.parentId,
        isFolder: body.isFolder,
      });
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 4. 获取单歌单详情及内含曲目 (支持 recursive 递归子孙曲目与 breadcrumbs 面包屑)
  fastify.get('/api/playlists/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { recursive?: string };
    const playlist = playlistRepo.findById(id);
    if (!playlist) {
      return reply.status(404).send({ error: '歌单不存在' });
    }
    const isRecursive = query.recursive === 'true';
    const tracks = playlistRepo.getPlaylistTracks(id, isRecursive);
    const children = playlistRepo.findByParentId(id);
    const breadcrumbs = playlistRepo.getBreadcrumbs(id);
    return {
      ...playlist,
      tracks: tracks.map((t) => ({ ...t, isFavorite: playlistRepo.isFavorite(t.id) })),
      children,
      breadcrumbs,
    };
  });

  // 5. 获取歌单内部挂载的曲目列表
  fastify.get('/api/playlists/:id/tracks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { recursive?: string };
    const playlist = playlistRepo.findById(id);
    if (!playlist) {
      return reply.status(404).send({ error: '歌单不存在' });
    }
    const isRecursive = query.recursive === 'true';
    const tracks = playlistRepo.getPlaylistTracks(id, isRecursive);
    return tracks.map((t) => ({
      ...t,
      isFavorite: playlistRepo.isFavorite(t.id),
    }));
  });

  // 5. 更新歌单基础信息 (支持修改 parentId 移动目录与防环检测)
  fastify.patch('/api/playlists/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      coverImagePath?: string;
      parentId?: string | null;
      isFolder?: boolean;
    };
    try {
      playlistRepo.update(id, body);
      const updated = playlistRepo.findById(id);
      return { success: true, playlist: updated, ...updated };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 5. 删除歌单
  fastify.delete('/api/playlists/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const success = playlistRepo.delete(id);
      if (!success) {
        return reply.status(404).send({ error: '歌单不存在' });
      }
      return { success: true };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 6. 添加曲目引用到歌单 (M:N 关系，支持单曲 trackId 或批量 trackIds)
  fastify.post('/api/playlists/:id/tracks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      trackId?: string;
      trackIds?: string[];
      sortOrder?: number;
    };
    const trackIds = body?.trackIds || (body?.trackId ? [body.trackId] : []);
    if (trackIds.length === 0) {
      return reply.status(400).send({ error: '缺少 trackId 或 trackIds' });
    }
    try {
      if (trackIds.length === 1 && body?.sortOrder !== undefined) {
        playlistRepo.addTrackToPlaylist(id, trackIds[0], body.sortOrder);
      } else {
        playlistRepo.addTracksToPlaylist(id, trackIds);
      }
      return { success: true, count: trackIds.length };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 7. 从歌单移除曲目关联引用 (仅解除关系，不删除物理文件)
  fastify.delete('/api/playlists/:id/tracks/:trackId', async (request, reply) => {
    const { id, trackId } = request.params as { id: string; trackId: string };
    try {
      playlistRepo.removeTrackFromPlaylist(id, trackId);
      return { success: true };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 8. 获取歌单自定义封面
  fastify.get('/api/playlists/:id/cover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const playlist = playlistRepo.findById(id);
    if (!playlist?.coverImagePath || !fs.existsSync(playlist.coverImagePath)) {
      return reply.status(404).send({ error: '该歌单无自定义封面' });
    }
    const stream = fs.createReadStream(playlist.coverImagePath);
    reply.type('image/webp');
    return reply.send(stream);
  });

  // 9. 上传、替换或拷贝歌单自定义封面 (支持 Base64、本地文件路径或从曲目一键拷贝)
  fastify.post(
    '/api/playlists/:id/cover',
    { bodyLimit: 15 * 1024 * 1024 },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const playlist = playlistRepo.findById(id);
      if (!playlist) {
        return reply.status(404).send({ error: '歌单不存在' });
      }

      const body = request.body as {
        coverBase64?: string;
        filePath?: string;
        trackId?: string;
        sourceTrackId?: string;
      };

      try {
        const copyTrackId = body?.trackId || body?.sourceTrackId;
        if (copyTrackId) {
          const coverPath = playlistRepo.copyCoverFromTrack(id, copyTrackId);
          return { success: true, coverImagePath: coverPath };
        }

        if (body?.filePath) {
          const coverPath = playlistRepo.setCover(id, body.filePath);
          return { success: true, coverImagePath: coverPath };
        }

        if (body?.coverBase64) {
          const base64Data = body.coverBase64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const coverPath = playlistRepo.setCover(id, buffer);
          return { success: true, coverImagePath: coverPath };
        }

        return reply.status(400).send({
          error: '缺少有效的封面图片数据 (支持 coverBase64, filePath 或 trackId)',
        });
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    }
  );

  // 10. 从曲目一键拷贝封面到歌单 (未传 trackId 时自动选取首首含封面的曲目)
  fastify.post('/api/playlists/:id/cover/copy-from-track', async (request, reply) => {
    const { id } = request.params as { id: string };
    const playlist = playlistRepo.findById(id);
    if (!playlist) {
      return reply.status(404).send({ error: '歌单不存在' });
    }
    const body = request.body as { trackId?: string } | undefined;
    try {
      const coverPath = playlistRepo.copyCoverFromTrack(id, body?.trackId);
      return { success: true, coverImagePath: coverPath };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // 11. 移除歌单自定义封面
  fastify.delete('/api/playlists/:id/cover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const playlist = playlistRepo.findById(id);
    if (!playlist) {
      return reply.status(404).send({ error: '歌单不存在' });
    }
    playlistRepo.removeCover(id);
    return { success: true };
  });

  // 11. 清空回收歌单中全部曲目 (彻底物理擦除文件与记录)
  fastify.post('/api/playlists/default_trash/empty', async () => {
    const result = playlistRepo.emptyTrash(integrityGuard);
    return { success: true, ...result };
  });
};
