export interface CrcInterpolationResult {
  glitchesDetected: number;
  healedBuffer: Buffer;
}

/**
 * 三次埃尔米特插值 (Cubic Hermite Spline)
 * 平滑过渡损坏样点，消除脉冲爆音
 */
function hermiteInterpolate(y0: number, y1: number, y2: number, y3: number, mu: number): number {
  const m0 = (y2 - y0) * 0.5;
  const m1 = (y3 - y1) * 0.5;
  const mu2 = mu * mu;
  const mu3 = mu2 * mu;

  const a0 = 2 * mu3 - 3 * mu2 + 1;
  const a1 = mu3 - 2 * mu2 + mu;
  const a2 = mu3 - mu2;
  const a3 = -2 * mu3 + 3 * mu2;

  return a0 * y1 + a1 * m0 + a2 * m1 + a3 * y2;
}

/**
 * PCM 样点跳变坏点检测与平滑插值修复器
 * 针对场景 4: 传输坏帧导致的局部爆音或脉冲突变
 */
export function interpolateSampleGlitches(
  pcmBuffer: Buffer,
  bitDepth = 16
): CrcInterpolationResult {
  if (bitDepth !== 16) {
    // 基础支持 16-bit PCM 插值
    return { glitchesDetected: 0, healedBuffer: pcmBuffer };
  }

  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const outBuffer = Buffer.from(pcmBuffer);
  let glitches = 0;

  // 步进检测样点二阶导数突变 (尖锐脉冲)
  for (let i = 2; i < sampleCount - 2; i++) {
    const sPrev2 = outBuffer.readInt16LE((i - 2) * 2);
    const sPrev1 = outBuffer.readInt16LE((i - 1) * 2);
    const sCurr = outBuffer.readInt16LE(i * 2);
    const sNext1 = outBuffer.readInt16LE((i + 1) * 2);
    const sNext2 = outBuffer.readInt16LE((i + 2) * 2);

    // 局部平均绝对跳变率
    const avgDiff = (Math.abs(sPrev1 - sPrev2) + Math.abs(sNext2 - sNext1)) / 2;
    const currDiff = Math.abs(sCurr - sPrev1);

    // 突变大于相邻差值 10 倍且幅度大于 8000
    if (currDiff > 8000 && currDiff > avgDiff * 10) {
      const smoothed = Math.round(hermiteInterpolate(sPrev2, sPrev1, sNext1, sNext2, 0.5));
      outBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, smoothed)), i * 2);
      glitches++;
    }
  }

  return { glitchesDetected: glitches, healedBuffer: outBuffer };
}
