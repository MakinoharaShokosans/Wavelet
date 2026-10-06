import fs from 'node:fs';
import path from 'node:path';
import type { WaveformData } from '@wavelet/shared';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export async function extractWaveformPeaks(
  filePath: string,
  fileHash: string,
  duration = 0,
  bins = 128
): Promise<WaveformData> {
  const config = getConfig();
  const cacheDir = path.join(config.storage.cacheDir, 'waveforms');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheFile = path.join(cacheDir, `${fileHash}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as WaveformData;
      if (Array.isArray(cached.peaks) && cached.peaks.length === bins) {
        return cached;
      }
    } catch {
      // 缓存损坏，继续重新抽取
    }
  }

  return new Promise<WaveformData>((resolve) => {
    const pcmChunks: Buffer[] = [];

    ffmpeg(filePath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(4000) // 下采样至 4kHz 极速抽取
      .format('s16le')
      .on('error', (err) => {
        logger.warn({ err: err.message, filePath }, '[Waveform] 抽取波形异常，生成平坦底噪回退');
        const fallbackPeaks = new Array(bins).fill(0.05);
        resolve({ trackId: fileHash, peaks: fallbackPeaks, duration });
      })
      .pipe()
      .on('data', (chunk: Buffer) => {
        pcmChunks.push(chunk);
      })
      .on('end', () => {
        const fullBuffer = Buffer.concat(pcmChunks);
        const totalSamples = fullBuffer.length / 2;
        const peaks: number[] = new Array(bins).fill(0);

        if (totalSamples > 0) {
          const samplesPerBin = Math.max(1, Math.floor(totalSamples / bins));

          for (let b = 0; b < bins; b++) {
            let maxAmp = 0;
            const startSample = b * samplesPerBin;
            const endSample = Math.min(totalSamples, startSample + samplesPerBin);

            for (let s = startSample; s < endSample; s++) {
              const sampleVal = Math.abs(fullBuffer.readInt16LE(s * 2));
              if (sampleVal > maxAmp) {
                maxAmp = sampleVal;
              }
            }
            peaks[b] = Math.round((maxAmp / 32768) * 1000) / 1000;
          }
        }

        const result: WaveformData = {
          trackId: fileHash,
          peaks,
          duration,
        };

        try {
          fs.writeFileSync(cacheFile, JSON.stringify(result));
        } catch (writeErr) {
          logger.warn({ writeErr }, '[Waveform] 缓存波形失败');
        }

        resolve(result);
      });
  });
}
