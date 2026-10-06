# Wavelet ♫

> **轻量级 · 纯 TypeScript · 极简发烧级母带音乐播放引擎与 Web 播放器**  
> *Bit-Perfect 极简纯净音频流水线 · 60fps 贝塞尔流体音波 · INS 纯白呼吸质感 · 纯几何矢量美学*

---

## ✦ 项目概览

Wavelet 是一套面向发烧级母带音频体验的现代化音乐播放系统。全工程基于纯 TypeScript 严格模式构建，实现了从底层二进制音频坏损自愈、无损音频元数据解析、128 点整轨波形抽取、60fps 频域 FFT 广播，到上层基于 React 19、Tailwind CSS v4 与 Motion 12 的极简无边框 Web 播放界面的全链路闭环。

---

## ✦ 核心设计与技术亮点

- **发烧级音频直通与自愈**：
  - 支持 FLAC (最高 192kHz/24-bit Hi-Res Master)、WAV、ALAC、MP3 等主流无损与有损格式。
  - 内置 7 类坏损音频嗅探与实时内存帧自愈算子，免转码 Bit-Perfect 直通。
  - 基于下采样 PCM 抽取 128 点归一化振幅峰值，支持磁盘毫秒级持久化缓存。
- **INS 极简纯白与纯几何美学**：
  - **零第三方图标库、零系统 Emoji**：24 款内联手绘纯几何 SVG 图标，极度轻量克制。
  - **物理级联坠落入场**：基于 Spring 弹性阻尼的卡片中心吸附轮播舞台。
  - **折角唱针与黑胶大舞台**：同心刻道纹理黑胶无限旋转，伴随 60fps 原生贝塞尔流体音波与实时双轨高亮滚动 LRC 歌词。
- **歌单与歌曲层级严格互斥**：
  - 分类目录文件夹（`isFolder: true`）仅容纳子歌单轮播，禁止挂载单曲；实体歌单具备无边框列表与轮播双模态展示。
- **现代化 Monorepo 工程化规范**：
  - **纯 TypeScript**：开启最严格模式，全局零 `any`。
  - **Biome 严格代码检查**：全工程零 Error，完全合规。
  - **生产级独立与一体化托管**：后端 Fastify 网关既支持独立 RESTful/WS 提供服务，亦能一键挂载并托管前端 SPA 生产产物。

---

## ✦ 工程拓扑与目录结构

```
Wavelet/
├── documents/                       # 架构与开发规范文档
│   ├── 前端设计.md                  # Web 前端设计白皮书与视觉规范
│   ├── 后端架构设计.md              # 后端架构设计、RESTful API 契约与 WebSocket 广播
│   ├── 数据库表设计.md              # SQLite 数据库表定义与增量迁移
│   ├── 测试路线与测试规范.md        # 测试分层、覆盖范畴与执行规范
│   └── 前端开发/                    # 前端工程化技术标准文档归档体系
│       ├── 01_架构与设计规范/        # 架构拓扑、路由状态机、API 契约、组件层级树 (4 份)
│       ├── 02_基石与通信实现/        # 前端配置类型、Tokens 与动效、API 与 WS 通信 (3 份)
│       ├── 03_状态机与组件库/        # Zustand 状态拓扑、纯几何手绘 SVG 与原子组件 (2 份)
│       ├── 04_页面视图与交互/        # 页面视图与业务交互实现报告 (1 份)
│       └── 05_交付验收/             # 全流程交付与体验验收报告 (1 份)
├── packages/
│   ├── shared/                      # 跨端共享强类型契约 (@wavelet/shared)
│   ├── backend/                     # 本地音频引擎、数据库仓储与网关服务 (@wavelet/backend)
│   └── frontend/                    # 基于 React 19 的现代化发烧级 Web 客户端 (@wavelet/frontend)
└── tests/                           # 后端全层级自动化测试套件 (19 套件 / 68 测试)
    ├── unit/                        # 单元测试 (配置、嗅探、自愈、仓储、波形、队列等)
    ├── integration/                 # 集成测试 (流水线、网关 API、完整性校验等)
    ├── e2e/                         # 端到端测试 (生命周期全流程、异常断电自愈)
    └── perf/                        # 性能与压力基准测试 (冷启动、内存开销、高并发)
```

---

## ✦ 快速开始

### 1. 环境依赖
- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 2. 安装与构建

```bash
# 安装全工程依赖
pnpm install

# 一体化编译构建 (shared + backend + frontend)
pnpm build
```

### 3. 质量与一致性检查

```bash
# Biome 静态检查与自动格式化
pnpm check
pnpm check:fix

# TypeScript 严格类型检查 (零 any)
pnpm typecheck

# 运行全量 24 个测试套件 (99 个测试)
pnpm test
```

### 4. 统一 CLI 与全局控制 (一键启动/日志/环境管理)

Wavelet 配备了功能完备的开箱即用控制脚手架 `wavelet`：

```bash
# 一键注册全局指令 (注册到 ~/.local/bin/wavelet，任何路径均可直接敲击 wavelet 启动)
./wavelet.sh install

# 在系统任意路径直接启动 (自动载入 .env、自动编译未构建产物、后台守护模式)
wavelet start

# 实时追踪运行日志 (支持 -f 跟踪、-n 行数、--inspection 自愈审计专轨)
wavelet logs -f

# 查看运行状态、PID、内存占用 (RSS)、CPU 及曲库统计
wavelet status

# 原地索引音乐目录 (零文件拷贝，原地诊断与自愈)
wavelet import ~/Music

# 全量曲库备份打包导出为自包含 .zip 归档
wavelet backup export [out.zip]

# 从备份包还原曲库与歌单 (自动重映射新机器路径)
wavelet backup import backup.zip [dest_dir]

# 查看当前生效的环境变量与配置探测来源
wavelet env

# 优雅停止与重启服务
wavelet stop
wavelet restart
```

### 5. 原地音乐索引与跨机器曲库迁移

- **原地目录索引 (In-place Indexing)**：
  - 导入音乐仅需指定本地音乐文件夹路径，Wavelet 就地扫描元数据并抽取 128 点波形，原文件保持在原有路径，**杜绝任何冗余文件拷贝**。
- **跨机器全量备份与迁移 (Backup & Migration)**：
  - 一键将所有音频母带文件、专辑封面、歌词、播放统计、心动标记与 SQLite 数据库打包导出为 `.zip` 压缩包。
  - 在新电脑上一键还原解压，**自动将物理音频路径重映射为新电脑目录**，无缝恢复全部音乐资产与播放数据。

### 6. 环境变量自动检测与个性化配置

Wavelet 启动时将按以下优先级自动检测并载入环境变量：
1. CLI 指定文件：`wavelet --env-file /path/to/.env start`
2. 环境变量指针：`$WAVELET_ENV_FILE`
3. 当前工作目录下的 `.env` (`$PWD/.env`)
4. Wavelet 项目根目录下的 `.env`
5. 用户全局配置目录下的 `.env` (`~/.config/wavelet/.env` 或 `~/.wavelet/.env`)

可复制项目根目录下的 `.env.example` 快速定制：
```bash
cp .env.example .env
```

---

## ✦ 交付验收指标

- **全量测试通过率**：24/24 测试套件通过，99/99 测试用例 100% 绿色通过。
- **冷启动响应耗时**：$\approx 23.4\text{ms}$，首屏秒级浮现数据看板。
- **静态资源开销**：前端生产 Bundle 经过 gzip 压缩后仅 $\approx 137\text{KB}$。
- **代码健康度**：Biome 0 Error，TypeScript 0 Error，零测试回归。

---

## ✦ 许可证

MIT License.

