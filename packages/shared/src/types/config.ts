/**
 * Wavelet 各模块静态配置类型契约定义
 * 纯 TypeScript 接口，零运行时开销
 */

export interface ServerConfig {
  /** 本地监听主机地址，单用户本地固定 127.0.0.1 */
  host: string;
  /** 本地 HTTP / WebSocket 服务端口 */
  port: number;
  /** 允许的本地跨域请求来源 */
  corsOrigins: string[];
}

export interface StorageConfig {
  /** Wavelet 本地数据私有根目录 (默认 ~/.wavelet) */
  dataDir: string;
  /** 标准化音乐母库物理根目录 (默认 ~/Music/Wavelet_Library) */
  libraryDir: string;
  /** 无法自愈的致命坏损音频隔离区 (默认 ~/.wavelet/quarantine) */
  quarantineDir: string;
  /** 封面缩略图与体检临时切片缓存目录 (默认 ~/.wavelet/cache) */
  cacheDir: string;
  /** 日志物理存储目录 (默认 ~/.wavelet/logs) */
  logsDir: string;
  /** SQLite 嵌入式数据库主文件路径 (默认 ~/.wavelet/wavelet.db) */
  databaseFile: string;
  /** 歌曲标题解析策略: 'smart' 智能拆分歌手与歌名 | 'filename' 完整文件名 | 'tag' 优先音频内嵌标签 (默认 'smart') */
  titleParseMode?: 'smart' | 'filename' | 'tag';
}

export interface AudioConfig {
  /** 发烧声卡输出模式: 'direct' 硬件直通 | 'web' 本地 HTTP Range 流回退 */
  outputMode: 'direct' | 'web';
  /** 物理声卡设备标识符 ('default' 表示系统默认设备) */
  outputDevice: string;
  /** 硬件直通 PCM 缓冲区字节数 (默认 4096) */
  bufferSize: number;
  /** 软件高精度主音量 (0.0 ~ 1.0) */
  defaultVolume: number;
}

export interface TranscoderConfig {
  /** 转码与自愈 Worker 线程池最大并发数 (默认 CPU核心数 - 1，预留主核心保证0卡顿) */
  maxConcurrency: number;
  /** FLAC 标准化压缩等级 (0~8，默认 5 兼顾速度与体积) */
  compressionLevel: number;
  /** 自定义外部 FFmpeg 可执行文件路径 (留空则默认使用内建 ffmpeg-static) */
  customFfmpegPath: string;
}

export interface LoggingConfig {
  /** 日志等级 */
  level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** 单日志文件体积滚动阈值 (MB，默认 10) */
  maxFileSizeMB: number;
  /** 最多保留的历史归档压缩日志数 (默认 3，确保总占用严格 <= 30MB) */
  maxFiles: number;
  /** 控制台终端是否启用彩色格式化美化打印 */
  consolePretty: boolean;
}

export interface WaveletConfig {
  /** 配置文件规范版本号 */
  version: number;
  /** 网关与服务配置 */
  server: ServerConfig;
  /** 存储与目录配置 */
  storage: StorageConfig;
  /** 音频硬件直通配置 */
  audio: AudioConfig;
  /** 转码与多线程配置 */
  transcoder: TranscoderConfig;
  /** 结构化日志配置 */
  logging: LoggingConfig;
}
