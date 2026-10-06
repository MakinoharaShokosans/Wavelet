import { parentPort } from 'node:worker_threads';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

if (parentPort) {
  parentPort.on(
    'message',
    (data: {
      type: string;
      taskId: string;
      inputPath: string;
      outputPath: string;
      compressionLevel: number;
      customFfmpegPath?: string;
    }) => {
      if (data.type !== 'start') return;

      const { taskId, inputPath, outputPath, compressionLevel, customFfmpegPath } = data;
      const ffmpegBin = customFfmpegPath || ffmpegStatic;

      if (ffmpegBin) {
        ffmpeg.setFfmpegPath(ffmpegBin);
      }

      ffmpeg(inputPath)
        .audioCodec('flac')
        .outputOptions([`-compression_level ${compressionLevel}`])
        .on('progress', (progress) => {
          parentPort?.postMessage({
            type: 'progress',
            taskId,
            percent: Math.round(progress.percent || 0),
          });
        })
        .on('end', () => {
          parentPort?.postMessage({
            type: 'done',
            taskId,
            outputPath,
          });
        })
        .on('error', (err) => {
          parentPort?.postMessage({
            type: 'error',
            taskId,
            error: err.message,
          });
        })
        .save(outputPath);
    }
  );
}
