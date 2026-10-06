import fs from 'node:fs';
import path from 'node:path';
import type { HealthyStatus, TrackQueryParams } from '@wavelet/shared';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../../../config/index.js';
import { extractWaveformPeaks } from '../../inspector/waveform-extractor.js';
import { IntegrityGuard } from '../../library/integrity-guard.js';
import { LyricsRepository } from '../../library/repositories/lyrics.repository.js';
import { PlaylistRepository } from '../../library/repositories/playlist.repository.js';
import { TrackRepository } from '../../library/repositories/track.repository.js';

export const tracksRoute: FastifyPluginAsync = async (fastify) => {
  const trackRepo = new TrackRepository();
  const playlistRepo = new PlaylistRepository();
  const lyricsRepo = new LyricsRepository();
  const integrityGuard = new IntegrityGuard(trackRepo);

  // 1. 分页与智能排序检索曲目
  fastify.get('/api/tracks', async (request) => {
    const query = request.query as Record<string, string>;
    const params: TrackQueryParams = {
      keyword: query.keyword || query.query,
      artist: query.artist,
      album: query.album,
      healthyStatus: query.healthyStatus as HealthyStatus | undefined,
      sort: query.sort as TrackQueryParams['sort'],
      page: query.page ? Number(query.page) : 1,
      pageSize: query.pageSize || query.limit ? Number(query.pageSize || query.limit) : 50,
    };
    const result = trackRepo.findAll(params);
    // 注入 isFavorite 标记
    const items = result.items.map((t) => ({
      ...t,
      isFavorite: playlistRepo.isFavorite(t.id),
    }));
    return { ...result, items };
  });

  // 2. 获取单首曲目详情
  fastify.get('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    return track;
  });

  // 3. 修改曲目元数据
  fastify.patch('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    const body = request.body as {
      title?: string;
      artist?: string;
      album?: string;
      albumArtist?: string;
    };
    trackRepo.update(id, body);
    return { success: true, track: trackRepo.findById(id) };
  });

  // 4. 删除曲目（默认移入回收歌单，传 purge=true 或 permanent=true 彻底销毁）
  fastify.delete('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { purge?: string; permanent?: string };
    const shouldPurge = query.purge === 'true' || query.permanent === 'true';

    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '删除失败，曲目不存在' });
    }

    if (shouldPurge) {
      const success = integrityGuard.purgeTrackCompletely(id);
      if (!success) {
        return reply.status(404).send({ error: '彻底删除失败' });
      }
      return { success: true, purged: true };
    }

    playlistRepo.trashTrack(id);
    return { success: true, trashed: true };
  });

  // 5. 从回收站恢复曲目至曲库
  fastify.post('/api/tracks/:id/restore', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    playlistRepo.restoreTrack(id);
    return { success: true, track: trackRepo.findById(id) };
  });

  // 6. 获取曲目内嵌封面
  fastify.get('/api/tracks/:id/cover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }

    const config = getConfig();
    const coverPath = path.join(config.storage.cacheDir, 'covers', `${track.fileHash}.webp`);

    if (!fs.existsSync(coverPath)) {
      return reply.status(404).send({ error: '该曲目无内嵌封面' });
    }

    const stream = fs.createReadStream(coverPath);
    reply.type('image/webp');
    return reply.send(stream);
  });

  // 7. 上传或替换曲目封面
  fastify.post('/api/tracks/:id/cover', { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }

    const body = request.body as { coverBase64?: string };
    if (!body?.coverBase64) {
      return reply.status(400).send({ error: '缺少有效的封面图片数据 (coverBase64)' });
    }

    const base64Data = body.coverBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const config = getConfig();
    const coversDir = path.join(config.storage.cacheDir, 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }

    const coverPath = path.join(coversDir, `${track.fileHash}.webp`);
    fs.writeFileSync(coverPath, buffer);

    trackRepo.update(id, { hasEmbeddedCover: true });
    return { success: true, hasEmbeddedCover: true };
  });

  // 8. 移除曲目封面
  fastify.delete('/api/tracks/:id/cover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }

    const config = getConfig();
    const coverPath = path.join(config.storage.cacheDir, 'covers', `${track.fileHash}.webp`);
    if (fs.existsSync(coverPath)) {
      try {
        fs.unlinkSync(coverPath);
      } catch {
        // ignore
      }
    }

    trackRepo.update(id, { hasEmbeddedCover: false });
    return { success: true };
  });

  // 6. 获取歌词
  fastify.get('/api/tracks/:id/lyrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const lyrics = lyricsRepo.findByTrackId(id);
    if (!lyrics) {
      return reply.status(404).send({ error: '未找到歌词' });
    }
    return lyrics;
  });

  // 7. 更新歌词
  fastify.put('/api/tracks/:id/lyrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as
      | { rawLrc?: string; content?: string; offsetMs?: number }
      | undefined;
    const rawLrc = body?.rawLrc ?? body?.content;
    if (typeof rawLrc !== 'string') {
      return reply.status(400).send({ error: '缺少有效的歌词内容 rawLrc' });
    }
    lyricsRepo.upsert({
      trackId: id,
      rawLrc,
      offsetMs: body?.offsetMs || 0,
      updatedAt: Date.now(),
    });
    return { success: true };
  });

  // 8. 获取整轨 128 点归一化波形振幅峰值 (供前端波形进度条与打轴轨道瞬时渲染)
  fastify.get('/api/tracks/:id/waveform', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    const waveform = await extractWaveformPeaks(
      track.filePath,
      track.fileHash,
      track.duration,
      128
    );
    return waveform;
  });

  // 9. 一键心动收藏 / 取消收藏
  fastify.post('/api/tracks/:id/favorite', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    const isFavorite = playlistRepo.toggleFavorite(id);
    return { success: true, trackId: id, isFavorite };
  });
};
