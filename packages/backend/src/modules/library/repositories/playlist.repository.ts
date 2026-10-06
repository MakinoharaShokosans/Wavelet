import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  HealthyStatus,
  Playlist,
  PlaylistBreadcrumb,
  PlaylistTreeNode,
  Track,
} from '@wavelet/shared';
import type Database from 'better-sqlite3';
import { getConfig } from '../../../config/index.js';
import { getDatabase } from '../db/client.js';

function copyCoverFile(sourcePathOrBuffer: string | Buffer, targetPath: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (typeof sourcePathOrBuffer === 'string') {
    if (!fs.existsSync(sourcePathOrBuffer)) {
      throw new Error(`源封面文件不存在: ${sourcePathOrBuffer}`);
    }
    fs.copyFileSync(sourcePathOrBuffer, targetPath);
  } else {
    fs.writeFileSync(targetPath, sourcePathOrBuffer);
  }
}

interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
  parent_id: string | null;
  is_folder: number;
  cover_image_path: string | null;
  track_count: number;
  created_at: number;
  updated_at: number;
}

interface TrackRow {
  id: string;
  title: string;
  artist: string;
  album: string;
  album_artist: string | null;
  duration: number;
  bitrate: number;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  file_path: string;
  file_size: number;
  file_hash: string;
  has_embedded_cover: number;
  has_embedded_lyrics: number;
  healthy_status: string;
  repair_details: string | null;
  created_at: number;
  updated_at: number;
}

function mapRowToPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    isDefault: Boolean(row.is_default),
    parentId: row.parent_id ?? undefined,
    isFolder: Boolean(row.is_folder),
    coverImagePath: row.cover_image_path ?? undefined,
    trackCount: row.track_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist ?? undefined,
    duration: row.duration,
    bitrate: row.bitrate,
    sampleRate: row.sample_rate,
    bitDepth: row.bit_depth,
    channels: row.channels,
    filePath: row.file_path,
    fileSize: row.file_size,
    fileHash: row.file_hash,
    hasEmbeddedCover: Boolean(row.has_embedded_cover),
    hasEmbeddedLyrics: Boolean(row.has_embedded_lyrics),
    healthyStatus: row.healthy_status as HealthyStatus,
    repairDetails: row.repair_details ? JSON.parse(row.repair_details) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PlaylistRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  create(
    nameOrOptions:
      | string
      | {
          name: string;
          description?: string;
          parentId?: string | null;
          isFolder?: boolean;
          coverImagePath?: string;
        },
    description?: string,
    options?: { parentId?: string | null; isFolder?: boolean; coverImagePath?: string }
  ): Playlist {
    let name: string;
    let desc: string | undefined;
    let opts: { parentId?: string | null; isFolder?: boolean; coverImagePath?: string } | undefined;

    if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
      name = nameOrOptions.name;
      desc = nameOrOptions.description;
      opts = {
        parentId: nameOrOptions.parentId,
        isFolder: nameOrOptions.isFolder,
        coverImagePath: nameOrOptions.coverImagePath,
      };
    } else {
      name = nameOrOptions;
      desc = description;
      opts = options;
    }

    const id = `pl_${crypto.randomUUID()}`;
    const now = Date.now();
    const parentId = opts?.parentId ?? null;
    const isFolder = opts?.isFolder ? 1 : 0;

    if (parentId) {
      const parent = this.findById(parentId);
      if (!parent) {
        throw new Error(`指定的父级歌单/目录不存在 (ID: ${parentId})`);
      }
      if (parent.isDefault) {
        throw new Error('系统默认“全部音乐”歌单禁止添加子歌单');
      }
      const parentTrackCountRow = this.db
        .prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?')
        .get(parentId) as { count: number };
      if (parentTrackCountRow.count > 0) {
        throw new Error('该歌单内已包含歌曲，不能再放入子歌单');
      }
    }

    let managedCoverPath: string | null = null;
    if (opts?.coverImagePath) {
      const config = getConfig();
      const target = path.join(config.storage.cacheDir, 'covers', `pl_${id}.webp`);
      copyCoverFile(opts.coverImagePath, target);
      managedCoverPath = target;
    }

    this.db
      .prepare(`
        INSERT INTO playlists (id, name, description, is_default, parent_id, is_folder, cover_image_path, track_count, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?, ?)
      `)
      .run(id, name, desc ?? null, parentId, isFolder, managedCoverPath, now, now);

    return {
      id,
      name,
      description: desc,
      isDefault: false,
      parentId: parentId ?? undefined,
      isFolder: Boolean(isFolder),
      coverImagePath: managedCoverPath ?? undefined,
      trackCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(id: string): Playlist | null {
    const row = this.db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as
      | PlaylistRow
      | undefined;
    return row ? mapRowToPlaylist(row) : null;
  }

  findDefault(): Playlist {
    const row = this.db.prepare("SELECT * FROM playlists WHERE id = 'default_all_tracks'").get() as
      | PlaylistRow
      | undefined;
    if (row) return mapRowToPlaylist(row);
    const fallback = this.db
      .prepare("SELECT * FROM playlists WHERE is_default = 1 AND id != 'default_trash' LIMIT 1")
      .get() as PlaylistRow;
    return mapRowToPlaylist(fallback);
  }

  findUnintegrated(): Playlist | null {
    return this.findById('default_unintegrated_tracks');
  }

  findFavorites(): Playlist | null {
    return this.findById('default_favorites');
  }

  findTrash(): Playlist | null {
    return this.findById('default_trash');
  }

  isFavorite(trackId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
      .get('default_favorites', trackId);
    return Boolean(row);
  }

  toggleFavorite(trackId: string): boolean {
    const isFav = this.isFavorite(trackId);
    if (isFav) {
      this.removeTrackFromPlaylist('default_favorites', trackId);
      return false;
    }
    this.addTrackToPlaylist('default_favorites', trackId);
    return true;
  }

  findAll(): Playlist[] {
    const rows = this.db
      .prepare('SELECT * FROM playlists ORDER BY is_default DESC, created_at ASC')
      .all() as PlaylistRow[];
    return rows.map(mapRowToPlaylist);
  }

  findByParentId(parentId: string | null): Playlist[] {
    let rows: PlaylistRow[];
    if (parentId === null) {
      rows = this.db
        .prepare(
          'SELECT * FROM playlists WHERE parent_id IS NULL ORDER BY is_default DESC, created_at ASC'
        )
        .all() as PlaylistRow[];
    } else {
      rows = this.db
        .prepare('SELECT * FROM playlists WHERE parent_id = ? ORDER BY created_at ASC')
        .all(parentId) as PlaylistRow[];
    }
    return rows.map(mapRowToPlaylist);
  }

  findTree(): PlaylistTreeNode[] {
    const all = this.findAll().filter((p) => p.id !== 'default_trash');
    const nodeMap = new Map<string, PlaylistTreeNode>();

    for (const item of all) {
      nodeMap.set(item.id, {
        ...item,
        children: [],
      });
    }

    const roots: PlaylistTreeNode[] = [];

    for (const item of all) {
      const node = nodeMap.get(item.id);
      if (!node) continue;
      if (!item.parentId || !nodeMap.has(item.parentId)) {
        roots.push(node);
      } else {
        nodeMap.get(item.parentId)?.children.push(node);
      }
    }

    return roots;
  }

  getBreadcrumbs(playlistId: string): PlaylistBreadcrumb[] {
    const target = this.findById(playlistId);
    if (!target) return [];

    const breadcrumbs: PlaylistBreadcrumb[] = [];
    let current: Playlist | null = target;

    while (current) {
      breadcrumbs.unshift({ id: current.id, name: current.name });
      if (current.parentId) {
        current = this.findById(current.parentId);
      } else {
        break;
      }
    }

    return breadcrumbs;
  }

  addTrackToPlaylist(playlistId: string, trackId: string, customOrder?: number): void {
    const playlist = this.findById(playlistId);
    if (!playlist) {
      throw new Error(`歌单不存在 (ID: ${playlistId})`);
    }

    if (playlist.isFolder) {
      throw new Error('该歌单为目录文件夹，不能放入歌曲');
    }

    const childCountRow = this.db
      .prepare('SELECT COUNT(*) as count FROM playlists WHERE parent_id = ?')
      .get(playlistId) as { count: number };
    if (childCountRow.count > 0) {
      throw new Error('该歌单内已包含子歌单，不能放入歌曲');
    }

    const now = Date.now();

    const addTx = this.db.transaction(() => {
      // 计算默认浮点排序权重
      let order = customOrder;
      if (order === undefined) {
        const maxOrderRow = this.db
          .prepare('SELECT MAX(sort_order) as max_order FROM playlist_tracks WHERE playlist_id = ?')
          .get(playlistId) as { max_order: number | null };
        order = (maxOrderRow.max_order ?? 0) + 1.0;
      }

      this.db
        .prepare(`
          INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, sort_order, added_at)
          VALUES (?, ?, ?, ?)
        `)
        .run(playlistId, trackId, order, now);

      // 同步更新歌单 track_count 冗余计数
      this.updateTrackCount(playlistId);

      // 若加入的是用户自定义歌单 (非系统默认)，且该曲目存在于未集成歌单中，则自动移出
      if (!playlist.isDefault) {
        const deleted = this.db
          .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
          .run('default_unintegrated_tracks', trackId);
        if (deleted.changes > 0) {
          this.updateTrackCount('default_unintegrated_tracks');
        }
      }
    });

    addTx();
  }

  addTracksToPlaylist(playlistId: string, trackIds: string[]): { addedCount: number } {
    if (trackIds.length === 0) return { addedCount: 0 };

    const playlist = this.findById(playlistId);
    if (!playlist) {
      throw new Error(`歌单不存在 (ID: ${playlistId})`);
    }
    if (playlist.isFolder) {
      throw new Error('该歌单为目录文件夹，不能放入歌曲');
    }

    const childCountRow = this.db
      .prepare('SELECT COUNT(*) as count FROM playlists WHERE parent_id = ?')
      .get(playlistId) as { count: number };
    if (childCountRow.count > 0) {
      throw new Error('该歌单内已包含子歌单，不能放入歌曲');
    }

    const now = Date.now();
    let addedCount = 0;

    const addBatchTx = this.db.transaction(() => {
      const maxOrderRow = this.db
        .prepare('SELECT MAX(sort_order) as max_order FROM playlist_tracks WHERE playlist_id = ?')
        .get(playlistId) as { max_order: number | null };
      let order = (maxOrderRow.max_order ?? 0) + 1.0;

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, sort_order, added_at)
        VALUES (?, ?, ?, ?)
      `);

      const delUnintegratedStmt = this.db.prepare(
        'DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?'
      );

      for (const trackId of trackIds) {
        insertStmt.run(playlistId, trackId, order, now);
        order += 1.0;
        addedCount++;

        if (!playlist.isDefault) {
          delUnintegratedStmt.run('default_unintegrated_tracks', trackId);
        }
      }

      this.updateTrackCount(playlistId);
      if (!playlist.isDefault) {
        this.updateTrackCount('default_unintegrated_tracks');
      }
    });

    addBatchTx();
    return { addedCount };
  }

  removeTrackFromPlaylist(playlistId: string, trackId: string): void {
    const removeTx = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
        .run(playlistId, trackId);

      this.updateTrackCount(playlistId);
    });

    removeTx();
  }

  trashTrack(trackId: string): void {
    const trashTx = this.db.transaction(() => {
      // 1. 查找此曲目当前关联的所有歌单 ID，用于后续重算 track_count
      const relations = this.db
        .prepare('SELECT playlist_id FROM playlist_tracks WHERE track_id = ?')
        .all(trackId) as { playlist_id: string }[];

      const affectedPlaylistIds = new Set(relations.map((r) => r.playlist_id));

      // 2. 从所有歌单中脱离关系
      this.db.prepare('DELETE FROM playlist_tracks WHERE track_id = ?').run(trackId);

      // 3. 将曲目挂载入 default_trash
      const maxOrderRow = this.db
        .prepare('SELECT MAX(sort_order) as max_order FROM playlist_tracks WHERE playlist_id = ?')
        .get('default_trash') as { max_order: number | null };
      const order = (maxOrderRow.max_order ?? 0) + 1.0;

      this.db
        .prepare(`
          INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, sort_order, added_at)
          VALUES ('default_trash', ?, ?, ?)
        `)
        .run(trackId, order, Date.now());

      // 4. 更新 tracks 表中的 is_trashed 标记与更新时间
      this.db
        .prepare('UPDATE tracks SET is_trashed = 1, updated_at = ? WHERE id = ?')
        .run(Date.now(), trackId);

      // 5. 刷新受影响的所有歌单 track_count
      affectedPlaylistIds.add('default_trash');
      for (const plId of affectedPlaylistIds) {
        this.updateTrackCount(plId);
      }
    });

    trashTx();
  }

  restoreTrack(trackId: string): void {
    const restoreTx = this.db.transaction(() => {
      // 1. 从 default_trash 移出
      this.db
        .prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?')
        .run('default_trash', trackId);

      // 2. 将曲目标记为 is_trashed = 0
      this.db
        .prepare('UPDATE tracks SET is_trashed = 0, updated_at = ? WHERE id = ?')
        .run(Date.now(), trackId);

      // 3. 挂载回 default_all_tracks 与 default_unintegrated_tracks
      const now = Date.now();
      for (const plId of ['default_all_tracks', 'default_unintegrated_tracks']) {
        const maxOrderRow = this.db
          .prepare('SELECT MAX(sort_order) as max_order FROM playlist_tracks WHERE playlist_id = ?')
          .get(plId) as { max_order: number | null };
        const order = (maxOrderRow.max_order ?? 0) + 1.0;

        this.db
          .prepare(`
            INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, sort_order, added_at)
            VALUES (?, ?, ?, ?)
          `)
          .run(plId, trackId, order, now);

        this.updateTrackCount(plId);
      }

      this.updateTrackCount('default_trash');
    });

    restoreTx();
  }

  emptyTrash(integrityGuard?: { purgeTrackCompletely: (id: string) => boolean }): {
    purgedCount: number;
  } {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT track_id FROM playlist_tracks WHERE playlist_id = 'default_trash' UNION SELECT id as track_id FROM tracks WHERE is_trashed = 1"
      )
      .all() as { track_id: string }[];

    let purgedCount = 0;
    for (const row of rows) {
      if (integrityGuard) {
        integrityGuard.purgeTrackCompletely(row.track_id);
      } else {
        this.db.prepare('DELETE FROM tracks WHERE id = ?').run(row.track_id);
      }
      purgedCount++;
    }

    this.updateTrackCount('default_trash');
    return { purgedCount };
  }

  getPlaylistTracks(playlistId: string, recursive = false): Track[] {
    if (!recursive) {
      const isTrash = playlistId === 'default_trash';
      const sql = isTrash
        ? `
          SELECT t.* FROM tracks t
          INNER JOIN playlist_tracks pt ON t.id = pt.track_id
          WHERE pt.playlist_id = ?
          ORDER BY pt.sort_order ASC
        `
        : `
          SELECT t.* FROM tracks t
          INNER JOIN playlist_tracks pt ON t.id = pt.track_id
          WHERE pt.playlist_id = ? AND COALESCE(t.is_trashed, 0) = 0
          ORDER BY pt.sort_order ASC
        `;
      const rows = this.db.prepare(sql).all(playlistId) as TrackRow[];

      return rows.map(mapRowToTrack);
    }

    // 递归获取当前歌单及其全部子孙目录中的去重曲目
    const rows = this.db
      .prepare(`
        WITH RECURSIVE playlist_tree AS (
          SELECT id FROM playlists WHERE id = ?
          UNION ALL
          SELECT p.id FROM playlists p
          INNER JOIN playlist_tree pt ON p.parent_id = pt.id
        )
        SELECT DISTINCT t.* FROM tracks t
        INNER JOIN playlist_tracks pt ON t.id = pt.track_id
        INNER JOIN playlist_tree tree ON pt.playlist_id = tree.id
        WHERE COALESCE(t.is_trashed, 0) = 0
        ORDER BY pt.sort_order ASC
      `)
      .all(playlistId) as TrackRow[];

    return rows.map(mapRowToTrack);
  }

  update(
    id: string,
    updates: {
      name?: string;
      description?: string;
      coverImagePath?: string;
      parentId?: string | null;
      isFolder?: boolean;
    }
  ): void {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`歌单不存在 (ID: ${id})`);
    }

    this.validateUpdate(existing, updates);

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: Date.now() };

    if (updates.name !== undefined) {
      setClauses.push('name = @name');
      params.name = updates.name;
    }
    if (updates.description !== undefined) {
      setClauses.push('description = @description');
      params.description = updates.description;
    }
    if (updates.coverImagePath !== undefined) {
      let finalCover = updates.coverImagePath;
      if (finalCover) {
        const config = getConfig();
        const standardPath = path.join(config.storage.cacheDir, 'covers', `pl_${id}.webp`);
        if (finalCover !== standardPath && fs.existsSync(finalCover)) {
          copyCoverFile(finalCover, standardPath);
          finalCover = standardPath;
        }
      }
      setClauses.push('cover_image_path = @cover_image_path');
      params.cover_image_path = finalCover || null;
    }
    if (updates.parentId !== undefined) {
      setClauses.push('parent_id = @parent_id');
      params.parent_id = updates.parentId;
    }
    if (updates.isFolder !== undefined) {
      setClauses.push('is_folder = @is_folder');
      params.is_folder = updates.isFolder ? 1 : 0;
    }

    if (setClauses.length === 0) return;
    setClauses.push('updated_at = @updated_at');

    this.db.prepare(`UPDATE playlists SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
  }

  setCover(playlistId: string, sourcePathOrBuffer: string | Buffer): string {
    const playlist = this.findById(playlistId);
    if (!playlist) {
      throw new Error(`歌单不存在 (ID: ${playlistId})`);
    }
    const config = getConfig();
    const targetPath = path.join(config.storage.cacheDir, 'covers', `pl_${playlistId}.webp`);
    copyCoverFile(sourcePathOrBuffer, targetPath);
    this.update(playlistId, { coverImagePath: targetPath });
    return targetPath;
  }

  copyCoverFromTrack(playlistId: string, trackId?: string): string {
    const playlist = this.findById(playlistId);
    if (!playlist) {
      throw new Error(`歌单不存在 (ID: ${playlistId})`);
    }

    const config = getConfig();
    let targetTrackId = trackId;

    if (!targetTrackId) {
      const tracks = this.getPlaylistTracks(playlistId, false);
      for (const t of tracks) {
        const p = path.join(config.storage.cacheDir, 'covers', `${t.fileHash}.webp`);
        if (t.hasEmbeddedCover || fs.existsSync(p)) {
          targetTrackId = t.id;
          break;
        }
      }
      if (!targetTrackId) {
        throw new Error('歌单内暂无可供拷贝封面的歌曲');
      }
    }

    const trackRow = this.db
      .prepare('SELECT id, file_hash, has_embedded_cover FROM tracks WHERE id = ?')
      .get(targetTrackId) as
      | { id: string; file_hash: string; has_embedded_cover: number }
      | undefined;

    if (!trackRow) {
      throw new Error(`指定曲目不存在 (ID: ${targetTrackId})`);
    }

    const trackCoverPath = path.join(
      config.storage.cacheDir,
      'covers',
      `${trackRow.file_hash}.webp`
    );
    if (!fs.existsSync(trackCoverPath)) {
      throw new Error('该歌曲尚未提取或不存在封面图片');
    }

    return this.setCover(playlistId, trackCoverPath);
  }

  removeCover(playlistId: string): void {
    const playlist = this.findById(playlistId);
    if (!playlist) return;
    if (playlist.coverImagePath && fs.existsSync(playlist.coverImagePath)) {
      try {
        fs.unlinkSync(playlist.coverImagePath);
      } catch {
        // ignore
      }
    }
    this.update(playlistId, { coverImagePath: '' });
  }

  delete(id: string): boolean {
    const playlist = this.findById(id);
    if (!playlist) return false;
    if (id === 'default_all_tracks') {
      throw new Error('系统默认“全部音乐”歌单禁止删除');
    }
    if (playlist.isDefault) {
      throw new Error('系统默认歌单禁止删除');
    }

    const result = this.db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private validateUpdate(
    existing: Playlist,
    updates: { parentId?: string | null; isFolder?: boolean }
  ): void {
    if (existing.isDefault && updates.parentId !== undefined && updates.parentId !== null) {
      throw new Error('系统默认“全部音乐”歌单禁止移入子目录');
    }

    if (updates.parentId !== undefined && updates.parentId !== null) {
      this.assertNoCycle(existing.id, updates.parentId);

      const targetParent = this.findById(updates.parentId);
      if (targetParent?.isDefault) {
        throw new Error('系统默认“全部音乐”歌单禁止添加子歌单');
      }

      const parentTrackCountRow = this.db
        .prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?')
        .get(updates.parentId) as { count: number };
      if (parentTrackCountRow.count > 0) {
        throw new Error('目标歌单内已包含歌曲，不能移入子歌单');
      }
    }

    if (updates.isFolder === true) {
      const trackCountRow = this.db
        .prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?')
        .get(existing.id) as { count: number };
      if (trackCountRow.count > 0) {
        throw new Error('该歌单内已包含歌曲，不能转换为目录文件夹');
      }
    }
  }

  private assertNoCycle(targetId: string, newParentId: string): void {
    if (targetId === newParentId) {
      throw new Error('不能将歌单或目录的父级设置为其自身');
    }

    const parent = this.findById(newParentId);
    if (!parent) {
      throw new Error(`目标父级歌单/目录不存在 (ID: ${newParentId})`);
    }

    // 向上追溯 newParentId 的所有祖先
    let ancestorId: string | null | undefined = parent.parentId;
    while (ancestorId) {
      if (ancestorId === targetId) {
        throw new Error('不能将歌单或目录移动到其后代子目录中，这会导致循环嵌套死锁');
      }
      const ancestor = this.findById(ancestorId);
      ancestorId = ancestor?.parentId;
    }
  }

  private updateTrackCount(playlistId: string): void {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as count FROM playlist_tracks WHERE playlist_id = ?')
      .get(playlistId) as { count: number };

    this.db
      .prepare('UPDATE playlists SET track_count = ?, updated_at = ? WHERE id = ?')
      .run(countRow.count, Date.now(), playlistId);
  }
}
