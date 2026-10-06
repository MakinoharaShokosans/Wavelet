import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 级联坠落与自动回滚阻尼动效计算器
 */
export interface DropCascadeConfig {
  cardWidth: number; // 默认 256
  cardGap: number; // 默认 32
  dropDelayStepMs: number; // 默认 80ms
  dropInitialY: number; // 默认 -120
}

export const defaultDropCascadeConfig: DropCascadeConfig = {
  cardWidth: 256,
  cardGap: 32,
  dropDelayStepMs: 80,
  dropInitialY: -120,
};

/**
 * 计算单个卡片级联坠落入场的延迟时间（秒）
 */
export function getDropDelay(index: number, config = defaultDropCascadeConfig): number {
  return (index * config.dropDelayStepMs) / 1000;
}

/**
 * 计算聚焦第 targetIndex 个卡片时需要的横向偏移位移 (px)
 */
export function calculateSnapOffset(
  targetIndex: number,
  containerWidth: number,
  totalCards: number,
  config = defaultDropCascadeConfig
): number {
  if (totalCards === 0) return 0;

  const validIndex = Math.max(0, Math.min(totalCards - 1, targetIndex));
  const cardSpan = config.cardWidth + config.cardGap;

  // 中心点计算
  const centerOfContainer = containerWidth / 2;
  const centerOfCard = config.cardWidth / 2;

  // 使得第 validIndex 个卡片的中心精确对齐容器中心
  const targetOffset = centerOfContainer - (validIndex * cardSpan + centerOfCard);

  return targetOffset;
}

export interface UseCarouselSnapOptions {
  totalItems: number;
  config?: DropCascadeConfig;
  initialIndex?: number;
}

/**
 * 通用 3D 轮播吸附与级联交互 Hook
 * 统一管理容器视窗监听、鼠标滚轮平滑换卡、入场阶梯延迟与横向中心吸附位移
 */
export function useCarouselSnap({
  totalItems,
  config = defaultDropCascadeConfig,
  initialIndex = 0,
}: UseCarouselSnapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [hasEntered, setHasEntered] = useState(false);
  const lastWheelTime = useRef<number>(0);

  // 监听容器视窗尺寸变化 (支持 ResizeObserver，自适应侧边栏折叠/展开与窗口缩放)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 级联坠落入场完成后，触发一次自动回滚阻尼对齐
  useEffect(() => {
    if (totalItems === 0) return;

    const totalAnimationTime = totalItems * config.dropDelayStepMs + 400;

    const timer = setTimeout(() => {
      setHasEntered(true);
    }, totalAnimationTime);

    return () => clearTimeout(timer);
  }, [totalItems, config.dropDelayStepMs]);

  // 如果总数缩减导致 activeIndex 越界，安全自适应校正
  useEffect(() => {
    if (totalItems > 0 && activeIndex >= totalItems) {
      setActiveIndex(Math.max(0, totalItems - 1));
    }
  }, [totalItems, activeIndex]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (totalItems <= 1) return;

      const now = Date.now();
      if (now - lastWheelTime.current < 160) return;

      const dominantDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dominantDelta > 20 && activeIndex < totalItems - 1) {
        lastWheelTime.current = now;
        setActiveIndex((prev) => Math.min(totalItems - 1, prev + 1));
      } else if (dominantDelta < -20 && activeIndex > 0) {
        lastWheelTime.current = now;
        setActiveIndex((prev) => Math.max(0, prev - 1));
      }
    },
    [activeIndex, totalItems]
  );

  const prev = useCallback(() => {
    setActiveIndex((prevIndex) => Math.max(0, prevIndex - 1));
  }, []);

  const next = useCallback(() => {
    setActiveIndex((prevIndex) => Math.min(totalItems - 1, prevIndex + 1));
  }, [totalItems]);

  const snapOffset = calculateSnapOffset(activeIndex, containerWidth, totalItems, config);

  const getItemDelay = useCallback(
    (index: number) => {
      return !hasEntered ? getDropDelay(index, config) : 0;
    },
    [hasEntered, config]
  );

  return {
    containerRef,
    activeIndex,
    setActiveIndex,
    containerWidth,
    hasEntered,
    handleWheel,
    prev,
    next,
    snapOffset,
    getItemDelay,
  };
}
