import type React from 'react';
import { useEffect, useRef } from 'react';
import wsClient from '../../services/websocket.js';

export interface FluidWaveformProps {
  className?: string;
  isPlaying?: boolean;
}

/**
 * 60fps Catmull-Rom 三次贝塞尔流体音波 Canvas
 * 直接在 requestAnimationFrame 闭包内消费 64 维频域浮点数组，杜绝 React DOM 重渲染
 */
export const FluidWaveform: React.FC<FluidWaveformProps> = ({
  className = '',
  isPlaying = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fftDataRef = useRef<number[]>(new Array(64).fill(0));
  const animFrameRef = useRef<number | null>(null);

  // 1. 直接挂载 WebSocket FFT 高频广播监听
  useEffect(() => {
    const unsub = wsClient.onFft((bands) => {
      fftDataRef.current = bands;
    });
    return () => {
      unsub();
    };
  }, []);

  // 2. 60fps Canvas 绘制渲染管线
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const bands = fftDataRef.current;
      const pointsCount = Math.min(bands.length, 48);
      const step = width / (pointsCount - 1);
      const baselineY = height * 0.55;

      ctx.beginPath();
      ctx.moveTo(0, baselineY);

      // 计算采样点 (若未在播放则拟合微风流体怠速正弦波)
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < pointsCount; i++) {
        const x = i * step;
        let amplitude = bands[i] || 0;

        if (!isPlaying || amplitude < 0.01) {
          // 待机呼吸微波
          amplitude = Math.sin(phase + i * 0.3) * 0.05 + 0.02;
        }

        const y = baselineY - amplitude * (height * 0.45);
        points.push({ x, y });
      }

      // Catmull-Rom 拟合三次贝塞尔平滑流体曲线
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(i + 2, points.length - 1)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }

      // 笔触：雅致石墨黑
      ctx.strokeStyle = '#1F2124';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 下方柔和微渐变铺底
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, baselineY - 40, 0, height);
      gradient.addColorStop(0, 'rgba(31, 33, 36, 0.06)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      phase += 0.04;
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className={`w-full h-24 overflow-hidden relative flex items-center ${className}`}>
      <canvas ref={canvasRef} width={720} height={120} className="w-full h-full block" />
    </div>
  );
};

export default FluidWaveform;
