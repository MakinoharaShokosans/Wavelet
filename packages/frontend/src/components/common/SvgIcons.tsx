import type React from 'react';
import type { SvgIconName, SvgIconProps } from '../../types/component.js';

export const SvgIcons: React.FC<SvgIconProps> = ({
  name,
  className = '',
  size = 20,
  color = 'currentColor',
}) => {
  const renderPath = (iconName: SvgIconName): React.ReactNode => {
    switch (iconName) {
      case 'play':
        return (
          <polygon
            points="7 4 19 12 7 20 7 4"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        );
      case 'pause':
        return (
          <>
            <rect x="6" y="5" width="4" height="14" rx="2" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="2" fill="currentColor" />
          </>
        );
      case 'previous':
        return (
          <>
            <line
              x1="5"
              y1="4"
              x2="5"
              y2="20"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <polygon
              points="19 5 8 12 19 19 19 5"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </>
        );
      case 'next':
        return (
          <>
            <polygon
              points="5 5 16 12 5 19 5 5"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <line
              x1="19"
              y1="4"
              x2="19"
              y2="20"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        );
      case 'volume':
        return (
          <>
            <polygon points="4 9 8 9 13 5 13 19 8 15 4 15 4 9" fill="currentColor" />
            <path
              d="M16 8.5C17.5 10 17.5 14 16 15.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M19 6C21.5 8.5 21.5 15.5 19 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'volume-mute':
        return (
          <>
            <polygon points="4 9 8 9 13 5 13 19 8 15 4 15 4 9" fill="currentColor" />
            <line
              x1="16"
              y1="9"
              x2="21"
              y2="15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="21"
              y1="9"
              x2="16"
              y2="15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'repeat':
        return (
          <>
            <path
              d="M17 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 11V9a4 4 0 0 1 4-4h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M7 22l-4-4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 13v2a4 4 0 0 1-4 4H3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'repeat-track':
        return (
          <>
            <path
              d="M17 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 11V9a4 4 0 0 1 4-4h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M7 22l-4-4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 13v2a4 4 0 0 1-4 4H3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </>
        );
      case 'shuffle':
        return (
          <>
            <path
              d="M16 3h5v5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 20L21 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 16v5h-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 15l6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 4l5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      case 'sequence':
        return (
          <>
            <line
              x1="4"
              y1="6"
              x2="16"
              y2="6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="4"
              y1="12"
              x2="20"
              y2="12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="4"
              y1="18"
              x2="12"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <polygon points="17 16 21 12 17 8 17 16" fill="currentColor" />
          </>
        );
      case 'folder':
        return (
          <path
            d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'music':
        return (
          <>
            <path
              d="M9 18V5l12-2v13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="6" cy="18" r="3" fill="currentColor" />
            <circle cx="18" cy="16" r="3" fill="currentColor" />
          </>
        );
      case 'heart':
        return (
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'heart-filled':
        return (
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        );
      case 'wave':
        return (
          <>
            <line
              x1="3"
              y1="12"
              x2="3"
              y2="12.01"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <line
              x1="7"
              y1="8"
              x2="7"
              y2="16"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="11"
              y1="4"
              x2="11"
              y2="20"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="15"
              y1="7"
              x2="15"
              y2="17"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="19"
              y1="10"
              x2="19"
              y2="14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        );
      case 'plus':
        return (
          <>
            <line
              x1="12"
              y1="5"
              x2="12"
              y2="19"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        );
      case 'close':
        return (
          <>
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'chevron-right':
        return (
          <path
            d="M9 18l6-6-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'chevron-left':
        return (
          <path
            d="M15 18l-6-6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'chevron-down':
        return (
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'check':
        return (
          <path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'bit-perfect':
        return (
          <polygon
            points="6 2 18 2 22 8 12 22 2 8 6 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'headphones':
        return (
          <>
            <path
              d="M3 18v-6a9 9 0 0 1 18 0v6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      case 'list':
        return (
          <>
            <line
              x1="4"
              y1="6"
              x2="20"
              y2="6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="4"
              y1="12"
              x2="20"
              y2="12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="4"
              y1="18"
              x2="20"
              y2="18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        );
      case 'grid':
        return (
          <>
            <rect
              x="3"
              y="3"
              width="7"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <rect
              x="14"
              y="3"
              width="7"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <rect
              x="14"
              y="14"
              width="7"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <rect
              x="3"
              y="14"
              width="7"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </>
        );
      case 'search':
        return (
          <>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
            <line
              x1="21"
              y1="21"
              x2="16"
              y2="16"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        );
      case 'clock':
        return (
          <>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none" />
            <polyline
              points="12 7 12 12 15 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </>
        );
      case 'archive':
        return (
          <>
            <polyline
              points="21 8 21 21 3 21 3 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <rect
              x="1"
              y="3"
              width="22"
              height="5"
              rx="1"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
            <line
              x1="10"
              y1="12"
              x2="14"
              y2="12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'download':
        return (
          <>
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <polyline
              points="7 10 12 15 17 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <line
              x1="12"
              y1="15"
              x2="12"
              y2="3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      case 'trash':
        return (
          <>
            <polyline
              points="3 6 5 6 21 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <line
              x1="10"
              y1="11"
              x2="10"
              y2="17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="14"
              y1="11"
              x2="14"
              y2="17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        );
      case 'edit':
        return (
          <path
            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      case 'restore':
        return (
          <>
            <polyline
              points="1 4 1 10 7 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        );
      case 'image':
        return (
          <>
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <polyline
              points="21 15 16 10 5 21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ color, flexShrink: 0 }}
      aria-hidden="true"
    >
      {renderPath(name)}
    </svg>
  );
};

export default SvgIcons;
