# Wavelet - 纯几何定制 SVG 与原子组件库规范

> **规范版本**：v1.0.0  
> **所属阶段**：Phase 5 - 通用原子与微交互组件库  
> **关联依据**：[04_组件层级树与组件字典.md](file:///home/Skualeilu/Projects/Wavelet/documents/前端开发/01_架构与设计规范/04_组件层级树与组件字典.md) / [前端设计.md](file:///home/Skualeilu/Projects/Wavelet/documents/前端设计.md)

---

## 1. 纯几何定制 SVG 矢量图谱 (`src/components/common/SvgIcons.tsx`)

Wavelet 前端严格执行**“零三方冗余图标库、零系统 Emoji”**的设计宗旨。所有图标均采用手绘标准化 SVG 纯几何路径（基于 `24x24` 视口，`strokeWidth: 2`，`strokeLinecap: round`，`strokeLinejoin: round`）：

```mermaid
graph TD
    subgraph SvgIcons System (24 Icons)
        PlaybackControl["播放控制类<br/>(play, pause, previous, next, volume, volume-mute)"]
        PlayModeControl["播放模式类<br/>(sequence, repeat, repeat-track, shuffle)"]
        AssetMetadata["资产元数据类<br/>(folder, music, heart, heart-filled, wave)"]
        SystemAction["系统与导航类<br/>(plus, close, chevron-left, chevron-right, search, clock, bit-perfect, list, grid)"]
    end
```

### 1.1 全量图标几何路径与语义字典

| 图标标识 (`name`) | 几何构成描述 | 语义与使用场景 |
| :--- | :--- | :--- |
| **`play`** | 纯圆角等边三角形（顶点指向右侧） | 播放按钮、曲目行 Hover 试听 |
| **`pause`** | 两个间距对称的垂直圆角胶囊条 | 暂停播放、播放中状态 |
| **`previous`** | 垂直圆角竖线 + 左指圆角三角形 | 切上一曲 |
| **`next`** | 右指圆角三角形 + 垂直圆角竖线 | 切下一曲 |
| **`volume`** | 发声喇叭筒体 + 两道同心圆弧发散声波 | 音量滑块前缀、正常发声 |
| **`volume-mute`** | 发声喇叭筒体 + 右侧对角斜线或轻量叉号 | 静音指示 |
| **`repeat`** | 两条顺时针首尾相接的闭环圆角折线箭头 | 列表循环播放模式 |
| **`repeat-track`**| 闭环箭头并在中心微缩标记圆点或数字 '1' | 单曲死循环播放模式 |
| **`shuffle`** | 两条交叉互换方向的双向平滑贝塞尔箭头 | 随机乱序播放模式 |
| **`sequence`** | 水平直通右箭头 + 两条起点参考竖标 | 顺序播放到底模式 |
| **`folder`** | 带左上方微圆角封舌的横向档案夹 | 分类目录文件夹（禁放单曲） |
| **`music`** | 双符头、斜上倾连杆的标准艺术八分音符 | 纯实体歌单、单曲指示 |
| **`heart`** | 双弧下收圆润的心形轮廓细线 | 未收藏状态的心动收藏按钮 |
| **`heart-filled`** | 填充 `--accent-coral`（珊瑚红）的实体心形 | 已心动收藏的高亮状态 |
| **`wave`** | 三组起伏平滑的正弦流体波动微线 | 正在播放动态音波徽标、波形入口 |
| **`bit-perfect`** | 八边形切割几何宝石/水晶晶振多边形 | 硬件独占直通点亮微标 |
| **`list`** | 三条等宽水平细圆角横条 | 实体歌单「无边框列表模式」切换 |
| **`grid`** | 四个等间距圆角微正方形（2x2） | 实体歌单「卡片轮播模式」切换 |
| **`plus`** | 中心对称的纯几何细十字线 | 新建歌单、导入音乐添加入口 |
| **`close`** | 45° 旋转的等长圆角交叉叉号 | 关闭弹窗、收起大舞台 |
| **`chevron-right`**| 单一朝右的 90° 纯细折线 | 面包屑分隔符、下钻箭头 |
| **`chevron-left`** | 单一朝左的 90° 纯细折线 | 面包屑回退箭头 |
| **`search`** | 左上 45° 纯圆环镜片 + 右下斜切手柄 | 曲库即时全文过滤 |
| **`clock`** | 纯外圆环 + 垂直与水平指针 | 历史播放时间、时长徽标 |

---

## 2. 智能防抖悬停气泡卡片 (`src/components/common/FloatingCard.tsx`)

### 2.1 交互行为与 120ms 防抖算法
- **低文字密度设计**：主界面不堆砌提示文字，仅在用户悬停在图标或关键指标上时呈现。
- **防抖时序**：
  - 鼠标移入（`onMouseEnter`）：启动 `120ms` 延时计时器；若鼠标在 120ms 内迅速划过，则取消计时，绝不弹出生硬气泡。
  - 鼠标移出（`onMouseLeave`）：立即优雅淡出，不遮挡后续操作。
- **物理动效**：基于 `springMotion.stiff` 弹簧模型，微缩放 `scale: 0.95 -> 1.0` 与透明度 `opacity: 0 -> 1` 顺滑展开。

---

## 3. 流体无缝滑动控制器 (`src/components/common/FluidSlider.tsx`)

### 3.1 规格与交互能力
- **双模复用**：既作为 `FloatingPlayerDock` 的播放进度 Seeking 轴，也作为音量调节滑块。
- **触控与拖拽精度**：
  - 支持直接点击轨道任意位置瞬间跳转。
  - 支持鼠标按下连续横向拖拽，拖拽过程中锁定全局光标，支持平滑防跳跃阻尼。
  - 鼠标悬停时平滑浮现流体微滑块圆点（Thumb），平时仅保留通透的细微流体进度槽。
