import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '@wavelet/backend';
import { describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Unit Test: Config Schema & Self-Healing', () => {
  it('应当成功加载并解析合规的配置文件', () => {
    const sandbox = createTestSandbox();
    try {
      const config = loadConfig(sandbox.configPath);
      expect(config.version).toBe(1);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.storage.libraryDir).toBe(sandbox.config.storage.libraryDir);
      expect(config.transcoder.maxConcurrency).toBe(2);
    } finally {
      sandbox.cleanup();
    }
  });

  it('当配置文件缺失字段时应当自动补齐并回写自愈', () => {
    const sandbox = createTestSandbox();
    try {
      // 写入缺失 audio 和 transcoder 的残缺配置
      const partialConfig = {
        version: 1,
        server: { host: '127.0.0.1', port: 23333, corsOrigins: ['*'] },
        storage: sandbox.config.storage,
      };
      fs.writeFileSync(sandbox.configPath, JSON.stringify(partialConfig, null, 2), 'utf-8');

      // 执行自愈加载
      const healedConfig = loadConfig(sandbox.configPath);
      expect(healedConfig.audio).toBeDefined();
      expect(healedConfig.audio.defaultVolume).toBe(0.8);
      expect(healedConfig.transcoder.compressionLevel).toBe(5);

      // 验证已自动落盘
      const savedRaw = JSON.parse(fs.readFileSync(sandbox.configPath, 'utf-8'));
      expect(savedRaw.audio).toBeDefined();
    } finally {
      sandbox.cleanup();
    }
  });

  it('当配置文件语法损坏或完全非法时应当安全回退至默认配置', () => {
    const sandbox = createTestSandbox();
    try {
      // 写入非法 JSON 乱码
      fs.writeFileSync(sandbox.configPath, '{ invalid_json_syntax: true, ', 'utf-8');

      const fallbackConfig = loadConfig(sandbox.configPath);
      expect(fallbackConfig.version).toBe(1);
      expect(fallbackConfig.server.port).toBe(23333);
      expect(fallbackConfig.audio.outputMode).toBe('web');
    } finally {
      sandbox.cleanup();
    }
  });

  it('合规配置文件中显式设定的 titleParseMode 应当完整保留', () => {
    const sandbox = createTestSandbox();
    try {
      const customConfig = {
        ...sandbox.config,
        storage: {
          ...sandbox.config.storage,
          titleParseMode: 'tag' as const,
        },
      };
      fs.writeFileSync(sandbox.configPath, JSON.stringify(customConfig, null, 2), 'utf-8');

      const loaded = loadConfig(sandbox.configPath);
      expect(loaded.storage.titleParseMode).toBe('tag');
    } finally {
      sandbox.cleanup();
    }
  });
});
