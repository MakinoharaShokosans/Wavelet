import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useRef, useState } from 'react';
import { springMotion } from '../../assets/styles/motion.js';
import config from '../../config/index.js';
import type { FloatingCardProps, Placement } from '../../types/index.js';

export interface ExtendedFloatingCardProps extends FloatingCardProps {
  className?: string;
}

export const FloatingCard: React.FC<ExtendedFloatingCardProps> = ({
  trigger,
  content,
  placement = 'top',
  delay = config.hoverDebounceMs,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  };

  const getPlacementClasses = (pos: Placement): string => {
    switch (pos) {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2';
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2';
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2';
    }
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {trigger}

      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.94,
              y: placement === 'top' ? 3 : placement === 'bottom' ? -3 : 0,
              x: placement === 'left' ? 3 : placement === 'right' ? -3 : 0,
            }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{
              opacity: 0,
              scale: 0.94,
              y: placement === 'top' ? 3 : placement === 'bottom' ? -3 : 0,
              x: placement === 'left' ? 3 : placement === 'right' ? -3 : 0,
            }}
            transition={springMotion.stiff}
            className={`absolute z-50 pointer-events-none whitespace-nowrap bg-white text-[var(--text-primary)] text-xs font-medium px-2.5 py-1.5 rounded-xl shadow-[var(--shadow-hover)] border border-[var(--border-subtle)] ${getPlacementClasses(placement)}`}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FloatingCard;
