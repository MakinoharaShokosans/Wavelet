import type React from 'react';
import type { Placement } from './ui.js';

/**
 * 纯几何定制 SVG 矢量图标名称字面量
 */
export type SvgIconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'volume'
  | 'volume-mute'
  | 'repeat'
  | 'repeat-track'
  | 'shuffle'
  | 'sequence'
  | 'folder'
  | 'music'
  | 'heart'
  | 'heart-filled'
  | 'wave'
  | 'plus'
  | 'close'
  | 'chevron-right'
  | 'chevron-left'
  | 'bit-perfect'
  | 'headphones'
  | 'list'
  | 'grid'
  | 'search'
  | 'clock'
  | 'archive'
  | 'download'
  | 'trash'
  | 'edit'
  | 'restore'
  | 'image'
  | 'chevron-down'
  | 'check';

export interface SvgIconProps {
  name: SvgIconName;
  className?: string;
  size?: number;
  color?: string;
}

export interface FloatingCardProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  placement?: Placement;
  delay?: number;
}
