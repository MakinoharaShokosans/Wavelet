export type TrackFormat = 'flac' | 'wav' | 'mp3' | 'aac' | 'ogg' | 'm4a' | 'alac' | 'ape';

export type HealthyStatus = 'healthy' | 'repaired' | 'corrupted' | 'missing';

export interface RepairDetail {
  type: string;
  description: string;
  repairedAt: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  duration: number; // 秒 (浮点数)
  bitrate: number; // bps
  sampleRate: number; // Hz (如 44100, 96000, 192000)
  bitDepth: number; // bit (如 16, 24)
  channels: number; // 1, 2
  filePath: string; // 本地物理标准化绝对路径
  fileSize: number; // 字节
  fileHash: string; // SHA-256
  hasEmbeddedCover: boolean;
  hasEmbeddedLyrics: boolean;
  healthyStatus: HealthyStatus;
  repairDetails?: RepairDetail[];
  playCount?: number;
  lastPlayedAt?: number;
  isFavorite?: boolean;
  isTrashed?: boolean;
  isMissing?: boolean;
  missingAt?: number | null;
  titleLocked?: boolean;
  artistLocked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TrackSortOption = 'recent' | 'played' | 'frequent' | 'hires' | 'title' | 'artist';

export interface TrackQueryParams {
  keyword?: string;
  artist?: string;
  album?: string;
  healthyStatus?: HealthyStatus;
  sort?: TrackSortOption;
  trashed?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
