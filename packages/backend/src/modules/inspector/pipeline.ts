import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../../config/index.js';
import { inspectionLogger } from '../bootstrap/logger.js';
import { healFlacStreamInfo } from './healers/flac-streaminfo-healer.js';
import { alignFrameHeader } from './healers/frame-align-healer.js';
import { cleanTrailingGarbage } from './healers/tail-cleaner.js';
import { healWavHeader } from './healers/wav-header-healer.js';
import { sniffAudioFormat } from './sniffer.js';
import { CorruptionType, type HealingResult, type InspectionDiagnosis } from './types.js';

export * from './types.js';
export * from './sniffer.js';

/**
 * 运行音频完整体检诊断流水线
 */
export async function diagnoseAudioFile(filePath: string): Promise<InspectionDiagnosis> {
  const stat = fs.statSync(filePath);
  const declaredExt = path.extname(filePath).toLowerCase().replace('.', '');
  const sniff = await sniffAudioFormat(filePath);

  const corruptions: CorruptionType[] = [];
  const details: string[] = [];

  // 1. 检查扩展名是否与魔数伪装冲突
  if (sniff.magicMatched && sniff.detectedExt !== declaredExt && sniff.isAudio) {
    corruptions.push(CorruptionType.FAKE_EXTENSION);
    details.push(`文件声明后缀为 .${declaredExt}，但底层二进制魔数识别为 .${sniff.detectedExt}`);
  }

  // 2. 读取头部 128KB 进行状态机深度体检
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(Math.min(stat.size, 131072));
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);

  // 检查帧头对齐
  const alignCheck = alignFrameHeader(buffer);
  if (alignCheck.needsAlignment) {
    corruptions.push(CorruptionType.FRAME_ALIGNMENT_DIRTY);
    details.push(`头部检测到 ${alignCheck.cleanOffset} 字节非音频脏填充数据`);
  }

  let realFormat = sniff.detectedExt;
  let isAudio = sniff.isAudio;

  if (!isAudio && alignCheck.needsAlignment && alignCheck.healedBuffer) {
    const magic4 = alignCheck.healedBuffer.subarray(0, 4).toString('ascii');
    if (
      magic4 === 'fLaC' ||
      (alignCheck.healedBuffer[0] === 0xff &&
        (alignCheck.healedBuffer[1] === 0xf8 || alignCheck.healedBuffer[1] === 0xf9))
    ) {
      realFormat = 'flac';
      isAudio = true;
    } else if (magic4 === 'RIFF') {
      realFormat = 'wav';
      isAudio = true;
    } else if (alignCheck.healedBuffer.subarray(0, 3).toString('ascii') === 'ID3') {
      realFormat = 'mp3';
      isAudio = true;
    }
  }

  // 检查 FLAC STREAMINFO 缺失
  if (realFormat === 'flac') {
    const streamBuffer = alignCheck.healedBuffer || buffer;
    const streamInfoCheck = healFlacStreamInfo(streamBuffer);
    if (streamInfoCheck.needsHeal) {
      corruptions.push(CorruptionType.MISSING_STREAMINFO);
      details.push('FLAC 文件缺失合法的 STREAMINFO 元数据引导块');
    }
  }

  // 检查 WAV 容器头部
  if (realFormat === 'wav') {
    const wavBuffer = alignCheck.healedBuffer || buffer;
    const wavCheck = healWavHeader(wavBuffer);
    if (wavCheck.needsHeal) {
      corruptions.push(CorruptionType.WAV_HEADER_CORRUPTED);
      details.push('WAV 容器头 RIFF/data chunk size 损坏或未正常闭合');
    }
  }

  // 检查是否完全无法识别且不是音频
  if (!isAudio) {
    corruptions.push(CorruptionType.LETHAL_CORRUPTION);
    details.push('文件二进制流严重损毁，无法解析为已知音频容器');
  }

  const canHeal = !corruptions.includes(CorruptionType.LETHAL_CORRUPTION);

  return {
    filePath,
    fileSize: stat.size,
    realFormat,
    declaredExt,
    corruptions,
    canHeal,
    details,
  };
}

/**
 * 运行自愈修复流水线
 * 依次应用帧对齐、STREAMINFO 补全、WAV 修复与尾部清理
 */
export async function executeHealingPipeline(
  diagnosis: InspectionDiagnosis
): Promise<HealingResult> {
  const config = getConfig();
  const originalPath = diagnosis.filePath;
  const fileName = path.basename(originalPath);

  // 若存在致命无法自愈损坏，立即归档至 quarantine 隔离区
  if (!diagnosis.canHeal) {
    const quarantinePath = path.join(config.storage.quarantineDir, fileName);
    fs.copyFileSync(originalPath, quarantinePath);
    inspectionLogger.error(
      { originalPath, quarantinePath, details: diagnosis.details },
      '[HealingPipeline] 音频存在致命坏损，已移交至安全隔离区'
    );

    return {
      success: false,
      originalPath,
      healedPath: quarantinePath,
      fixedCorruptions: [],
      healedBytes: 0,
      logs: ['文件致命毁损，已安全隔离至 ~/.wavelet/quarantine/'],
    };
  }

  // 无需修复直接返回
  if (diagnosis.corruptions.length === 0) {
    return {
      success: true,
      originalPath,
      healedPath: originalPath,
      fixedCorruptions: [],
      healedBytes: 0,
      logs: ['文件健康完整，无需自愈修复'],
    };
  }

  inspectionLogger.info(
    { originalPath, corruptions: diagnosis.corruptions },
    '[HealingPipeline] 发现可自愈坏损，正在启动流式修复...'
  );

  let currentBuffer = fs.readFileSync(originalPath);
  const fixedCorruptions: CorruptionType[] = [];
  const logs: string[] = [];

  // 1. 修复场景 3: 帧头对齐与切除头部脏字节
  const alignResult = alignFrameHeader(currentBuffer);
  if (alignResult.needsAlignment && alignResult.healedBuffer) {
    currentBuffer = Buffer.from(alignResult.healedBuffer);
    fixedCorruptions.push(CorruptionType.FRAME_ALIGNMENT_DIRTY);
    const msg = `已截除头部 ${alignResult.cleanOffset} 字节脏广告填充并重对齐帧头`;
    logs.push(msg);
    inspectionLogger.info({ offset: alignResult.cleanOffset }, msg);
  }

  // 2. 修复场景 2: FLAC STREAMINFO 逆向重建
  if (diagnosis.realFormat === 'flac') {
    const streamInfoResult = healFlacStreamInfo(currentBuffer);
    if (streamInfoResult.needsHeal && streamInfoResult.healedBuffer) {
      currentBuffer = Buffer.from(streamInfoResult.healedBuffer);
      fixedCorruptions.push(CorruptionType.MISSING_STREAMINFO);
      const msg = `已逆向推导并重建 34 字节 FLAC STREAMINFO 头部 (采样率: ${streamInfoResult.estimatedSampleRate}Hz, 位深: ${streamInfoResult.bitDepth}bit)`;
      logs.push(msg);
      inspectionLogger.info(msg);
    }
  }

  // 3. 修复场景 6: WAV 容器头重构
  if (diagnosis.realFormat === 'wav') {
    const wavResult = healWavHeader(currentBuffer);
    if (wavResult.needsHeal) {
      currentBuffer = Buffer.from(wavResult.healedBuffer);
      fixedCorruptions.push(CorruptionType.WAV_HEADER_CORRUPTED);
      const msg = `已重构 WAV 容器头 (重算 PCM 数据大小: ${wavResult.recalculatedDataSize} 字节)`;
      logs.push(msg);
      inspectionLogger.info(msg);
    }
  }

  // 4. 修复场景 5: 尾部脏广告数据剥除
  const tailResult = cleanTrailingGarbage(currentBuffer);
  if (tailResult.needsTruncation) {
    currentBuffer = Buffer.from(tailResult.healedBuffer);
    fixedCorruptions.push(CorruptionType.TRAILING_DIRTY_PADDING);
    const msg = `已剥除末尾 ${tailResult.truncatedBytes} 字节非标准垃圾填充`;
    logs.push(msg);
    inspectionLogger.info(msg);
  }

  // 5. 暂存健康修复后的文件至 temp 目录
  const tempPath = path.join(config.storage.cacheDir, 'temp', `healed_${Date.now()}_${fileName}`);
  fs.writeFileSync(tempPath, currentBuffer);

  return {
    success: true,
    originalPath,
    healedPath: tempPath,
    fixedCorruptions,
    healedBytes: currentBuffer.length,
    logs,
  };
}

/**
 * 诊断并自愈修复音频文件便捷门面函数
 */
export async function healAudioFile(
  filePath: string,
  diagnosis?: InspectionDiagnosis
): Promise<HealingResult> {
  const diag = diagnosis || (await diagnoseAudioFile(filePath));
  return executeHealingPipeline(diag);
}
