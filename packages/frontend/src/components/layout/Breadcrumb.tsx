import type React from 'react';
import { useLibraryStore } from '../../stores/library.store.js';
import { useUIStore } from '../../stores/ui.store.js';
import { SvgIcons } from '../common/SvgIcons.js';

export const Breadcrumb: React.FC = () => {
  const { breadcrumbStack, popBreadcrumb, navigate } = useUIStore();
  const { playlists, selectPlaylist } = useLibraryStore();

  if (breadcrumbStack.length <= 1) {
    return null;
  }

  const handleItemClick = (index: number) => {
    const targetItem = breadcrumbStack[index];
    popBreadcrumb(index);
    if (index === 0) {
      selectPlaylist(null);
      navigate('carousel');
    } else {
      const pl = playlists.find((p) => p.id === targetItem.id);
      if (pl) {
        selectPlaylist(pl);
        navigate('playlist-detail');
      }
    }
  };

  return (
    <nav className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] py-2 select-none">
      {breadcrumbStack.map((item, idx) => {
        const isLast = idx === breadcrumbStack.length - 1;

        return (
          <div key={item.id} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span className="text-[var(--text-tertiary)] opacity-60">
                <SvgIcons name="chevron-right" size={14} />
              </span>
            )}
            <button
              type="button"
              onClick={() => handleItemClick(idx)}
              className={`hover:text-[var(--text-primary)] transition-colors ${
                isLast
                  ? 'font-semibold text-[var(--text-primary)] cursor-default'
                  : 'hover:underline cursor-pointer'
              }`}
            >
              {item.name}
            </button>
          </div>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;
