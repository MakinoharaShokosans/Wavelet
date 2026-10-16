import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useUIStore } from '../../stores/ui.store.js';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useUIStore();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none flex flex-col items-center gap-2 max-w-md w-full px-4">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isWarn = toast.type === 'warn';
          const isError = toast.type === 'error';
          const isSuccess = toast.type === 'success';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg border backdrop-blur-xl text-xs font-medium cursor-pointer select-none bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-primary)]"
              onClick={() => dismissToast(toast.id)}
            >
              {isWarn && (
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
              )}
              {isError && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
              {isSuccess && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
              {!isWarn && !isError && !isSuccess && (
                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              )}
              <span className="truncate">{toast.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
