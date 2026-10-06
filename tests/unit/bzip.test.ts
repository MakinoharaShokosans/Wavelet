import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { AdmZip, diagnoseAudioFile, probeEnvironment } from '@wavelet/backend';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TEST_AUDIO_PATH, createTestSandbox } from '../test-helper.js';

const execFileAsync = promisify(execFile);

describe('Unit Test: Bilibili Audio Extractor & Healer (bzip)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeEach(() => {
    sandbox = createTestSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('应当优先使用 part (如 "朝影") 命名单曲、以合集名在 ZIP 同级建立专属目录归纳，并在自愈为 FLAC 后销毁临时 WAV', async () => {
    const env = await probeEnvironment();
    const ffmpegPath = env.ffmpegPath || 'ffmpeg';

    // 1. 生成 0.5 秒轻量 AAC audio.m4s
    const rawM4sPath = path.join(sandbox.rootDir, 'raw_temp.m4s');
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss',
      '0',
      '-t',
      '0.5',
      '-i',
      TEST_AUDIO_PATH,
      '-c:a',
      'aac',
      '-vn',
      '-f',
      'mp4',
      rawM4sPath,
    ]);

    // 2. 模拟 B站客户端下载缓存的 9 字节 0x00 头部混淆
    const rawM4sBuffer = fs.readFileSync(rawM4sPath);
    const obfuscatedBuffer = Buffer.concat([Buffer.alloc(9, 0), rawM4sBuffer]);

    // 3. 构建模拟 B 站合集导出 ZIP 压缩包 (如 Kanon OST，含合集 title 与分 P part "朝影")
    const zipDest = path.join(sandbox.rootDir, 'kanon_collection.zip');
    const zip = new AdmZip();

    // 添加 entry.json (合集 title 为 "「 Kanon 」Original Soundtrack"，分 P part 为 "朝影")
    const entryJson = JSON.stringify({
      title: '「 Kanon 」Original Soundtrack',
      owner_name: 'Key Sound Label',
      page_data: {
        cid: 11150395,
        page: 1,
        part: '朝影',
      },
    });
    zip.addFile('11150395/entry.json', Buffer.from(entryJson, 'utf-8'));

    // 添加带有前置零混淆的 audio.m4s
    zip.addFile('11150395/1/audio.m4s', obfuscatedBuffer);
    zip.writeZip(zipDest);

    expect(fs.existsSync(zipDest)).toBe(true);

    // 4. 调用 bzip 脚本处理该 ZIP
    const bzipScript = path.resolve(__dirname, '../../scripts/bzip.sh');
    const { stdout } = await execFileAsync(bzipScript, [zipDest]);

    // 验证输出日志包含合集目录、分 P 曲目名与成功提示
    expect(stdout).toContain('「 Kanon 」Original Soundtrack');
    expect(stdout).toContain('朝影');
    expect(stdout).toContain('FLAC 自愈封装成功');

    // 5. 验证是否在 ZIP 同级目录下创建专属管理文件夹，而不是散落放置
    const expectedDir = path.join(sandbox.rootDir, '「 Kanon 」Original Soundtrack');
    expect(fs.existsSync(expectedDir)).toBe(true);

    // 6. 验证优先使用 part ("朝影.flac") 命名，且临时 .wav 已被完全销毁
    const expectedFlac = path.join(expectedDir, '朝影.flac');
    const unexpectedWavInDir = path.join(expectedDir, '朝影.wav');
    const unexpectedFlacInRoot = path.join(sandbox.rootDir, '朝影.flac');
    const unexpectedWavInRoot = path.join(sandbox.rootDir, '朝影.wav');

    expect(fs.existsSync(expectedFlac)).toBe(true);
    expect(fs.existsSync(unexpectedWavInDir)).toBe(false); // 确保 WAV 已被自动彻底删除
    expect(fs.existsSync(unexpectedFlacInRoot)).toBe(false); // 确保不在 ZIP 根目录散乱生成
    expect(fs.existsSync(unexpectedWavInRoot)).toBe(false);

    const flacStat = fs.statSync(expectedFlac);
    expect(flacStat.size).toBeGreaterThan(1000);

    // 7. 用 Wavelet 诊断流水线深度校验生成的 FLAC
    const flacDiagnosis = await diagnoseAudioFile(expectedFlac);
    expect(flacDiagnosis.realFormat).toBe('flac');
    expect(flacDiagnosis.canHeal).toBe(true);
  });

  it('若无分 P 的 part，应当平滑回退使用 title 命名，并同样在专属目录下生成 FLAC 且销毁 WAV', async () => {
    const env = await probeEnvironment();
    const ffmpegPath = env.ffmpegPath || 'ffmpeg';

    const rawM4sPath = path.join(sandbox.rootDir, 'raw_temp2.m4s');
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss',
      '0',
      '-t',
      '0.5',
      '-i',
      TEST_AUDIO_PATH,
      '-c:a',
      'aac',
      '-vn',
      '-f',
      'mp4',
      rawM4sPath,
    ]);

    const rawM4sBuffer = fs.readFileSync(rawM4sPath);
    const obfuscatedBuffer = Buffer.concat([Buffer.alloc(9, 0), rawM4sBuffer]);

    const zipDest = path.join(sandbox.rootDir, 'single_track.zip');
    const zip = new AdmZip();

    // 仅有 title，无 page_data.part
    const entryJson = JSON.stringify({
      title: 'Last Regrets',
      owner_name: 'Key Sound Label',
    });
    zip.addFile('9999/entry.json', Buffer.from(entryJson, 'utf-8'));
    zip.addFile('9999/1/audio.m4s', obfuscatedBuffer);
    zip.writeZip(zipDest);

    const bzipScript = path.resolve(__dirname, '../../scripts/bzip.sh');
    await execFileAsync(bzipScript, [zipDest]);

    const expectedDir = path.join(sandbox.rootDir, 'Last Regrets');
    expect(fs.existsSync(expectedDir)).toBe(true);

    const expectedFlac = path.join(expectedDir, 'Last Regrets.flac');
    const unexpectedWav = path.join(expectedDir, 'Last Regrets.wav');

    expect(fs.existsSync(expectedFlac)).toBe(true);
    expect(fs.existsSync(unexpectedWav)).toBe(false);
  });
});
