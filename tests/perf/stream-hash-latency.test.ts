import fs from 'node:fs';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { computeFileHashAsync } from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('T3 (ISSUE-13): Stream Hash Event Loop Latency Benchmark', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let largeFilePath: string;

  beforeAll(async () => {
    sandbox = createTestSandbox();
    largeFilePath = path.join(sandbox.rootDir, 'large_200mb.dat');

    // 生成 ~200 MB 临时文件 (使用 1MB 重复 buffer 高速流式写入)
    const chunkSize = 1024 * 1024; // 1 MB
    const chunk = Buffer.alloc(chunkSize, 0xaa);
    const writeStream = fs.createWriteStream(largeFilePath);

    for (let i = 0; i < 200; i++) {
      if (!writeStream.write(chunk)) {
        await new Promise((resolve) => writeStream.once('drain', resolve));
      }
    }
    await new Promise((resolve) => writeStream.end(resolve));
  });

  afterAll(() => {
    try {
      if (fs.existsSync(largeFilePath)) {
        fs.unlinkSync(largeFilePath);
      }
    } catch {
      // 忽略清理异常
    }
    sandbox.cleanup();
  });

  it('在 200MB 大文件计算 SHA-256 期间，事件循环最大延迟严格 < 100ms', async () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();

    const t0 = Date.now();
    const hash = await computeFileHashAsync(largeFilePath);
    const elapsed = Date.now() - t0;

    histogram.disable();

    const maxDelayMs = histogram.max / 1e6;
    const meanDelayMs = histogram.mean / 1e6;

    console.log(
      `[Stream Hash Benchmark] 200MB 计算耗时: ${elapsed}ms, 事件循环延迟: Max=${maxDelayMs.toFixed(2)}ms, Mean=${meanDelayMs.toFixed(2)}ms, Hash=${hash.slice(0, 16)}...`
    );

    // 同步版 readFileSync 会阻塞事件循环整个文件读取与计算期间 (可能达数百毫秒)
    // 流式版本在每个 chunk (1MB) 读取与更新后均出让事件循环，确保网络与 WS 保持高响应度
    expect(maxDelayMs).toBeLessThan(100);
  });
});
