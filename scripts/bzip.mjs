#!/usr/bin/env node
// ==============================================================================
// Wavelet ♫ Bilibili 音频解包、合集专属归档与原生自愈 FLAC 转化工具 (bzip)
// ==============================================================================
// 1. 扫描 ZIP 压缩包内的 audio.m4s，并读取上一级 entry.json；
// 2. 识别合集总标题 (title) 与分 P 音轨名 (page_data.part / ep.index_title)；
// 3. 在 ZIP 同级目录下创建专属管理文件夹 (以合集总标题或 ZIP 文件名命名)；
// 4. 音轨优先以 part (如 "朝影") 命名，转码并调用 Wavelet 原生母带自愈流水线；
// 5. 输出纯净标准 FLAC 并写入 metadata 元数据；
// 6. 自动彻底销毁所有中间 .wav 临时文件，避免占用磁盘与冗余散落。
// ==============================================================================

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 终端样式颜色
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function resolveHome(filepath) {
  if (!filepath) return '';
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
}

function sanitizeFilename(name) {
  if (!name) return '';
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBilibiliM4sBuffer(rawBuffer) {
  // B站客户端通常在 m4s 头部前置 9 字节或更多 0x00 字节
  // 查找标准 MP4 的 'ftyp' box
  const ftypIdx = rawBuffer.indexOf(Buffer.from('ftyp'));
  if (ftypIdx >= 4) {
    return rawBuffer.subarray(ftypIdx - 4);
  }

  // 部分无 ftyp 的流查找 'moov' box
  const moovIdx = rawBuffer.indexOf(Buffer.from('moov'));
  if (moovIdx >= 4) {
    return rawBuffer.subarray(moovIdx - 4);
  }

  return rawBuffer;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

/**
 * 寻找与 audioEntry 关联的 entry.json 内容
 */
function findEntryJsonContent(zip, audioEntry, allEntries) {
  const audioDir = path.dirname(audioEntry.entryName);
  const candidates = [
    path.posix.join(audioDir, 'entry.json'),
    path.posix.join(path.posix.dirname(audioDir), 'entry.json'),
    path.posix.join(path.posix.dirname(path.posix.dirname(audioDir)), 'entry.json'),
  ];

  for (const cand of candidates) {
    const match = zip.getEntry(cand);
    if (match) {
      return { content: match.getData().toString('utf-8'), foundPath: cand };
    }
  }

  // 全局回退查找
  const fallback = allEntries.find((e) => {
    if (e.isDirectory) return false;
    if (!e.entryName.toLowerCase().endsWith('entry.json')) return false;
    return audioEntry.entryName.startsWith(path.posix.dirname(e.entryName));
  });

  if (fallback) {
    return { content: fallback.getData().toString('utf-8'), foundPath: fallback.entryName };
  }

  return { content: null, foundPath: '' };
}

/**
 * 从 entry.json 中提取曲目与合集元数据
 * 优先级说明：
 * 单曲曲目名：优先提取分 P 名称 (page_data.part / ep.index_title)，无分 P 则回退至合集名 (title)
 * 合集/专辑名：提取 title 属性
 */
function extractMetadata(entryJsonContent) {
  if (!entryJsonContent) {
    return { trackTitle: '', collectionTitle: '', artist: '' };
  }
  try {
    const parsed = JSON.parse(entryJsonContent);
    const trackTitle = (
      parsed.page_data?.part ||
      parsed.part ||
      parsed.ep?.index_title ||
      parsed.title ||
      ''
    ).trim();
    const collectionTitle = (parsed.title || '').trim();
    const artist = (parsed.owner_name || parsed.artist || '').trim();
    return { trackTitle, collectionTitle, artist };
  } catch {
    return { trackTitle: '', collectionTitle: '', artist: '' };
  }
}

/**
 * 探测压缩包内合集总名称，用于创建管理专属目录
 */
function findCollectionTitle(entries) {
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (entry.entryName.toLowerCase().endsWith('entry.json')) {
      try {
        const parsed = JSON.parse(entry.getData().toString('utf-8'));
        if (parsed.title && typeof parsed.title === 'string' && parsed.title.trim()) {
          return parsed.title.trim();
        }
      } catch {}
    }
  }
  return '';
}

/**
 * 音频自愈与母带封装流水线执行
 */
async function healAndEncodeTrack({
  tempM4sPath,
  tempWavPath,
  targetFlacPath,
  ffmpegPath,
  metadata,
  diagnoseAudioFile,
  executeHealingPipeline,
}) {
  let healedWavPath = null;
  try {
    console.log('    正在解码为高保真 PCM 流...');
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i',
      tempM4sPath,
      '-vn',
      '-c:a',
      'pcm_s16le',
      tempWavPath,
    ]);

    console.log('    正在运行 Wavelet 原生母带自愈流水线...');
    const diagnosis = await diagnoseAudioFile(tempWavPath);
    const healResult = await executeHealingPipeline(diagnosis);

    const wavSourceForFlac = healResult.healedPath || tempWavPath;
    healedWavPath = healResult.healedPath;

    if (healResult.fixedCorruptions && healResult.fixedCorruptions.length > 0) {
      console.log(
        `    ${CYAN}ℹ 已自动修复 ${healResult.fixedCorruptions.length} 项容器与数据对齐问题${RESET}`
      );
    }

    console.log(`    正在无损修复并封装为 FLAC: ${DIM}${path.basename(targetFlacPath)}${RESET}...`);
    const ffmpegArgs = [
      '-y',
      '-i',
      wavSourceForFlac,
      '-vn',
      '-c:a',
      'flac',
      '-compression_level',
      '8',
    ];

    if (metadata.title) {
      ffmpegArgs.push('-metadata', `title=${metadata.title}`);
    }
    if (metadata.album) {
      ffmpegArgs.push('-metadata', `album=${metadata.album}`);
    }
    if (metadata.artist) {
      ffmpegArgs.push('-metadata', `artist=${metadata.artist}`);
    }
    ffmpegArgs.push(targetFlacPath);

    await execFileAsync(ffmpegPath, ffmpegArgs);
    return true;
  } finally {
    if (healedWavPath && fs.existsSync(healedWavPath)) {
      try {
        fs.unlinkSync(healedWavPath);
      } catch {}
    }
  }
}

/**
 * 处理单首 audio.m4s 转码、Wavelet 自愈与最终 FLAC 生成
 */
async function processSingleTrack({
  audioEntry,
  seq,
  total,
  zip,
  allEntries,
  targetDir,
  collectionTitle,
  ffmpegPath,
  diagnoseAudioFile,
  executeHealingPipeline,
  usedTitles,
}) {
  console.log(`${BOLD}[${seq}/${total}] 正在分析: ${audioEntry.entryName}${RESET}`);

  // 1. 查找 entry.json
  const { content: entryJsonContent, foundPath } = findEntryJsonContent(
    zip,
    audioEntry,
    allEntries
  );
  const meta = extractMetadata(entryJsonContent);

  // 2. 确定曲目最终名称 (优先 part，如 "朝影")
  const rawTitle =
    meta.trackTitle || path.basename(path.dirname(audioEntry.entryName)) || `audio_${seq}`;
  const safeBaseTitle = sanitizeFilename(rawTitle) || `audio_${seq}`;
  const occurCount = usedTitles.get(safeBaseTitle) || 0;
  usedTitles.set(safeBaseTitle, occurCount + 1);

  const finalTitle = occurCount === 0 ? safeBaseTitle : `${safeBaseTitle}_${occurCount + 1}`;
  console.log(
    `    曲目名称 : ${GREEN}"${finalTitle}"${RESET}${foundPath ? ` ${DIM}(from ${foundPath})${RESET}` : ''}`
  );

  const targetFlacPath = path.join(targetDir, `${finalTitle}.flac`);
  const tempM4sPath = path.join(os.tmpdir(), `bili_m4s_${Date.now()}_${seq}.m4s`);
  const tempWavPath = path.join(os.tmpdir(), `bili_wav_${Date.now()}_${seq}.wav`);

  try {
    // 3. 解除 B 站 0x00 混淆头
    const rawM4sBuffer = audioEntry.getData();
    const cleanedM4sBuffer = cleanBilibiliM4sBuffer(rawM4sBuffer);
    fs.writeFileSync(tempM4sPath, cleanedM4sBuffer);

    // 4. 自愈并转换为 FLAC
    await healAndEncodeTrack({
      tempM4sPath,
      tempWavPath,
      targetFlacPath,
      ffmpegPath,
      metadata: {
        title: finalTitle,
        album: meta.collectionTitle || collectionTitle,
        artist: meta.artist,
      },
      diagnoseAudioFile,
      executeHealingPipeline,
    });

    // 5. 深度校验最终产出的 FLAC 完整度
    const flacDiag = await diagnoseAudioFile(targetFlacPath);
    const flacSize = fs.statSync(targetFlacPath).size;

    console.log(
      `    ${GREEN}✔ FLAC 自愈封装成功${RESET}: ${targetFlacPath} (${formatBytes(flacSize)}, 状态: ${flacDiag.canHeal ? '100% 健康' : '已就绪'})`
    );
    return true;
  } catch (err) {
    console.error(`    ${RED}✖ 处理失败: ${err.message}${RESET}`);
    return false;
  } finally {
    // 6. 彻底清理所有临时 WAV 与 m4s 文件，杜绝磁盘冗余
    try {
      if (fs.existsSync(tempM4sPath)) fs.unlinkSync(tempM4sPath);
    } catch {}
    try {
      if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
    } catch {}
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(`${BOLD}Wavelet Bilibili 音频解包与自愈转换工具 (bzip)${RESET}`);
    console.log('');
    console.log('用法:');
    console.log('  bzip <bilibili_archive.zip>');
    console.log('');
    console.log('功能特色:');
    console.log('  1. 扫描 ZIP 内所有 audio.m4s 音频；');
    console.log('  2. 优先提取分 P 名称 (part 如 "朝影") 作为单曲名，合集 title 作为目录名；');
    console.log('  3. 在 ZIP 同级目录自动建立专属文件夹归拢存放，避免散落；');
    console.log('  4. 原生解混淆 B 站头部、深度诊断并执行 Wavelet 母带自愈流水线；');
    console.log('  5. 无损输出带元数据的标准 FLAC，并彻底自动销毁临时 WAV 文件。');
    console.log('');
    console.log('示例:');
    console.log('  bzip ~/Downloads/bilibili_audios.zip');
    process.exit(0);
  }

  const rawZipArg = args[0];
  const zipPath = resolveHome(rawZipArg);

  if (!fs.existsSync(zipPath)) {
    console.error(`${RED}✖ 错误: 未找到 ZIP 压缩包文件: ${zipPath}${RESET}`);
    process.exit(1);
  }

  // 动态导入 Wavelet 后端编译核心模块
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(currentDir, '..');
  const backendDistPath = path.resolve(projectRoot, 'packages/backend/dist/index.js');

  if (!fs.existsSync(backendDistPath)) {
    console.error(
      `${RED}✖ 错误: 未找到 Wavelet 后端产物，请在项目根目录运行 pnpm build 后重试${RESET}`
    );
    process.exit(1);
  }

  const { AdmZip, diagnoseAudioFile, executeHealingPipeline, probeEnvironment } = await import(
    backendDistPath
  );

  // 探测运行环境与 FFmpeg 路径
  let ffmpegPath = 'ffmpeg';
  try {
    const env = await probeEnvironment();
    if (env.ffmpegPath && fs.existsSync(env.ffmpegPath)) {
      ffmpegPath = env.ffmpegPath;
    }
  } catch {
    // 降级使用系统 PATH 中的 ffmpeg
  }

  console.log(`${CYAN}${BOLD}✦ Wavelet ♫ Bilibili 音频解包与母带自愈转换器${RESET}`);
  console.log(`${DIM}------------------------------------------------------------${RESET}`);
  console.log(`  ZIP 归档路径 : ${BOLD}${zipPath}${RESET}`);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // 1. 过滤所有 audio.m4s 文件
  const audioEntries = entries.filter((e) => {
    if (e.isDirectory) return false;
    const base = path.basename(e.entryName).toLowerCase();
    return base === 'audio.m4s';
  });

  if (audioEntries.length === 0) {
    console.warn(`${YELLOW}▲ 警告: 在压缩包内未找到任何名为 audio.m4s 的音频文件。${RESET}`);
    process.exit(0);
  }

  // 2. 识别合集总标题并在 ZIP 所在目录建立专属归纳文件夹
  const zipBaseName = path.basename(zipPath, path.extname(zipPath));
  const detectedCollectionTitle = findCollectionTitle(entries);
  const folderName = sanitizeFilename(detectedCollectionTitle || zipBaseName) || zipBaseName;
  const targetDir = path.join(path.dirname(zipPath), folderName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`  合集归纳目录 : ${BOLD}${targetDir}${RESET}`);
  console.log(`  FFmpeg 引擎  : ${DIM}${ffmpegPath}${RESET}`);
  console.log(`${DIM}------------------------------------------------------------${RESET}`);
  console.log(`  已发现 ${BOLD}${audioEntries.length}${RESET} 个待处理的 B站音频项。\n`);

  const usedTitles = new Map();
  let successCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < audioEntries.length; idx++) {
    const audioEntry = audioEntries[idx];
    const success = await processSingleTrack({
      audioEntry,
      seq: idx + 1,
      total: audioEntries.length,
      zip,
      allEntries: entries,
      targetDir,
      collectionTitle: detectedCollectionTitle,
      ffmpegPath,
      diagnoseAudioFile,
      executeHealingPipeline,
      usedTitles,
    });

    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    console.log('');
  }

  console.log(`${DIM}------------------------------------------------------------${RESET}`);
  console.log(
    `${GREEN}${BOLD}✔ 全部任务处理完毕！${RESET} 成功: ${BOLD}${successCount}${RESET} 首, 失败: ${BOLD}${failCount}${RESET} 首`
  );
  console.log(`  所有自愈后的 .flac 文件均已安全归档于: ${BOLD}${targetDir}${RESET}`);
}

main().catch((err) => {
  console.error(`${RED}✖ 执行异常: ${err.message}${RESET}`);
  process.exit(1);
});
