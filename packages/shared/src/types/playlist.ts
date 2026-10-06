import type { Track } from './track.js';

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean; // 是否为默认“全部音乐 / 原始歌单”
  parentId?: string | null; // 父级歌单/文件夹ID，null 或 undefined 表示根节点
  isFolder?: boolean; // 是否作为分类文件夹
  coverImagePath?: string;
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistTrackRelation {
  playlistId: string;
  trackId: string;
  sortOrder: number; // 浮点排序权值，支持无重排任意插入
  addedAt: number;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: Track[];
}

export interface PlaylistBreadcrumb {
  id: string;
  name: string;
}

export interface PlaylistTreeNode extends Playlist {
  children: PlaylistTreeNode[];
}

export interface PlaylistDetailResponse extends Playlist {
  tracks: Track[];
  children: Playlist[];
  breadcrumbs: PlaylistBreadcrumb[];
}
