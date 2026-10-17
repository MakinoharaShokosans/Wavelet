import type React from 'react';
import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/player.store.js';

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsPanelProps {
  lyricsText?: string;
  className?: string;
}

function parseLrc(lrcText: string): LyricLine[] {
  if (!lrcText) return [];

  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const rawLine of lines) {
    const match = rawLine.match(timeRegex);
    if (match) {
      const min = Number.parseInt(match[1], 10);
      const sec = Number.parseInt(match[2], 10);
      const ms = Number.parseInt(match[3].padEnd(3, '0'), 10);
      const timeMs = min * 60 * 1000 + sec * 1000 + ms;
      const text = match[4].trim();
      if (text) {
        result.push({ timeMs, text });
      }
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs);
}

export const LyricsPanel: React.FC<LyricsPanelProps> = ({ lyricsText = '', className = '' }) => {
  const { currentTimeMs, seek } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);

  const lines = parseLrc(lyricsText);

  // 匹配当前毫秒播放行
  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTimeMs >= lines[i].timeMs) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // 垂直居中平滑滚动
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      const container = containerRef.current;
      const activeEl = activeLineRef.current;
      const targetTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      });
    }
  }, [activeIndex]);

  if (lines.length === 0) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center text-center p-8 select-none ${className}`}
      >
        <p className="text-sm font-semibold text-[var(--text-secondary)] mb-1">
          无损母带发烧直通呈现
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">当前音频暂无内嵌时间轴歌词</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-y-auto px-6 py-32 space-y-6 select-none scrollbar-none text-center ${className}`}
      style={{ scrollBehavior: 'smooth' }}
    >
      {lines.map((line, idx) => {
        const isActive = idx === activeIndex;

        return (
          <button
            type="button"
            key={`${line.timeMs}-${idx}`}
            ref={isActive ? activeLineRef : null}
            onClick={() => seek(line.timeMs)}
            className={`w-full block transition-all duration-300 cursor-pointer bg-transparent border-0 p-0 text-center ${
              isActive
                ? 'text-lg font-bold text-[var(--text-primary)] scale-105'
                : 'text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] opacity-50 hover:opacity-80'
            }`}
          >
            {line.text}
          </button>
        );
      })}
    </div>
  );
};

export default LyricsPanel;
