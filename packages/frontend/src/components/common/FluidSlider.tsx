import type React from 'react';
import { useCallback, useRef, useState } from 'react';

export interface FluidSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  showThumbOnHover?: boolean;
}

export const FluidSlider: React.FC<FluidSliderProps> = ({
  value,
  min = 0,
  max = 1,
  onChange,
  onChangeEnd,
  className = '',
  disabled = false,
  showThumbOnHover = true,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 拖动期间优先使用实时指针计算值，松开后恢复外部受控值
  const activeValue = isDragging && dragValue !== null ? dragValue : value;
  const clampedValue = Math.max(min, Math.min(max, activeValue));
  const percentage = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;

  const calculateValueFromPointer = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return min;
      const pos = (clientX - rect.left) / rect.width;
      const normalized = Math.max(0, Math.min(1, pos));
      return min + normalized * (max - min);
    },
    [min, max, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);

    const newVal = calculateValueFromPointer(e.clientX);
    setDragValue(newVal);
    onChange(newVal);

    const onPointerMove = (ev: PointerEvent) => {
      const v = calculateValueFromPointer(ev.clientX);
      setDragValue(v);
      onChange(v);
    };

    const onPointerUp = (ev: PointerEvent) => {
      setIsDragging(false);
      setDragValue(null);
      const finalVal = calculateValueFromPointer(ev.clientX);
      onChange(finalVal);
      onChangeEnd?.(finalVal);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      ref={trackRef}
      className={`relative h-5 flex items-center cursor-pointer select-none touch-none ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 背景底槽 */}
      <div className="w-full h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden transition-all duration-150">
        {/* 激活进度 */}
        <div
          className={`h-full bg-[var(--text-primary)] rounded-full ${isDragging ? '' : 'transition-all duration-75'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 极简流体 Thumb 微滑块 */}
      <div
        className={`absolute w-2.5 h-2.5 bg-[var(--text-primary)] rounded-full shadow-[var(--shadow-hover)] border-2 border-white -translate-x-1/2 pointer-events-none ${
          isDragging ? '' : 'transition-all duration-150'
        } ${
          isDragging || !showThumbOnHover || isHovered
            ? 'scale-100 opacity-100'
            : 'scale-0 opacity-0'
        }`}
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};

export default FluidSlider;
