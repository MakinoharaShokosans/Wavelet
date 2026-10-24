import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertRootRegistrable, isPathInsideAnyRoot, isPathInsideDir } from '@wavelet/backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Unit Test: Path Guard (路径沙箱与合法根目录校验)', () => {
  const tmpRoot = path.join(os.tmpdir(), `wavelet_path_guard_${Date.now()}`);
  const baseDir = path.join(tmpRoot, 'Music');
  const siblingDir = path.join(tmpRoot, 'Music_Secret');
  const dataDir = path.join(tmpRoot, '.wavelet');

  beforeAll(() => {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(siblingDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });

    // 建立一个正常文件
    fs.writeFileSync(path.join(baseDir, 'track1.flac'), 'dummy');
    fs.mkdirSync(path.join(baseDir, 'subfolder'), { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'subfolder', 'track2.flac'), 'dummy');

    // 建立软链接 (如果系统支持)
    try {
      const symlinkToOutside = path.join(baseDir, 'symlink_outside');
      fs.symlinkSync(siblingDir, symlinkToOutside, 'dir');

      const symlinkToInside = path.join(tmpRoot, 'symlink_inside');
      fs.symlinkSync(baseDir, symlinkToInside, 'dir');
    } catch {
      // 某些受限文件系统可能不支持创建软链接，忽略
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  describe('isPathInsideDir', () => {
    it('常规同级与子目录文件应当被判定为内部合法路径', () => {
      expect(isPathInsideDir(path.join(baseDir, 'track1.flac'), baseDir)).toBe(true);
      expect(isPathInsideDir(path.join(baseDir, 'subfolder', 'track2.flac'), baseDir)).toBe(true);
      expect(isPathInsideDir(baseDir, baseDir)).toBe(true);
    });

    it('同前缀目录 (如 Music_Secret vs Music) 严禁被误判为子目录 (防同名混淆)', () => {
      expect(isPathInsideDir(siblingDir, baseDir)).toBe(false);
      expect(isPathInsideDir(path.join(siblingDir, 'secret.db'), baseDir)).toBe(false);
    });

    it('使用 ../ 跨越父级边界的路径应当被严格拦截', () => {
      const traversalPath = path.join(baseDir, '..', 'Music_Secret', 'secret.db');
      expect(isPathInsideDir(traversalPath, baseDir)).toBe(false);
    });

    it('尚未落盘创建的文件应当回退到最临近有效父级目录进行判定', () => {
      const uncreatedFile = path.join(baseDir, 'uncreated', 'nested', 'new_audio.flac');
      expect(isPathInsideDir(uncreatedFile, baseDir)).toBe(true);

      const uncreatedOutside = path.join(siblingDir, 'uncreated', 'outside.flac');
      expect(isPathInsideDir(uncreatedOutside, baseDir)).toBe(false);
    });

    it('软链接穿透解析：指向外部的软链接子路径应当被拦截', () => {
      const symlinkPath = path.join(baseDir, 'symlink_outside', 'leak.txt');
      if (fs.existsSync(path.join(baseDir, 'symlink_outside'))) {
        expect(isPathInsideDir(symlinkPath, baseDir)).toBe(false);
      }
    });
  });

  describe('isPathInsideAnyRoot', () => {
    it('位于任意一个合法根目录下的路径均应放行', () => {
      const roots = [baseDir, siblingDir];
      expect(isPathInsideAnyRoot(path.join(baseDir, 'track1.flac'), roots)).toBe(true);
      expect(isPathInsideAnyRoot(path.join(siblingDir, 'secret.db'), roots)).toBe(true);
      expect(isPathInsideAnyRoot('/etc/passwd', roots)).toBe(false);
    });

    it('根目录数组为空或目标路径为空时返回 false', () => {
      expect(isPathInsideAnyRoot(path.join(baseDir, 'track1.flac'), [])).toBe(false);
      expect(isPathInsideAnyRoot('', [baseDir])).toBe(false);
    });
  });

  describe('assertRootRegistrable', () => {
    it('合法存在的常规目录应当顺利通过校验', () => {
      expect(() => assertRootRegistrable(baseDir, dataDir)).not.toThrow();
      expect(() => assertRootRegistrable(siblingDir, dataDir)).not.toThrow();
    });

    it('不存在的路径或物理文件应当被抛出异常拦截', () => {
      expect(() => assertRootRegistrable(path.join(tmpRoot, 'non_existent'), dataDir)).toThrow(
        /不存在/
      );
      expect(() => assertRootRegistrable(path.join(baseDir, 'track1.flac'), dataDir)).toThrow(
        /必须为目录/
      );
    });

    it('严禁将操作系统根目录 / 或关键系统目录登记为曲库根', () => {
      expect(() => assertRootRegistrable('/', dataDir)).toThrow(/禁止将系统/);
      expect(() => assertRootRegistrable('/etc', dataDir)).toThrow(/禁止将系统/);
      if (fs.existsSync('/sys')) {
        expect(() => assertRootRegistrable('/sys', dataDir)).toThrow(/禁止将系统/);
      }
    });

    it('严禁将 Wavelet 数据存储目录 ~/.wavelet 或其子目录登记为曲库根 (防读取数据库/日志)', () => {
      expect(() => assertRootRegistrable(dataDir, dataDir)).toThrow(/禁止将 Wavelet 数据/);
      const subDataDir = path.join(dataDir, 'logs');
      fs.mkdirSync(subDataDir, { recursive: true });
      expect(() => assertRootRegistrable(subDataDir, dataDir)).toThrow(/禁止将 Wavelet 数据/);
    });
  });
});
