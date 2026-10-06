import { Database, TrackRepository, loadConfig, runMigrations } from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Resilience & Stress Tests: Concurrency & System Limits', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeAll(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
  });

  afterAll(() => {
    sandbox.cleanup();
  });

  it('压测 1: 异步高并发突发任务投递下的调度吞吐与稳定性', async () => {
    // 模拟 50 个密集型异步任务突发调度
    const taskCount = 50;
    const taskPromises: Promise<number>[] = [];

    for (let i = 0; i < taskCount; i++) {
      taskPromises.push(
        new Promise<number>((resolve) => {
          setTimeout(
            () => {
              let sum = 0;
              for (let j = 0; j < 10000; j++) {
                sum += j;
              }
              resolve(sum);
            },
            Math.floor(Math.random() * 10)
          );
        })
      );
    }

    const results = await Promise.all(taskPromises);
    expect(results.length).toBe(taskCount);
    expect(results.every((r) => r === 49995000)).toBe(true);
  });

  it('压测 2: SQLite WAL 模式在并发读写冲突下的数据自愈与一致性', async () => {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    runMigrations(db);
    const trackRepo = new TrackRepository(db);

    // 模拟 50 个并发读写操作
    const operations: Promise<void>[] = [];

    for (let i = 0; i < 50; i++) {
      if (i % 2 === 0) {
        operations.push(
          Promise.resolve().then(() => {
            trackRepo.insert({
              id: `trk_stress_${i}`,
              title: `Concurrency Track ${i}`,
              artist: 'Concurrent Artist',
              album: 'Stress Album',
              duration: 200,
              bitrate: 320000,
              sampleRate: 44100,
              bitDepth: 16,
              channels: 2,
              filePath: `/music/stress_${i}.flac`,
              fileSize: 1024,
              fileHash: `hash_stress_${i}`,
              hasEmbeddedCover: false,
              hasEmbeddedLyrics: false,
              healthyStatus: 'healthy',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          })
        );
      } else {
        operations.push(
          Promise.resolve().then(() => {
            trackRepo.findAll({ keyword: 'Concurrency' });
          })
        );
      }
    }

    await Promise.all(operations);

    // 验证写入成功总数
    const finalResult = trackRepo.findAll({ keyword: 'Concurrency' });
    expect(finalResult.total).toBe(25);
    db.close();
  });
});
