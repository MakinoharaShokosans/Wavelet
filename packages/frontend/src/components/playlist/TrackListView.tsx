import type { Track } from '@wavelet/shared';
import type React from 'react';
import { useState } from 'react';
import TrackListItem from './TrackListItem.js';

export interface TrackListViewProps {
  tracks: Track[];
  playlistId: string;
}

export const TrackListView: React.FC<TrackListViewProps> = ({ tracks, playlistId }) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [activeSort, setActiveSort] = useState<'default' | 'duration' | 'hires' | 'frequent'>(
    'default'
  );

  // 本地即时过滤与排序
  const filtered = tracks.filter((t) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (activeSort === 'duration') return b.duration - a.duration;
    if (activeSort === 'hires') return b.sampleRate - a.sampleRate;
    if (activeSort === 'frequent') return (b.playCount || 0) - (a.playCount || 0);
    return 0;
  });

  return (
    <div className="w-full flex flex-col space-y-3">
      {/* 搜索过滤与排序工具条 */}
      <div className="flex items-center justify-between gap-4 px-2 mb-2">
        <input
          type="text"
          placeholder="快速检索曲目或艺术家..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="max-w-xs w-full px-3.5 py-1.5 rounded-xl bg-white border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--border-focus)] transition-colors"
        />

        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--text-tertiary)] mr-1">排序:</span>
          <button
            type="button"
            onClick={() => setActiveSort('default')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activeSort === 'default'
                ? 'bg-white font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                : 'hover:text-[var(--text-primary)]'
            }`}
          >
            默认
          </button>
          <button
            type="button"
            onClick={() => setActiveSort('frequent')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activeSort === 'frequent'
                ? 'bg-white font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                : 'hover:text-[var(--text-primary)]'
            }`}
          >
            常听
          </button>
          <button
            type="button"
            onClick={() => setActiveSort('hires')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              activeSort === 'hires'
                ? 'bg-white font-semibold text-[var(--text-primary)] shadow-[var(--shadow-xs)]'
                : 'hover:text-[var(--text-primary)]'
            }`}
          >
            Hi-Res 母带
          </button>
        </div>
      </div>

      {/* 列表正文 */}
      <div className="space-y-1">
        {sorted.map((t, idx) => (
          <TrackListItem
            key={t.id}
            track={t}
            index={idx}
            playlistId={playlistId}
            allTracks={sorted}
          />
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-12 text-xs text-[var(--text-tertiary)]">
            未发现符合条件的曲目
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackListView;
