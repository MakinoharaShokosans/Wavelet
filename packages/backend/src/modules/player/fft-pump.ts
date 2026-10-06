import FFT from 'fft.js';
import { broadcastFft } from '../gateway/ws/broadcaster.js';

export class FftPump {
  private fft: FFT;
  private hannWindow: Float32Array;
  private fftSize: number;
  private complexArray: number[];
  private outputBins: number;

  constructor(fftSize = 1024, outputBins = 64) {
    this.fftSize = fftSize;
    this.outputBins = outputBins;
    this.fft = new FFT(fftSize);

    // 预计算汉宁窗 (Hann Window)，抑制频域频谱泄漏
    this.hannWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    }

    this.complexArray = this.fft.createComplexArray();
  }

  /**
   * 处理 16-bit PCM 样点块并计算 64 维对数能量频谱
   */
  processPcmChunk(pcmBuffer: Buffer): number[] {
    const sampleCount = Math.min(Math.floor(pcmBuffer.length / 2), this.fftSize);
    const inputSignal = new Float32Array(this.fftSize);

    for (let i = 0; i < sampleCount; i++) {
      // 归一化并加汉宁窗
      const rawSample = pcmBuffer.readInt16LE(i * 2) / 32768.0;
      inputSignal[i] = rawSample * this.hannWindow[i];
    }

    // 执行实数傅里叶变换
    this.fft.realTransform(this.complexArray, inputSignal);
    this.fft.completeSpectrum(this.complexArray);

    // 提取前半段复数模长并进行对数缩放映射至 64 频段
    const halfBins = this.fftSize / 2;
    const magnitudes = new Float32Array(halfBins);

    for (let i = 0; i < halfBins; i++) {
      const real = this.complexArray[2 * i];
      const imag = this.complexArray[2 * i + 1];
      magnitudes[i] = Math.sqrt(real * real + imag * imag);
    }

    // 64 维下采样与非线性听觉感知能量压缩
    const result: number[] = new Array(this.outputBins);
    const step = halfBins / this.outputBins;

    for (let b = 0; b < this.outputBins; b++) {
      const start = Math.floor(b * step);
      const end = Math.floor((b + 1) * step);
      let sum = 0;
      for (let s = start; s < end; s++) {
        sum += magnitudes[s];
      }
      const avg = sum / (end - start || 1);
      // 对数增益映射到 [0.0, 1.0]
      const db = 20 * Math.log10(avg + 1e-6);
      const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
      result[b] = Number(normalized.toFixed(4));
    }

    // 触发 WebSocket 60fps 广播
    broadcastFft(result);

    return result;
  }
}
