import fs from 'node:fs';
import path from 'node:path';
import {
  CorruptionType,
  IntegrityGuard,
  TrackRepository,
  diagnoseAudioFile,
  executeHealingPipeline,
  getDatabase,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('E2E Test: Fault Recovery & Disaster Resiliency', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeAll(() => {
    sandbox = createTestSandbox();
  });

  afterAll(() => {
    sandbox.cleanup();
  });

  it('场景 1: 当本地配置文件发生字段投毒或格式损坏时，系统应自愈补齐并维持稳定运行', () => {
    // 写入一个非法/破坏性的配置文件
    const brokenConfigPath = path.join(sandbox.rootDir, 'broken_config.json');
    fs.writeFileSync(
      brokenConfigPath,
      JSON.stringify({
        version: 'illegal_version_string',
        server: { port: -9999 },
        audio: { bufferSize: 'not_a_number' },
      }),
      'utf-8'
    );

    // loadConfig 应能够安全捕获并回退至安全默认值，并覆盖写回健康配置
    const healedConfig = loadConfig(brokenConfigPath);
    expect(healedConfig.server.port).toBe(23333);
    expect(healedConfig.audio.bufferSize).toBe(4096);
    expect(healedConfig.version).toBe(1);

    // 验证磁盘上的配置文件已被自愈写回合法的 JSON
    const onDisk = JSON.parse(fs.readFileSync(brokenConfigPath, 'utf-8'));
    expect(onDisk.server.port).toBe(23333);
  });

  it('场景 2: 异常掉电产生的残留临时切片，系统在下次启动时应全量安全清除', () => {
    loadConfig(sandbox.configPath);
    const tempDir = path.join(sandbox.config.storage.cacheDir, 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    // 模拟上次崩溃遗留的 3 个脏切片
    fs.writeFileSync(path.join(tempDir, 'dirty_transcode_001.tmp'), 'junk pcm');
    fs.writeFileSync(path.join(tempDir, 'dirty_transcode_002.tmp'), 'junk pcm');
    fs.writeFileSync(path.join(tempDir, 'healed_stale_003.flac'), 'junk pcm');

    expect(fs.readdirSync(tempDir).length).toBe(3);

    // 运行完整性守卫的清理流程
    const guard = new IntegrityGuard();
    const cleanedCount = guard.cleanTempDirectory();

    expect(cleanedCount).toBe(3);
    expect(fs.readdirSync(tempDir).length).toBe(0);
  });

  it('场景 3: 致命损毁文件（非音频伪装）无法修复时，应当安全转移至隔离区 (Quarantine)', async () => {
    loadConfig(sandbox.configPath);
    const lethalPath = path.join(sandbox.rootDir, 'trojan_virus_payload.flac');
    // 写入 1MB 随机不可逆乱码二进制
    fs.writeFileSync(lethalPath, Buffer.from('TOTALLY_GARBAGE_BINARY_DEADBEEF'.repeat(1024)));

    // 1. 初检诊断判定为致命损毁
    const diagnosis = await diagnoseAudioFile(lethalPath);
    expect(diagnosis.canHeal).toBe(false);
    expect(diagnosis.corruptions).toContain(CorruptionType.LETHAL_CORRUPTION);

    // 2. 流水线执行修复
    const healResult = await executeHealingPipeline(diagnosis);
    expect(healResult.success).toBe(false);

    // 3. 验证文件已隔离至 quarantine 目录
    const quarantineDir = sandbox.config.storage.quarantineDir;
    const quarantinedFile = path.join(quarantineDir, 'trojan_virus_payload.flac');
    expect(fs.existsSync(quarantinedFile)).toBe(true);
  });

  it('场景 4: 曲库物理源文件丢失时，完整性巡检应标记为 missing 而不导致整个服务崩溃', () => {
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
    const trackRepo = new TrackRepository();

    const trackId = 'trk_lost_001';
    trackRepo.insert({
      id: trackId,
      title: 'Lost Track',
      artist: 'Unknown',
      album: 'Unknown',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: path.join(sandbox.rootDir, 'non_existent_file.flac'),
      fileSize: 10000,
      fileHash: 'sha256_mock_lost',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const guard = new IntegrityGuard(trackRepo);
    const audit = guard.auditMissingFiles();

    expect(audit.missingCount).toBe(1);
    expect(audit.missingTrackIds).toContain(trackId);

    const updated = trackRepo.findById(trackId);
    expect(updated?.healthyStatus).toBe('missing');
  });
});
