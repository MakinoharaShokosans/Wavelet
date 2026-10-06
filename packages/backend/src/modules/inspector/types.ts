export enum CorruptionType {
  FAKE_EXTENSION = 'FAKE_EXTENSION', // 1. 扩展名伪装 / 头部错配
  MISSING_STREAMINFO = 'MISSING_STREAMINFO', // 2. FLAC STREAMINFO 丢失
  FRAME_ALIGNMENT_DIRTY = 'FRAME_ALIGNMENT_DIRTY', // 3. 头部/帧前存在垃圾填充
  CRC_FRAME_ERROR = 'CRC_FRAME_ERROR', // 4. 音频帧 CRC 校验错误
  TRAILING_DIRTY_PADDING = 'TRAILING_DIRTY_PADDING', // 5. 尾部非标准截断/广告填充
  WAV_HEADER_CORRUPTED = 'WAV_HEADER_CORRUPTED', // 6. WAV/PCM 容器头损坏
  LETHAL_CORRUPTION = 'LETHAL_CORRUPTION', // 7. 致命坏损 (不可自愈)
}

export interface InspectionDiagnosis {
  filePath: string;
  fileSize: number;
  realFormat: string;
  declaredExt: string;
  corruptions: CorruptionType[];
  canHeal: boolean;
  details: string[];
}

export interface HealingResult {
  success: boolean;
  originalPath: string;
  healedPath: string;
  fixedCorruptions: CorruptionType[];
  healedBytes: number;
  logs: string[];
}
