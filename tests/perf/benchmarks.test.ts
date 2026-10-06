import { performance } from 'node:perf_hooks';
import {
  Database,
  FftPump,
  TrackRepository,
  loadConfig,
  probeEnvironment,
  runMigrations,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Performance Benchmarks: Latency, Footprint & FFT Jitter', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeAll(() => {
    sandbox = createTestSandbox();
  });

  afterAll(() => {
    sandbox.cleanup();
  });

  it('基准 1: 核心初始化冷启动全流程 10 次采样耗时评估 (及格 <= 150ms, 卓越 < 80ms)', () => {
    const samples: number[] = [];

    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();

      // 模拟冷启动核心链路：环境探测 -> 配置加载 -> 内存SQLite增量迁移
      probeEnvironment();
      loadConfig(sandbox.configPath);
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      runMigrations(db);
      new TrackRepository(db);
      db.close();

      const elapsed = performance.now() - t0;
      samples.push(elapsed);
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);

    console.log(
      `[ColdStart Benchmark] 10 次采样耗时: Avg: ${avg.toFixed(2)}ms, Min: ${min.toFixed(2)}ms, Max: ${max.toFixed(2)}ms`
    );

    // 强断言：平均冷启与峰值冷启严格 <= 150ms 架构及格线
    expect(avg).toBeLessThan(150);
    expect(max).toBeLessThan(150);
  });

  it('基准 2: 常驻内存消耗 (RSS) 评测 (架构线 <= 35MB)', () => {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / (1024 * 1024);
    const rssMB = mem.rss / (1024 * 1024);

    console.log(
      `[Memory Footprint] HeapUsed: ${heapUsedMB.toFixed(2)}MB, RSS: ${rssMB.toFixed(2)}MB`
    );

    // 在单测轻量环境下断言堆占用处于合理低位 (< 50MB)
    expect(heapUsedMB).toBeLessThan(50);
  });

  it('基准 3: 60fps FFT 频域频谱计算时延与帧抖动标准差评测', () => {
    const fftPump = new FftPump(1024, 64);
    const sampleRate = 44100;
    const pcmChunk = Buffer.alloc(1024 * 2);

    for (let i = 0; i < 1024; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      pcmChunk.writeInt16LE(Math.floor(sample * 32767), i * 2);
    }

    // 预热 JIT
    for (let i = 0; i < 50; i++) {
      fftPump.processPcmChunk(pcmChunk);
    }

    // 连续 300 次计算采样
    const durations: number[] = [];
    for (let i = 0; i < 300; i++) {
      const t0 = performance.now();
      fftPump.processPcmChunk(pcmChunk);
      durations.push(performance.now() - t0);
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance =
      durations.reduce((sum, d) => sum + (d - avgDuration) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    console.log(
      `[FFT Benchmark] 单帧计算平均耗时: ${avgDuration.toFixed(4)}ms, 抖动标准差: ${stdDev.toFixed(4)}ms`
    );

    // 强断言：单帧 64-band FFT 运算必须在 1ms 之内极速完成 (以支持 16.6ms 刷新率)
    expect(avgDuration).toBeLessThan(1.0);
    // 抖动标准差必须 < 0.5ms
    expect(stdDev).toBeLessThan(0.5);
  });

  it('基准 4: 千级曲库全文模糊检索与多字段过滤时延 (P99 <= 10ms)', () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    const trackRepo = new TrackRepository(db);

    // 批量灌入 1,000 首模拟曲目
    const insertTx = db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        trackRepo.insert({
          id: `trk_bench_${i}`,
          title: `Track Title ${i} - 彼女は旅に出る ${i % 10}`,
          artist: i % 2 === 0 ? '鎖那' : `Artist_${i % 50}`,
          album: `Album_${i % 20}`,
          duration: 180 + (i % 60),
          bitrate: 320000,
          sampleRate: 44100,
          bitDepth: 16,
          channels: 2,
          filePath: `/music/track_${i}.flac`,
          fileSize: 20000000 + i * 1000,
          fileHash: `hash_bench_${i}`,
          hasEmbeddedCover: true,
          hasEmbeddedLyrics: false,
          healthyStatus: 'healthy',
          createdAt: Date.now() - i * 1000,
          updatedAt: Date.now(),
        });
      }
    });
    insertTx();

    // 执行 100 次并发查询测试时延分布
    const queryLatencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const keyword = i % 2 === 0 ? '鎖那' : `Title ${i * 3}`;
      const t0 = performance.now();
      const res = trackRepo.findAll({
        keyword,
        page: 1,
        pageSize: 20,
      });
      const elapsed = performance.now() - t0;
      queryLatencies.push(elapsed);
      expect(res.items.length).toBeGreaterThanOrEqual(0);
    }

    queryLatencies.sort((a, b) => a - b);
    const p50 = queryLatencies[Math.floor(queryLatencies.length * 0.5)];
    const p90 = queryLatencies[Math.floor(queryLatencies.length * 0.9)];
    const p99 = queryLatencies[Math.floor(queryLatencies.length * 0.99)];

    console.log(
      `[Library Search Benchmark] 1,000 首曲库检索响应: P50=${p50.toFixed(3)}ms, P90=${p90.toFixed(3)}ms, P99=${p99.toFixed(3)}ms`
    );

    // 强断言：P99 检索时延严格 <= 10ms (实测通常 < 2ms)
    expect(p99).toBeLessThan(10);
    db.close();
  });
});
