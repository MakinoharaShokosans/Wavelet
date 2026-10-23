import fs from 'node:fs';
import path from 'node:path';
import type { HealthyStatus, TrackQueryParams } from '@wavelet/shared';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../../../config/index.js';
import { extractWaveformPeaks } from '../../inspector/waveform-extractor.js';
import { IntegrityGuard } from '../../library/integrity-guard.js';
import { parseTrackInfoFromFilename } from '../../library/musics-syncer.js';
import { LyricsRepository } from '../../library/repositories/lyrics.repository.js';
import { PlaylistRepository } from '../../library/repositories/playlist.repository.js';
import { TrackRepository } from '../../library/repositories/track.repository.js';
import {
  detectImageMime,
  findSidecarCover,
  findSidecarLyrics,
} from '../../library/sidecar-detector.js';
import { computeFileHash } from '../../transcoder/flac-standardizer.js';
import { cacheCoverArt, parseAudioMetadata } from '../../transcoder/metadata-writer.js';

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

  // 3. 修改曲目元数据 (严格白名单限制，杜绝改写系统物理路径等敏感字段)
  fastify.patch('/api/tracks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    const raw = (request.body || {}) as Record<string, unknown>;
    const safeUpdates: {
      title?: string;
      artist?: string;
      album?: string;
      albumArtist?: string;
    } = {};

    if (typeof raw.title === 'string') safeUpdates.title = raw.title;
    if (typeof raw.artist === 'string') safeUpdates.artist = raw.artist;
    if (typeof raw.album === 'string') safeUpdates.album = raw.album;
    if (typeof raw.albumArtist === 'string') safeUpdates.albumArtist = raw.albumArtist;

    trackRepo.update(id, safeUpdates);
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

  // 5.5. 批量彻底清理所有失联软缺失曲目 (ISSUE-03 方案 A: 用户主动一键清理)
  fastify.post('/api/tracks/prune-missing', async () => {
    const result = integrityGuard.purgeMissingTracks();
    return { success: true, ...result };
  });

  // 6. 获取曲目内嵌或同级外挂封面
  fastify.get('/api/tracks/:id/cover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }

    const config = getConfig();
    const coverPath = path.join(config.storage.cacheDir, 'covers', `${track.fileHash}.webp`);

    if (!fs.existsSync(coverPath)) {
      if (fs.existsSync(track.filePath)) {
        const sidecarCover = findSidecarCover(track.filePath);
        if (sidecarCover) {
          cacheCoverArt(sidecarCover.buffer, track.fileHash);
          trackRepo.update(track.id, { hasEmbeddedCover: true });
        }
      }
    }

    if (!fs.existsSync(coverPath)) {
      return reply.status(404).send({ error: '该曲目无封面' });
    }

    const buffer = fs.readFileSync(coverPath);
    reply.type(detectImageMime(buffer));
    return reply.send(buffer);
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

  // 6. 获取歌词 (支持自动兜底探查同级外挂 .lrc 文件)
  fastify.get('/api/tracks/:id/lyrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    let lyrics = lyricsRepo.findByTrackId(id);
    if (!lyrics) {
      const track = trackRepo.findById(id);
      if (track && fs.existsSync(track.filePath)) {
        const sidecar = findSidecarLyrics(track.filePath);
        if (sidecar) {
          lyricsRepo.upsert({
            trackId: track.id,
            rawLrc: sidecar,
            offsetMs: 0,
            updatedAt: Date.now(),
          });
          trackRepo.update(track.id, { hasEmbeddedLyrics: true });
          lyrics = lyricsRepo.findByTrackId(id);
        }
      }
    }
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

  // 10. 手动重新读取并刷新单首曲目元数据 (ISSUE-06)
  fastify.post('/api/tracks/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string };
    const track = trackRepo.findById(id);
    if (!track) {
      return reply.status(404).send({ error: '曲目不存在' });
    }
    if (!fs.existsSync(track.filePath)) {
      trackRepo.update(track.id, { isMissing: true, missingAt: Date.now() });
      return reply.status(400).send({ error: '物理文件在磁盘上不存在，已标记为失联' });
    }

    try {
      const stat = fs.statSync(track.filePath);
      const fileHash = computeFileHash(track.filePath);
      const metadata = await parseAudioMetadata(track.filePath);

      let hasCover = metadata.hasEmbeddedCover;
      if (metadata.hasEmbeddedCover && metadata.coverBuffer) {
        cacheCoverArt(metadata.coverBuffer, fileHash);
      } else {
        const sidecarCover = findSidecarCover(track.filePath);
        if (sidecarCover) {
          cacheCoverArt(sidecarCover.buffer, fileHash);
          hasCover = true;
        }
      }

      let hasLyrics = Boolean(metadata.rawLyrics);
      let resolvedLyrics = metadata.rawLyrics;
      if (!hasLyrics) {
        const sidecarLyrics = findSidecarLyrics(track.filePath);
        if (sidecarLyrics) {
          hasLyrics = true;
          resolvedLyrics = sidecarLyrics;
        }
      }
      if (hasLyrics && resolvedLyrics) {
        lyricsRepo.upsert({
          trackId: track.id,
          rawLrc: resolvedLyrics,
          offsetMs: 0,
          updatedAt: Date.now(),
        });
      }

      const config = getConfig();
      const parseMode = config.storage.titleParseMode || 'smart';
      const parsedInfo = parseTrackInfoFromFilename(track.filePath, parseMode);
      const title =
        parseMode === 'tag'
          ? metadata.title || path.basename(track.filePath, path.extname(track.filePath))
          : parsedInfo.title;
      const artist =
        parseMode === 'tag'
          ? metadata.artist || '未知艺术家'
          : parsedInfo.artist || metadata.artist || '未知艺术家';

      trackRepo.update(track.id, {
        title,
        artist,
        album: metadata.album || '未知专辑',
        albumArtist: metadata.albumArtist || metadata.artist || '未知艺术家',
        duration: metadata.duration || track.duration,
        bitrate: metadata.bitrate || track.bitrate,
        sampleRate: metadata.sampleRate || track.sampleRate,
        bitDepth: metadata.bitDepth || track.bitDepth,
        channels: metadata.channels || track.channels,
        fileSize: stat.size,
        fileHash,
        hasEmbeddedCover: hasCover,
        hasEmbeddedLyrics: hasLyrics,
        isMissing: false,
        missingAt: null,
        updatedAt: Date.now(),
      });

      const updated = trackRepo.findById(track.id);
      return {
        success: true,
        track: updated ? { ...updated, isFavorite: playlistRepo.isFavorite(track.id) } : null,
      };
    } catch (err) {
      return reply.status(500).send({ error: `重新解析元数据失败: ${String(err)}` });
    }
  });
};
