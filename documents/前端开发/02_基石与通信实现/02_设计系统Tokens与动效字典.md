# Wavelet - 设计系统 Tokens 与动效字典

> **规范版本**：v1.0.0  
> **所属阶段**：Phase 2 - 基石与通信实现  
> **关联依据**：[前端设计.md](file:///home/Skualeilu/Projects/Wavelet/documents/前端设计.md) / [前端开发路线.md](file:///home/Skualeilu/Projects/Wavelet/documents/前端开发路线.md)

---

## 1. 纯白 INS 视觉设计系统 Tokens (`src/assets/styles/tokens.css`)

Wavelet 前端采用 **INS 纯净极简白（Pure White Minimalist）** 视觉基底，彻底废除生硬机械的实线边框，以**极淡微彩（Subtle Hue）**与**柔和微投影（Soft Micro-Shadows）**营造温润高贵的现代立体层级。

### 1.1 核心调色板与语义变量表

| 变量名称 | 色值代码 | 语义与使用场景 |
| :--- | :--- | :--- |
| `--bg-canvas` | `#FFFFFF` | 应用视窗最高纯度纯白主底色 |
| `--bg-subtle` | `#F8F9FA` | 次级容器底色（如侧边栏、卡片默认底槽、进度槽底色） |
| `--bg-surface` | `#FFFFFF` | 悬浮交互面、弹窗卡片、大舞台底色 |
| `--bg-elevated` | `#F1F3F5` | 鼠标 Hover 态轻微下陷浅灰底色 |
| `--bg-overlay` | `rgba(255, 255, 255, 0.85)` | 半透明磨砂玻璃背板（配合 `backdrop-blur-md`） |
| `--border-subtle` | `rgba(0, 0, 0, 0.04)` | 超轻量微边框（在纯白与纯白相叠时作为辅助视觉界限） |
| `--border-focus` | `rgba(0, 0, 0, 0.12)` | 输入或焦点微边框 |
| `--text-primary` | `#1F2124` | 石墨主文本色（高对比、温润无眩光，替代死黑 `#000000`） |
| `--text-secondary` | `#6B7280` | 艺术家、时长、次要统计信息说明文字 |
| `--text-tertiary` | `#A3AAB8` | 占位符、失效文字、时间轴微时间 |
| `--text-muted` | `#D1D5DB` | 超淡辅助分隔文字 |
| `--accent-coral` | `#FF6B6B` | 心动红心、错误警告、重要标记 |
| `--accent-mint` | `#4ECDC4` | Bit-Perfect 直通点亮绿、健康度绿标、采样率微标 |
| `--accent-honey` | `#FFE66D` | 专辑封面微点缀金色微光 |

---

### 1.2 柔和微投影层次阶梯 (Soft Micro-Shadows)

为实现纯白极简无边框设计，Wavelet 采用 4 档高扩散微投影构建纵深空间感：

| 投影层级 | CSS 属性定义 | 适用 UI 实体 |
| :--- | :--- | :--- |
| **`--shadow-xs`** | `0 1px 2px rgba(0, 0, 0, 0.03)` | 极简无边框单曲列表行、微型胶囊按钮 |
| **`--shadow-card`** | `0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)` | 一级歌单封面卡片常态、侧边栏展开卡片 |
| **`--shadow-hover`** | `0 10px 25px -4px rgba(0, 0, 0, 0.08), 0 4px 10px -2px rgba(0, 0, 0, 0.03)` | 中心吸附卡片、鼠标悬停升起卡片、`FloatingCard` 气泡 |
| **`--shadow-dock`** | `0 12px 36px -4px rgba(0, 0, 0, 0.08), 0 4px 14px -2px rgba(0, 0, 0, 0.04)` | 底部悬浮超椭圆控制器 `FloatingPlayerDock` |
| **`--shadow-stage`** | `0 24px 64px -12px rgba(0, 0, 0, 0.12)` | 沉浸播放大舞台黑胶唱盘投影 |

---

### 1.3 字体排印规范 (Typography Tokens)

- **字体族栈**：  
  `font-family: 'Quicksand', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`
- **字阶梯度**：
  - `Display Large`: `32px` / `line-height: 1.2` / `font-weight: 700`（沉浸大舞台单曲名）
  - `Heading 1`: `24px` / `line-height: 1.25` / `font-weight: 600`（歌单详情主标题）
  - `Heading 2`: `18px` / `line-height: 1.3` / `font-weight: 600`（轮播卡片标题）
  - `Body Regular`: `14px` / `line-height: 1.5` / `font-weight: 500`（单曲行曲名、正文）
  - `Body Small`: `12px` / `line-height: 1.4` / `font-weight: 500`（艺术家、次要标签）
  - `Micro Tag`: `10px` / `line-height: 1.2` / `font-weight: 600`（`96kHz/24bit` Hi-Res 微标）

---

## 2. Framer Motion 物理弹簧动效预设 (`src/assets/styles/motion.ts`)

Wavelet 前端杜绝一切机械线性的 CSS transition，全量采用基于刚度（Stiffness）与阻尼（Damping）的**真实物理弹簧（Spring Physics）**模型：

```typescript
export const springMotion = {
  /**
   * 极速敏捷点击响应 (用于按钮微压下、开关切换)
   * 刚度极高，回弹迅速无拖沓
   */
  stiff: {
    type: 'spring',
    stiffness: 500,
    damping: 30,
    mass: 0.8,
  },

  /**
   * 优雅级联坠落与卡片升起 (用于 Splash 音符跳跃、卡片坠落)
   * 具有生动的轻微过冲回弹
   */
  gentle: {
    type: 'spring',
    stiffness: 450,
    damping: 18,
    mass: 1.0,
  },

  /**
   * 惯性吸附与长距离自动回滚 (用于 CarouselStage 磁吸与落位回滚)
   * 刚度适中，阻尼沉稳，吸附精准
   */
  rebound: {
    type: 'spring',
    stiffness: 280,
    damping: 24,
    mass: 1.1,
  },

  /**
   * 平滑形变转场 (用于 Card-to-Stage 歌曲卡片向大舞台同源全屏展开)
   * 阻尼大、刚度平缓，确保全屏展开视觉平滑不抖动
   */
  morph: {
    type: 'spring',
    stiffness: 380,
    damping: 28,
    mass: 1.0,
  },

  /**
   * 弹性侧边栏伸缩 (240px <-> 72px 切换)
   */
  sidebar: {
    type: 'spring',
    stiffness: 320,
    damping: 26,
    mass: 0.9,
  },
} as const;
```
