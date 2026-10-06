import {
  PlaybackRouter,
  closeDatabase,
  getDatabase,
  getDirectPlayer,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Unit Test: BS2B Crossfeed DSP (耳塞互馈声场算法状态机与直通调度)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let router: PlaybackRouter;

  beforeAll(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());
    router = new PlaybackRouter();
  });

  afterAll(() => {
    if (router) {
      router.stop();
    }
    closeDatabase();
    sandbox.cleanup();
  });

  it('1. DirectPcmPlayer 应支持开关 BS2B 声场算法并如实反馈状态', () => {
    const directPlayer = getDirectPlayer();
    expect(directPlayer.getBs2b()).toBe(false);
    expect(directPlayer.getStatus().bs2bEnabled).toBe(false);

    directPlayer.setBs2b(true);
    expect(directPlayer.getBs2b()).toBe(true);
    expect(directPlayer.getStatus().bs2bEnabled).toBe(true);

    directPlayer.setBs2b(false);
    expect(directPlayer.getBs2b()).toBe(false);
    expect(directPlayer.getStatus().bs2bEnabled).toBe(false);
  });

  it('2. PlaybackRouter 应能在 Web 模式和 Direct 模式下持久维护 BS2B 状态', () => {
    // 初始状态下 bs2b 处于关闭状态
    expect(router.getBs2b()).toBe(false);
    expect(router.getStatus().bs2bEnabled).toBe(false);

    // 开启 BS2B
    router.setBs2b(true);
    expect(router.getBs2b()).toBe(true);
    expect(router.getStatus().bs2bEnabled).toBe(true);

    // 切换到 Direct 模式后 BS2B 状态依然保持点亮
    router.setOutputMode('direct');
    expect(router.getStatus().mode).toBe('direct');
    expect(router.getStatus().bs2bEnabled).toBe(true);
    expect(getDirectPlayer().getBs2b()).toBe(true);

    // 切换回 Web 模式，状态持续有效
    router.setOutputMode('web');
    expect(router.getStatus().mode).toBe('web');
    expect(router.getStatus().bs2bEnabled).toBe(true);

    // 关闭 BS2B
    router.setBs2b(false);
    expect(router.getBs2b()).toBe(false);
    expect(router.getStatus().bs2bEnabled).toBe(false);
  });
});
