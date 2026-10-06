import { motion } from 'motion/react';
import type React from 'react';
import { SvgIcons } from '../common/SvgIcons.js';

export interface VinylRecordProps {
  isPlaying: boolean;
  coverUrl?: string;
  size?: number; // 默认 320
}

export const VinylRecord: React.FC<VinylRecordProps> = ({ isPlaying, coverUrl, size = 320 }) => {
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      {/* 唱针机构组件 (位于右上角) */}
      <motion.div
        animate={{
          rotate: isPlaying ? 24 : 0,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ transformOrigin: 'top right' }}
        className="absolute -top-6 right-6 w-20 h-36 z-20 pointer-events-none"
      >
        {/* 唱针臂基座与支点 */}
        <div className="absolute top-0 right-0 w-8 h-8 rounded-full bg-[var(--text-secondary)] shadow-md flex items-center justify-center border-2 border-white">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--text-primary)]" />
        </div>
        {/* 金属折角唱针杆 */}
        <svg
          viewBox="0 0 80 140"
          className="w-full h-full text-[var(--text-secondary)] overflow-visible"
        >
          <title>唱针杆</title>
          <path
            d="M 64 8 L 40 85 L 32 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {/* 磁头盒 */}
          <rect x="24" y="118" width="16" height="18" rx="3" fill="var(--text-primary)" />
        </svg>
      </motion.div>

      {/* 黑胶唱片本体 (360° 无限平稳旋转) */}
      <motion.div
        animate={{
          rotate: isPlaying ? 360 : 0,
        }}
        transition={{
          repeat: isPlaying ? Number.POSITIVE_INFINITY : 0,
          duration: 3,
          ease: 'linear',
        }}
        className="relative w-full h-full rounded-full bg-[#18191B] shadow-[var(--shadow-stage)] flex items-center justify-center overflow-hidden border-4 border-[#242528]"
      >
        {/* 同心圆纹理刻道 SVG */}
        <svg
          viewBox="0 0 300 300"
          className="absolute inset-0 w-full h-full pointer-events-none opacity-25"
        >
          <title>黑胶刻道纹理</title>
          <circle cx="150" cy="150" r="140" fill="none" stroke="#FFFFFF" strokeWidth="0.75" />
          <circle cx="150" cy="150" r="128" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="114" fill="none" stroke="#FFFFFF" strokeWidth="0.75" />
          <circle cx="150" cy="150" r="102" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="90" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
          <circle cx="150" cy="150" r="78" fill="none" stroke="#FFFFFF" strokeWidth="0.75" />
        </svg>

        {/* 唱片中心彩胶封面 */}
        <div className="w-28 h-28 rounded-full bg-white border-4 border-[#242528] overflow-hidden flex items-center justify-center shadow-inner relative z-10">
          {coverUrl ? (
            <img src={coverUrl} alt="Vinyl Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]">
              <SvgIcons name="music" size={32} />
            </div>
          )}

          {/* 中心主轴孔 */}
          <div className="absolute w-4 h-4 rounded-full bg-[#18191B] border-2 border-white/60 shadow-md" />
        </div>
      </motion.div>
    </div>
  );
};

export default VinylRecord;
