import type { SpringMotionConfig } from '../../types/ui.js';

/**
 * Wavelet 前端标准物理弹簧动效预设
 */
export const springMotion: Record<
  'stiff' | 'gentle' | 'rebound' | 'morph' | 'sidebar',
  SpringMotionConfig
> = {
  /**
   * 极速敏捷点击响应 (用于按钮微压下、开关切换)
   * 刚度极高，回弹迅速无拖沓
   */
  stiff: {
    type: 'spring',
    stiffness: 500,
    damping: 30,
    mass: 0.8,
  },

  /**
   * 优雅级联坠落与卡片升起 (用于 Splash 音符跳跃、卡片坠落)
   * 具有生动的轻微过冲回弹
   */
  gentle: {
    type: 'spring',
    stiffness: 450,
    damping: 18,
    mass: 1.0,
  },

  /**
   * 惯性吸附与长距离自动回滚 (用于 CarouselStage 磁吸与落位回滚)
   * 刚度适中，阻尼沉稳，吸附精准
   */
  rebound: {
    type: 'spring',
    stiffness: 280,
    damping: 24,
    mass: 1.1,
  },

  /**
   * 平滑形变转场 (用于 Card-to-Stage 歌曲卡片向大舞台同源全屏展开)
   * 阻尼大、刚度平缓，确保全屏展开视觉平滑不抖动
   */
  morph: {
    type: 'spring',
    stiffness: 380,
    damping: 28,
    mass: 1.0,
  },

  /**
   * 弹性侧边栏伸缩 (240px <-> 72px 切换)
   */
  sidebar: {
    type: 'spring',
    stiffness: 320,
    damping: 26,
    mass: 0.9,
  },
};
