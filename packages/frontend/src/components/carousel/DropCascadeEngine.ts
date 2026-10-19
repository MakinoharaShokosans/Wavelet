import type { PanInfo } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 级联坠落与自动回滚阻尼动效计算器
 */
export interface DropCascadeConfig {
  cardWidth: number; // 默认 280
  cardGap: number; // 默认 48
  dropDelayStepMs: number; // 默认 35ms
  dropInitialY: number; // 默认 -60
}

export const defaultDropCascadeConfig: DropCascadeConfig = {
  cardWidth: 280,
  cardGap: 48,
  dropDelayStepMs: 35,
  dropInitialY: -60,
};

/**
 * 计算单个卡片级联坠落入场的延迟时间（秒）
 * 仅对首屏前 6 张卡片施加轻量微阶梯，超出部分直接就位，杜绝 80+ 张卡片延宕数秒的严重跳帧
 */
export function getDropDelay(index: number, config = defaultDropCascadeConfig): number {
  if (index > 5) return 0;
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
  return centerOfContainer - (validIndex * cardSpan + centerOfCard);
}

export interface UseCarouselSnapOptions {
  totalItems: number;
  config?: DropCascadeConfig;
  initialIndex?: number;
}

/**
 * 通用 3D 轮播吸附与级联交互 Hook
 * 统一管理容器视窗监听、鼠标滚轮平滑换卡、手势拖拽、入场阶梯延迟与横向中心吸附位移
 */
export function useCarouselSnap({
  totalItems,
  config = defaultDropCascadeConfig,
  initialIndex = 0,
}: UseCarouselSnapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      return Math.max(600, window.innerWidth - 240);
    }
    return 1000;
  });
  const [hasEntered, setHasEntered] = useState(false);

  // 滚轮与触控板连续积分累加器
  const wheelAccumulator = useRef(0);
  const lastStepTime = useRef(0);
  const wheelResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 拖拽手势防误触标识
  const isDraggingRef = useRef(false);

  // 1. 监听容器视窗尺寸变化 (支持 ResizeObserver，自适应侧边栏折叠/展开与窗口缩放)
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

  // 2. 级联入场迅速就位 (最长 350ms 内必定就位，绝不阻断后续滑动手感)
  useEffect(() => {
    if (totalItems === 0) return;

    const totalAnimationTime = Math.min(totalItems, 6) * config.dropDelayStepMs + 180;
    const timer = setTimeout(() => {
      setHasEntered(true);
    }, totalAnimationTime);

    return () => clearTimeout(timer);
  }, [totalItems, config.dropDelayStepMs]);

  // 3. 总数变动越界安全自校正
  useEffect(() => {
    if (totalItems > 0 && activeIndex >= totalItems) {
      setActiveIndex(Math.max(0, totalItems - 1));
    }
  }, [totalItems, activeIndex]);

  const prev = useCallback(() => {
    setActiveIndex((prevIndex) => Math.max(0, prevIndex - 1));
  }, []);

  const next = useCallback(() => {
    setActiveIndex((prevIndex) => Math.min(totalItems - 1, prevIndex + 1));
  }, [totalItems]);

  // 4. 彻底解决“滚轮卡顿、跳帧、父级纵向抖动”的核心滚轮积分处理器
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      if (totalItems <= 1) return;

      // 阻止浏览器外层滚动条上下跳动抢焦点
      if (e.cancelable) {
        e.preventDefault();
      }

      // 归一化 delta（兼容 Linux/Windows 的 line 模式与 Mac/触控板像素模式）
      let delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 28;
      } else if (e.deltaMode === 2) {
        delta *= 350;
      }

      wheelAccumulator.current += delta;

      const now = Date.now();
      const STEP_THRESHOLD = 38; // 38px 灵敏触发一级卡片切换
      const MIN_INTERVAL = 85; // 85ms 最小步进保护，既跟手又绝不瞬间滚飞

      if (
        Math.abs(wheelAccumulator.current) >= STEP_THRESHOLD &&
        now - lastStepTime.current >= MIN_INTERVAL
      ) {
        const dir = Math.sign(wheelAccumulator.current);
        wheelAccumulator.current = 0;
        lastStepTime.current = now;

        if (dir > 0) {
          next();
        } else {
          prev();
        }
      }

      if (wheelResetTimer.current) clearTimeout(wheelResetTimer.current);
      wheelResetTimer.current = setTimeout(() => {
        wheelAccumulator.current = 0;
      }, 100);
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
      if (wheelResetTimer.current) clearTimeout(wheelResetTimer.current);
    };
  }, [totalItems, next, prev]);

  // 保留 React 原生回调以兼容历史 props
  const handleWheel = useCallback(
    (_e: React.WheelEvent<HTMLDivElement>) => {
      // 原生 DOM 监听已接管并做了 preventDefault
    },
    []
  );

  // 5. 拖拽手势集成 (点击+水平滑动拖动卡片)
  const snapOffset = calculateSnapOffset(activeIndex, containerWidth, totalItems, config);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      // 延迟重置，防止松手触发 onClick 点击事件
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 60);

      const offset = info.offset.x;
      const velocity = info.velocity.x;

      if (offset < -40 || velocity < -200) {
        next();
      } else if (offset > 40 || velocity > 200) {
        prev();
      }
    },
    [next, prev]
  );

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
    dragProps: {
      drag: 'x' as const,
      dragConstraints: { left: snapOffset, right: snapOffset },
      dragElastic: 0.2,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
    isDraggingRef,
  };
}

