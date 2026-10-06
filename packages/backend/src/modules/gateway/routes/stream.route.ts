import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { TrackRepository } from '../../library/repositories/track.repository.js';

const MIME_MAP: Record<string, string> = {
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
};

export const streamRoute: FastifyPluginAsync = async (fastify) => {
  const trackRepo = new TrackRepository();

  const handleStream = async (request: FastifyRequest, reply: FastifyReply) => {
    const { trackId } = request.params as { trackId: string };
    const track = trackRepo.findById(trackId);

    if (!track || !fs.existsSync(track.filePath)) {
      return reply.status(404).send({ error: '曲目不存在或物理文件已断链' });
    }

    const stat = fs.statSync(track.filePath);
    const fileSize = stat.size;
    const range = request.headers.range;
    const ext = path.extname(track.filePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'audio/flac';

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', contentType);

    if (!range) {
      reply.header('Content-Length', fileSize);
      const stream = fs.createReadStream(track.filePath);
      return reply.send(stream);
    }

    // 解析 Range: bytes=start-end
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(parts[0], 10);
    const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      reply.header('Content-Range', `bytes */${fileSize}`);
      return reply.status(416).send({ error: '请求 Range 范围超出文件大小' });
    }

    const chunkSize = end - start + 1;
    reply.status(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    reply.header('Content-Length', chunkSize);

    const stream = fs.createReadStream(track.filePath, { start, end });
    return reply.send(stream);
  };

  // 支持两种路由别名，确保原生流点播无死角
  fastify.get('/api/stream/:trackId', handleStream);
  fastify.get('/api/tracks/:trackId/stream', handleStream);
};
