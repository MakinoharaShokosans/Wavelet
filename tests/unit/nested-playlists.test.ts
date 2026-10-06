import { Database, PlaylistRepository, TrackRepository, runMigrations } from '@wavelet/backend';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Unit Test: Nested Playlists & Folder Hierarchy (树状目录歌单与分类文件夹)', () => {
  let db: Database.Database;
  let playlistRepo: PlaylistRepository;
  let trackRepo: TrackRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    playlistRepo = new PlaylistRepository(db);
    trackRepo = new TrackRepository(db);
  });

  it('应当成功创建多层嵌套歌单与目录文件夹并正确映射 parent_id 与 isFolder', () => {
    // 1. 创建顶层根目录文件夹 (ACG 音乐)
    const rootFolder = playlistRepo.create('ACG 音乐', '动画与二次元音乐分类', {
      isFolder: true,
    });
    expect(rootFolder.parentId).toBeUndefined();
    expect(rootFolder.isFolder).toBe(true);

    // 2. 在根目录下创建二级分类子文件夹 (J-Pop 专区)
    const subFolder = playlistRepo.create('J-Pop 专区', '日系流行音轨', {
      parentId: rootFolder.id,
      isFolder: true,
    });
    expect(subFolder.parentId).toBe(rootFolder.id);
    expect(subFolder.isFolder).toBe(true);

    // 3. 在二级子目录下创建三级实体歌单 (鎖那 精选集)
    const leafPlaylist = playlistRepo.create('鎖那 精选集', 'Sana 个人音乐专区', {
      parentId: subFolder.id,
      isFolder: false,
    });
    expect(leafPlaylist.parentId).toBe(subFolder.id);
    expect(leafPlaylist.isFolder).toBe(false);

    // 4. 按 parentId 检索直属下级
    const rootChildren = playlistRepo.findByParentId(rootFolder.id);
    expect(rootChildren.length).toBe(1);
    expect(rootChildren[0].id).toBe(subFolder.id);

    const subChildren = playlistRepo.findByParentId(subFolder.id);
    expect(subChildren.length).toBe(1);
    expect(subChildren[0].id).toBe(leafPlaylist.id);
  });

  it('findTree() 应当正确将平铺数据组装为完整的目录树', () => {
    // 建立结构：
    // [全部音乐] (默认根)
    // [ACG 音乐] (文件夹)
    //   ├── [J-Pop 专区] (文件夹)
    //   │     └── [鎖那 精选集] (歌单)
    //   └── [原声大碟 OST] (歌单)
    // [古典音乐] (歌单)

    const acg = playlistRepo.create('ACG 音乐', undefined, { isFolder: true });
    const jpop = playlistRepo.create('J-Pop 专区', undefined, { parentId: acg.id, isFolder: true });
    const sana = playlistRepo.create('鎖那 精选集', undefined, { parentId: jpop.id });
    const ost = playlistRepo.create('原声大碟 OST', undefined, { parentId: acg.id });
    const classical = playlistRepo.create('古典音乐');

    const tree = playlistRepo.findTree();

    // 根节点应该包含：默认全部音乐、未集成音乐、心动收藏、ACG 音乐、古典音乐
    expect(tree.length).toBe(5);
    expect(tree.some((n) => n.id === 'default_all_tracks')).toBe(true);
    expect(tree.some((n) => n.id === 'default_unintegrated_tracks')).toBe(true);
    expect(tree.some((n) => n.id === 'default_favorites')).toBe(true);
    expect(tree.some((n) => n.id === classical.id)).toBe(true);

    const acgNode = tree.find((n) => n.id === acg.id);
    expect(acgNode).toBeDefined();
    expect(acgNode?.children.length).toBe(2);

    const jpopNode = acgNode?.children.find((c) => c.id === jpop.id);
    expect(jpopNode).toBeDefined();
    expect(jpopNode?.children.length).toBe(1);
    expect(jpopNode?.children[0].id).toBe(sana.id);

    const ostNode = acgNode?.children.find((c) => c.id === ost.id);
    expect(ostNode).toBeDefined();
    expect(ostNode?.children.length).toBe(0);
  });

  it('getBreadcrumbs() 应当正确生成自顶向下的层级面包屑导航路径', () => {
    const acg = playlistRepo.create('ACG 音乐', undefined, { isFolder: true });
    const jpop = playlistRepo.create('J-Pop 专区', undefined, { parentId: acg.id, isFolder: true });
    const sana = playlistRepo.create('鎖那 精选集', undefined, { parentId: jpop.id });

    const breadcrumbs = playlistRepo.getBreadcrumbs(sana.id);
    expect(breadcrumbs).toEqual([
      { id: acg.id, name: 'ACG 音乐' },
      { id: jpop.id, name: 'J-Pop 专区' },
      { id: sana.id, name: '鎖那 精选集' },
    ]);
  });

  it('getPlaylistTracks(id, recursive=true) 应当递归穿透汇总子孙目录下的所有曲目', () => {
    // 注入两首曲目
    trackRepo.insert({
      id: 'trk_001',
      title: '彼女は旅に出る',
      artist: '鎖那',
      album: 'Hush a by little girl',
      duration: 220,
      bitrate: 320000,
      sampleRate: 96000,
      bitDepth: 24,
      channels: 2,
      filePath: '/music/sana_01.flac',
      fileSize: 80000000,
      fileHash: 'hash_sana_01',
      hasEmbeddedCover: true,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    trackRepo.insert({
      id: 'trk_002',
      title: '春泥棒',
      artist: 'ヨルシカ',
      album: '創作',
      duration: 290,
      bitrate: 320000,
      sampleRate: 48000,
      bitDepth: 24,
      channels: 2,
      filePath: '/music/yorushika_01.flac',
      fileSize: 60000000,
      fileHash: 'hash_yorushika_01',
      hasEmbeddedCover: true,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 建立结构：ACG(Folder) -> J-Pop(Folder) -> [Sana(Playlist), Yorushika(Playlist)]
    const acg = playlistRepo.create('ACG 音乐', undefined, { isFolder: true });
    const jpop = playlistRepo.create('J-Pop 专区', undefined, { parentId: acg.id, isFolder: true });
    const sana = playlistRepo.create('鎖那 精选集', undefined, { parentId: jpop.id });
    const yorushika = playlistRepo.create('ヨルシカ 精选集', undefined, { parentId: jpop.id });

    // 在三级歌单 sana 中放入 trk_001
    playlistRepo.addTrackToPlaylist(sana.id, 'trk_001');
    // 在三级歌单 yorushika 中放入 trk_002
    playlistRepo.addTrackToPlaylist(yorushika.id, 'trk_002');

    // 1. 非递归方式查询根目录 ACG 与二级目录 J-Pop，曲目数应为 0
    const nonRecursiveTracks = playlistRepo.getPlaylistTracks(acg.id, false);
    expect(nonRecursiveTracks.length).toBe(0);
    expect(playlistRepo.getPlaylistTracks(jpop.id, false).length).toBe(0);

    // 2. 递归方式查询根目录 ACG，曲目数应自动穿透汇总为 2 (包含 trk_001 和 trk_002)
    const recursiveTracks = playlistRepo.getPlaylistTracks(acg.id, true);
    expect(recursiveTracks.length).toBe(2);
    expect(recursiveTracks.some((t) => t.id === 'trk_001')).toBe(true);
    expect(recursiveTracks.some((t) => t.id === 'trk_002')).toBe(true);

    // 3. 递归查询二级目录 J-Pop，曲目数也应为 2
    const jpopTracks = playlistRepo.getPlaylistTracks(jpop.id, true);
    expect(jpopTracks.length).toBe(2);
  });

  it('互斥约束：有歌单则不能放歌曲，有歌曲则不能放歌单', () => {
    // 准备一首测试歌曲
    trackRepo.insert({
      id: 'trk_mutex_01',
      title: 'Mutex Track',
      artist: 'Artist',
      album: 'Album',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/mutex.flac',
      fileSize: 1000,
      fileHash: 'hash_mutex',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 1. 歌单内已有子歌单，禁止放入歌曲
    const parentPlaylist = playlistRepo.create('父级歌单');
    const childPlaylist = playlistRepo.create('子级歌单', undefined, {
      parentId: parentPlaylist.id,
    });
    expect(() => {
      playlistRepo.addTrackToPlaylist(parentPlaylist.id, 'trk_mutex_01');
    }).toThrow('该歌单内已包含子歌单，不能放入歌曲');

    // 2. 标记为目录文件夹的歌单，禁止放入歌曲
    const folder = playlistRepo.create('空目录文件夹', undefined, { isFolder: true });
    expect(() => {
      playlistRepo.addTrackToPlaylist(folder.id, 'trk_mutex_01');
    }).toThrow('该歌单为目录文件夹，不能放入歌曲');

    // 3. 歌单内已有歌曲，禁止创建子歌单挂在其下
    const songPlaylist = playlistRepo.create('纯歌曲歌单');
    playlistRepo.addTrackToPlaylist(songPlaylist.id, 'trk_mutex_01');
    expect(() => {
      playlistRepo.create('非法子歌单', undefined, { parentId: songPlaylist.id });
    }).toThrow('该歌单内已包含歌曲，不能再放入子歌单');

    // 4. 歌单内已有歌曲，禁止将其他已有歌单移入（作为其子歌单）
    const anotherPlaylist = playlistRepo.create('游离歌单');
    expect(() => {
      playlistRepo.update(anotherPlaylist.id, { parentId: songPlaylist.id });
    }).toThrow('目标歌单内已包含歌曲，不能移入子歌单');

    // 5. 歌单内已有歌曲，禁止转为目录文件夹
    expect(() => {
      playlistRepo.update(songPlaylist.id, { isFolder: true });
    }).toThrow('该歌单内已包含歌曲，不能转换为目录文件夹');

    // 6. 状态流转验证：清空歌曲后，可以放入子歌单
    playlistRepo.removeTrackFromPlaylist(songPlaylist.id, 'trk_mutex_01');
    const newChild = playlistRepo.create('合法子歌单', undefined, { parentId: songPlaylist.id });
    expect(newChild.parentId).toBe(songPlaylist.id);

    // 7. 状态流转验证：删除子歌单后，该歌单恢复为纯歌单，可成功放入歌曲
    playlistRepo.delete(newChild.id);
    expect(() => {
      playlistRepo.addTrackToPlaylist(songPlaylist.id, 'trk_mutex_01');
    }).not.toThrow();
    expect(playlistRepo.getPlaylistTracks(songPlaylist.id).length).toBe(1);
  });

  it('防环检测 (Cycle Detection)：试图将父目录移动到自身或其子孙后代中应被拒绝', () => {
    const folderA = playlistRepo.create('Folder A', undefined, { isFolder: true });
    const folderB = playlistRepo.create('Folder B', undefined, {
      parentId: folderA.id,
      isFolder: true,
    });
    const folderC = playlistRepo.create('Folder C', undefined, {
      parentId: folderB.id,
      isFolder: true,
    });

    // 1. 不能将自身设为父级
    expect(() => {
      playlistRepo.update(folderA.id, { parentId: folderA.id });
    }).toThrow('不能将歌单或目录的父级设置为其自身');

    // 2. 不能将祖先 A 移入其子孙 B
    expect(() => {
      playlistRepo.update(folderA.id, { parentId: folderB.id });
    }).toThrow('这会导致循环嵌套死锁');

    // 3. 不能将祖先 A 移入其孙级 C
    expect(() => {
      playlistRepo.update(folderA.id, { parentId: folderC.id });
    }).toThrow('这会导致循环嵌套死锁');

    // 4. 合法移动：将 C 提升移动到根层级 (parentId: null)
    playlistRepo.update(folderC.id, { parentId: null });
    const updatedC = playlistRepo.findById(folderC.id);
    expect(updatedC?.parentId).toBeUndefined();
  });

  it('级联删除：删除父目录时其所有子孙歌单与关联应全量安全级联销毁，且不误删物理音频', () => {
    const parent = playlistRepo.create('Parent Category', undefined, { isFolder: true });
    const child = playlistRepo.create('Child Category', undefined, {
      parentId: parent.id,
      isFolder: true,
    });
    const subChild = playlistRepo.create('SubChild Playlist', undefined, { parentId: child.id });

    // 写入一首曲目并关联
    trackRepo.insert({
      id: 'trk_cascade_01',
      title: 'Cascade Track',
      artist: 'Artist',
      album: 'Album',
      duration: 120,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/cascade_01.flac',
      fileSize: 10000,
      fileHash: 'hash_cascade_01',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    playlistRepo.addTrackToPlaylist(subChild.id, 'trk_cascade_01');

    // 删除顶层 parent
    const success = playlistRepo.delete(parent.id);
    expect(success).toBe(true);

    // 验证整个子树被级联删除
    expect(playlistRepo.findById(parent.id)).toBeNull();
    expect(playlistRepo.findById(child.id)).toBeNull();
    expect(playlistRepo.findById(subChild.id)).toBeNull();

    // 验证底层的 Track 记录仍然安然无恙存在
    expect(trackRepo.findById('trk_cascade_01')).not.toBeNull();
  });

  it('系统默认“全部音乐”歌单保护：禁止删除、禁止移入子目录', () => {
    const folder = playlistRepo.create('Some Folder', undefined, { isFolder: true });

    // 1. 禁止删除根歌单
    expect(() => {
      playlistRepo.delete('default_all_tracks');
    }).toThrow('系统默认“全部音乐”歌单禁止删除');

    // 2. 禁止将根歌单移入子目录
    expect(() => {
      playlistRepo.update('default_all_tracks', { parentId: folder.id });
    }).toThrow('系统默认“全部音乐”歌单禁止移入子目录');
  });

  it('应当支持批量向歌单添加歌曲并正确维护数量与未集成状态 (addTracksToPlaylist)', () => {
    const pl = playlistRepo.create('我的合辑');
    trackRepo.insert({
      id: 'batch_t1',
      title: 'T1',
      artist: 'A1',
      album: 'AL1',
      duration: 100,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/t1.flac',
      fileSize: 1000,
      fileHash: 'h1',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    trackRepo.insert({
      id: 'batch_t2',
      title: 'T2',
      artist: 'A2',
      album: 'AL2',
      duration: 200,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/t2.flac',
      fileSize: 2000,
      fileHash: 'h2',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 默认加入未集成歌单
    playlistRepo.addTrackToPlaylist('default_unintegrated_tracks', 'batch_t1');
    playlistRepo.addTrackToPlaylist('default_unintegrated_tracks', 'batch_t2');

    const result = playlistRepo.addTracksToPlaylist(pl.id, ['batch_t1', 'batch_t2']);
    expect(result.addedCount).toBe(2);

    const updatedPl = playlistRepo.findById(pl.id);
    expect(updatedPl?.trackCount).toBe(2);

    const tracksInPl = playlistRepo.getPlaylistTracks(pl.id);
    expect(tracksInPl.length).toBe(2);

    // 自动从未集成歌单脱离
    const unintegratedTracks = playlistRepo.getPlaylistTracks('default_unintegrated_tracks');
    expect(unintegratedTracks.some((t) => t.id === 'batch_t1')).toBe(false);
    expect(unintegratedTracks.some((t) => t.id === 'batch_t2')).toBe(false);
  });
});
