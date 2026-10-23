# 🧭 Wavelet AI Agent 开发与架构行动指南 (AGENT.md)

> **致所有在此代码库上工作的 AI Agent 与开发者**：  
> 本文档是 Wavelet 项目的**核心架构全景图、业务铁律与开发行为指南**。  
> 在进行任何代码编写、重构或调试之前，请**务必先阅读本文档**，无需每次遍历读取全工程源码，严格遵循本文档规定的目录规范与设计约束。

---

## ✦ 1. 项目定位与核心理念

Wavelet 是一套面向发烧级母带音频体验的现代化轻量级音乐播放系统：
- **发烧级音频直通 (Bit-Perfect) 与非破坏性自愈**：纯 TypeScript 严格模式构建，底层具备 7 类坏损音频嗅探与内存帧级自愈，自愈版本写入持久缓存并在开流时优先直通播放，原文件资产安全无损，免无谓重采样。
- **纯几何与 INS 纯白极简美学**：全界面基于 React 19、Tailwind CSS v4 与 Motion 12 构建，**零第三方外部图标库、零系统 Emoji**，全由内联手绘纯几何矢量 SVG 构成。
- **严格的分层互斥模型**：分类目录与歌曲严格互斥，母带音频物理安全第一（软删除回收站机制）。

---

## ✦ 2. 代码库拓扑与目录地图 (Directory Map)

```
Wavelet/
├── AGENT.md                         # 👈 [当前文档] AI 代理架构与开发行动指南
├── README.md                        # 用户与项目主说明书
├── package.json / pnpm-lock.yaml    # 根项目 Monorepo 配置 (pnpm workspace)
├── biome.json                       # Biome 代码格式化与 Linter 严格规则
├── tsconfig.base.json               # 统一 TypeScript 基础配置 (strict: true)
├── vitest.config.ts                 # Vitest 测试套件运行配置
├── wavelet.sh / bin/                # 命令行启动脚本与全局 CLI 工具
├── documents/                       # 官方系统设计、白皮书与技术规范文档库
│   ├── overview.md                  # 整体设计概述
│   ├── 前端设计.md                  # 视觉规范、设计 Tokens、交互动效
│   ├── 后端架构设计.md              # 模块解耦、RESTful API 契约、WebSocket 广播
│   ├── 数据库表设计.md              # SQLite 模式定义与增量迁移机制
│   ├── 测试路线与测试规范.md        # 测试分层、覆盖率标准与断言范式
│   ├── 待办问题清单.md              # 📋 曲库一致性、物理文件生命周期与演进待办清单
│   └── 前端开发/                    # 前端工程化多阶段实施与验收归档文档
├── packages/
│   ├── shared/                      # 跨端共享强类型契约 (@wavelet/shared)
│   │   └── src/                     # 共享类型定义 (Track, Playlist, AudioMeta, WsMessage)
│   ├── backend/                     # 本地音频引擎、数据库仓储与网关服务 (@wavelet/backend)
│   │   └── src/
│   │       ├── index.ts             # 后端应用入口点与主生命周期
│   │       ├── config/              # 环境配置与路径解析 (.env, 常量)
│   │       ├── modules/
│   │       │   ├── bootstrap/       # 引导生命周期、环境探测、目录拓扑与平滑停机
│   │       │   ├── gateway/         # Fastify HTTP RESTful API、WebSocket 广播与会话中间件
│   │       │   │   ├── middleware/  # 本地会话安全看护 (session-guard)
│   │       │   │   ├── routes/      # 路由处理器 (tracks, playlists, settings, stream, import, backup)
│   │       │   │   └── ws/          # 实时双向通信通道与进度广播
│   │       │   ├── inspector/       # 音频体检与坏损自愈引擎 (sniffer, pipeline, healers, waveform)
│   │       │   ├── library/         # 数据库仓储与曲库一致性中枢
│   │       │   │   ├── db/          # better-sqlite3 实例、增量迁移机制 (migrator)
│   │       │   │   ├── repositories/# 数据持久化仓储 (TrackRepository, PlaylistRepository)
│   │       │   │   ├── musics-syncer.ts   # 原地零拷贝扫描、重命名保活、增量热刷新与软失效
│   │       │   │   ├── sidecar-detector.ts# 外挂伴随歌词 (.lrc) 与同级封面探测
│   │       │   │   ├── integrity-guard.ts # 防灾熔断、防空门与孤立关联全量校准
│   │       │   │   └── backup-manager.ts  # 曲库全量备份与跨机迁移管理器
│   │       │   ├── player/          # 发烧级硬件音频输出引擎 (DirectPCM, DeviceManager, FFTPump)
│   │       │   └── transcoder/      # 多线程转码池与母带 FLAC 标准化器 (worker-pool, flac-standardizer)
│   └── frontend/                    # 现代化发烧级 Web 客户端 (@wavelet/frontend)
│       └── src/
│           ├── main.tsx             # 前端入口挂载
│           ├── App.tsx              # 顶层 App 组件与路由分发
│           ├── assets/styles/       # Tailwind CSS v4 主题、CSS 变量、Motion 弹性动画配置
│           ├── components/          # 视图与交互组件库
│           │   ├── common/          # 弹窗与原子组件 (AddTracksModal, PlaylistModal, SvgIcons 等)
│           │   ├── carousel/        # 3D 轮播卡片、居中放大特效、音律大厅
│           │   ├── layout/          # 侧边栏 (Sidebar)、顶栏 (Header)、主框架 (AppLayout)
│           │   ├── player/          # 悬浮播放坞 (FloatingPlayerDock)、黑胶舞台、进度条
│           │   ├── playlist/        # 歌单详情 (PlaylistDetailView)、歌曲卡片轮播 (TrackCarouselView)
│           │   └── tracks/          # 歌曲表格与行项目组件 (TrackListItem, TrackTableView)
│           ├── services/            # 前端 API 与 WS 数据通信适配器 (track, playlist, ws 等)
│           ├── stores/              # Zustand 状态机 (player.store, library.store, ui.store)
│           └── types/               # 前端特有 UI 与组件类型定义
└── tests/                           # 自动化测试套件 (所有自动化测试必须集中在此)
    ├── test-helper.ts               # 测试数据库与上下文初始化 Mock 桩
    ├── unit/                        # 单元测试 (repositories, backup, smart-playlists 等)
    ├── integration/                 # 集成测试 (gateway, pipeline, session, websocket 等)
    ├── e2e/                         # 端到端生命周期验证 (full-lifecycle, fault-recovery)
    └── perf/                        # 性能与高并发基准测试 (benchmarks, stress)
```

---

## ✦ 3. 核心业务模型与不可突破的铁律 (Critical Business Invariants)

在进行任何功能修改与代码编写时，**必须严格遵循以下业务铁律，绝不可破坏**：

### 铁律 1：目录与单曲严格互斥 (Mutual Exclusion Principle)
- **分类文件夹 (`isFolder: true`)**：
  - 只能容纳子歌单，**严禁放入任何歌曲/单曲**；
  - 包含子歌单的歌单，**绝不允许再添加歌曲**。
- **实体歌曲歌单 (`isFolder: false`)**：
  - 只能存放歌曲曲目；
  - 一旦歌单内包含歌曲，**绝对禁止将其转为目录或在其下创建/移入子歌单**。

### 铁律 2：系统预置默认歌单不可变更性 (System Protected Playlists)
- 系统预置 4 个特殊歌单（具备 `is_default = 1`）：
  1. `default_all_tracks`（全部音乐）
  2. `default_favorites`（心动收藏）
  3. `default_unintegrated_tracks`（未集成歌曲）
  4. `default_trash`（回收歌单）
- **铁律约束**：
  - **绝对禁止删除任何默认歌单**（API 与持久层必须拦截并抛错）。
  - **绝对禁止将任何默认歌单移入子目录文件夹下**。

### 铁律 3：歌曲软删除与安全回收站机制 (Soft-Delete Principle)
- 用户在曲库或普通歌单中删除歌曲时，**严格执行“移入回收歌单”软删除**（标记 `is_trashed = 1` 并移入 `default_trash`），**严禁触发底层 `fs.unlinkSync` 磁盘删除**，避免误删发烧友珍贵的母带文件！
- 歌曲移入回收歌单后，自动从所有常规歌单中隔离，曲库统计与搜索默认不包含回收歌曲。
- 只有在用户进入「回收歌单」内部，点击「彻底删除」或「清空回收站」并**经过明确确认**后，才允许调用带 `{ purge: true }` 的接口物理销毁母带文件。

### 铁律 4：歌单封面物理拷贝原则 (Physical Cover Copying)
- 歌单设置封面（无论是上传图片、剪贴板粘贴还是从单曲提取）时，**必须且严格执行物理文件拷贝**，统一存储至 `covers/pl_${id}.webp`。
- **绝对禁止直接保存外部瞬时路径**，杜绝因外部源文件移动、重命名或临时目录被清空造成的歌单封面死链与白屏。

### 铁律 5：测试文件存放约束 (Test Placement Rule)
- **严禁在 `packages/frontend/` 目录下新建任何测试文件**。
- 全工程所有单元测试、集成测试必须统一存放在根目录的 `tests/` 目录下（`tests/unit/`、`tests/integration/` 等）。

### 铁律 6：代码修改与测试执行纪律 (Workflow Discipline)
- **先改好代码，再统一跑测试**：严禁在未完成代码修改、甚至还有语法错误时反复盲目运行测试。修改完毕后，按照 `pnpm check:fix` -> `pnpm typecheck` -> `pnpm test` -> `pnpm build` 顺次验证。

---

## ✦ 4. 前端视觉与交互开发规范 (UI/UX Engineering Standards)

Wavelet 拥有极高一致性的视觉设计语言，新增组件与修改时必须严格遵守：

1. **纯几何与无第三方图标库**：
   - 全项目**严禁**使用 `lucide-react`、`react-icons`、`font-awesome` 或系统 Emoji。
   - 所有图标必须使用 [SvgIcons.tsx](file:///home/Skualeilu/Projects/Wavelet/packages/frontend/src/components/common/SvgIcons.tsx) 中声明的内联手绘几何 SVG 图标。如需新增图标，需在 [types/component.ts](file:///home/Skualeilu/Projects/Wavelet/packages/frontend/src/types/component.ts) 中增加类型名并在 `SvgIcons` 中补齐矢量代码。
2. **a11y 与语义化元素 (Biome 检查合规)**：
   - 具有点击动作的可交互元素，**一律使用 `<button type="button">`**，严禁在普通 `<div onClick=...>` 或 `<span onClick=...>` 上直接挂载点击事件（避免触发 Biome `useKeyWithClickEvents` 报错）。
   - 如果嵌套结构确实需要 `div`，必须配合 `role="button"`、`tabIndex={0}` 与 `onKeyDown` 键盘监听。
3. **控制代码认知复杂度 (Cognitive Complexity)**：
   - Biome 设置了函数复杂度上限（通常不超过 15）。
   - 避免在单一组件内部编写超过 200 行包含大量状态分支和内嵌 JSX map 的大单体。
   - 遍历渲染的行/卡片项必须拆分为独立微组件（例如 `TrackSelectionItem`、`TrackCarouselCard` 等）。
4. **轮播特效与尺寸统一**：
   - 3D 轮播卡片（歌单与歌曲）尺寸全面统一为标准的 `w-64 h-80`（宽 256px，高 320px，间距 32px）。
   - 轮播吸附基于中心点计算（`calculateSnapOffset`），辅以平滑弹性动画。
5. **内嵌封面与优雅降级**：
   - 曲目具有内嵌封面时直连渲染高清 WebP。
   - 加载失败或无封面时，自动优雅降级为拟物黑胶唱盘动画，绝不显示裂图破损。

---

## ✦ 5. 核心模块通信与状态流转

### 前端状态中心 (Zustand Stores)
- **`player.store.ts`**：
  - 音频播放主状态机：驱动 HTML5 Audio 或原生 DirectPCM 流。
  - 维护：当前曲目 (`currentTrack`)、播放状态 (`isPlaying`)、进度 (`currentTime`, `duration`)、音量、播放队列 (`queue`) 与播放模式 (顺序/单曲/随机)。
  - 防重入设计：切换歌曲时必须先做状态防抖，避免高频点歌造成的卡死或多次重叠播放。
- **`library.store.ts`**：
  - 曲库与歌单数据源：曲目列表、歌单列表、分类目录树 (`playlistTree`)、回收站歌单 (`trashPlaylist`)、看板统计 (`stats`)。
  - 数据变更自动联动：新增/删除曲目或歌单后，主动触发树形与列表的局部或全局刷新。
- **`ui.store.ts`**：
  - 界面导航与弹窗看护：当前选中的歌单 ID、当前视图模态（列表/轮播）、各类 Modal 开关状态（新建/编辑歌单、批量添加歌曲、元信息编辑、曲库备份还原）。

### 后端架构要点
- **Fastify 网关与路由**：
  - 所有 API 均位于 `/api/` 前缀下。
  - 响应遵循统一 JSON 结构，错误码统一采用语义化 HTTP 状态码（400 业务约束校验失败、404 未找到、500 服务端内部错误）。
- **SQLite 增量迁移 (Migrator)**：
  - 数据库位于用户数据目录 `~/.wavelet/wavelet.db`。
  - 数据库结构变更必须在 `packages/backend/src/modules/library/db/migrator.ts` 中以递增版本（如 `004_xxx`、`005_xxx`）增量提交，严禁直接手写临时脚本修改数据库结构。
- **事务与并发保护**：
  - 批量操作（如 `addTracksToPlaylist`、`trashTrack`、`restoreTrack`）必须包裹在 `this.db.transaction()` 中执行，保证数据一致性。

---

## ✦ 6. 常用开发与验证命令速查 (Command Cheat Sheet)

| 命令 | 描述 | 使用时机 |
| :--- | :--- | :--- |
| `pnpm check` | 运行 Biome 静态语法与代码规范扫描 | 检查代码格式与 a11y 潜在隐患 |
| `pnpm check:fix` | 运行 Biome 并自动修复格式化与简单 lint 错误 | 代码修改完毕后第一步执行 |
| `pnpm typecheck` | 跨所有 workspace 执行 TypeScript 类型推导检查 (`tsc --noEmit`) | 验证接口签名、类型安全性 |
| `pnpm test` | 执行全工程自动化测试套件 (Vitest) | 核心业务逻辑修改后全量跑测 |
| `pnpm test:unit` | 仅执行 `tests/unit` 单元测试 | 快速验证仓储、算法或工具函数 |
| `pnpm test:integration` | 仅执行 `tests/integration` 集成测试 | 验证 Fastify 路由、网关通信等 |
| `pnpm build` | 全量生产打包构建 (`shared` -> `backend` -> `frontend`) | 交付或验证生产构建是否正常 |
| `pnpm dev:backend` | 单独启动后端热重载开发服务 | 调试音频引擎与 API 时使用 |
| `pnpm dev:frontend` | 单独启动前端 Vite 开发服务器 | 调试前端 UI 与交互时使用 |

---

## ✦ 7. 常见踩坑与避坑指南 (Gotchas & Best Practices)

1. **关于歌曲点播与切歌卡顿**：
   - 浏览器原生 Audio 元素在快速连续切歌时若未调用 `pause()` 和 `src = ''` 清理旧流，会导致多路声音同时播放或音频解码卡死。必须复用 `player.store.ts` 的防抖和释放逻辑。
2. **关于歌单内的歌曲排序权重**：
   - `playlist_tracks` 采用浮点数 `sort_order`，支持在任意两首歌之间插入曲目无需整体重排（如 `(prev + next) / 2`）。新加入歌曲直接基于 `MAX(sort_order) + 1.0` 递增。
3. **关于侧边栏目录树层级**：
   - 顶级分类与收藏仅展示根歌单（`!p.parentId && !p.isDefault`），子歌单通过 `parentId` 递归挂载在父目录的展开子树下，绝对不能扁平渲染。
4. **关于未集成歌曲 (Unintegrated Tracks)**：
   - 新扫描入库的歌曲默认自动挂载在 `default_unintegrated_tracks` 中；当曲目被用户添加到任何一个非默认的自定义歌单时，必须自动从未集成歌单中移出。

---

*以上规范作为 Wavelet 项目不可违背的行动纲领。请在后续开发过程中持续遵守并维护此文档。*
