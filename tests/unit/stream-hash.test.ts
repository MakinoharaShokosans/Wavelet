import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { computeFileHash, computeFileHashAsync } from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('T3 (ISSUE-13): Streaming SHA-256 Hash Unit Tests', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;

  beforeAll(() => {
    sandbox = createTestSandbox();
  });

  afterAll(() => {
    sandbox.cleanup();
  });

  it('同一样本下，新旧实现哈希输出逐字节完全一致', async () => {
    const sampleFlac = path.resolve('temp/鎖那 - 彼女は旅に出る.flac');
    let testFilePath = sampleFlac;

    if (!fs.existsSync(sampleFlac)) {
      testFilePath = path.join(sandbox.rootDir, 'sample.bin');
      const randomData = crypto.randomBytes(5 * 1024 * 1024);
      fs.writeFileSync(testFilePath, randomData);
    }

    const syncHash = computeFileHash(testFilePath);
    const asyncHash = await computeFileHashAsync(testFilePath);

    expect(asyncHash).toBe(syncHash);
    expect(asyncHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('空文件边界条件：新旧实现一致，返回空内容的 SHA-256 哈希', async () => {
    const emptyFile = path.join(sandbox.rootDir, 'empty.bin');
    fs.writeFileSync(emptyFile, Buffer.alloc(0));

    const syncHash = computeFileHash(emptyFile);
    const asyncHash = await computeFileHashAsync(emptyFile);

    const expectedHash = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    expect(syncHash).toBe(expectedHash);
    expect(asyncHash).toBe(expectedHash);
  });

  it('不存在的文件：新旧实现均抛出/拒绝 ENOENT 错误', async () => {
    const nonExistent = path.join(sandbox.rootDir, 'does-not-exist.flac');

    expect(() => computeFileHash(nonExistent)).toThrow(/ENOENT/);
    await expect(computeFileHashAsync(nonExistent)).rejects.toThrow(/ENOENT/);
  });

  it('支持自定义分块大小 (chunkSize)', async () => {
    const testFile = path.join(sandbox.rootDir, 'custom-chunks.bin');
    const content = crypto.randomBytes(512 * 1024); // 512 KB
    fs.writeFileSync(testFile, content);

    const expectedHash = computeFileHash(testFile);
    // 使用极小的 4KB 分块进行流式分批读取
    const asyncHash = await computeFileHashAsync(testFile, { chunkSize: 4 * 1024 });

    expect(asyncHash).toBe(expectedHash);
  });

  it('支持 AbortSignal 取消机制', async () => {
    const testFile = path.join(sandbox.rootDir, 'abort-test.bin');
    const content = crypto.randomBytes(2 * 1024 * 1024); // 2 MB
    fs.writeFileSync(testFile, content);

    const controller = new AbortController();
    controller.abort(new Error('Operation cancelled by user'));

    await expect(computeFileHashAsync(testFile, { signal: controller.signal })).rejects.toThrow(
      'Operation cancelled by user'
    );
  });
});
