/**
 * 物理弹簧阻尼参数配置契约
 */
export interface SpringMotionConfig {
  type: 'spring';
  stiffness: number;
  damping: number;
  mass?: number;
  restDelta?: number;
}

/**
 * 气泡或浮层挂载对齐方向
 */
export type Placement = 'top' | 'bottom' | 'left' | 'right';

/**
 * 轮播卡片横向吸附几何指标
 */
export interface CarouselMetrics {
  cardWidth: number;
  cardGap: number;
  centerIndex: number;
  totalCards: number;
}
