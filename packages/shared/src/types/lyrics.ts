export interface Lyrics {
  trackId: string;
  rawLrc: string; // 包含时间轴的标准 LRC 文本
  offsetMs: number; // 用户手动微调的时间偏移
  updatedAt: number;
}

export interface ParsedLyricLine {
  timeMs: number;
  text: string;
}
