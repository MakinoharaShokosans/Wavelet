/**
 * 全局单页顶层工作流视图路由状态
 */
export type AppView =
  | 'splash' // 启动与数据看板沉降
  | 'zero' // 零曲目冷启动悬浮导入浮岛
  | 'carousel' // 首页一级歌单横向中心吸附轮播舞台
  | 'playlist-detail' // 歌单内部双模与互斥展示
  | 'player-stage'; // 沉浸播放大舞台 (黑胶 + 60fps 贝塞尔流体音波 + 歌词)

/**
 * 实体歌单内部双模展示形态
 */
export type PlaylistViewMode = 'cards' | 'list';

/**
 * 多级嵌套歌单面包屑项
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
  isFolder: boolean;
}
