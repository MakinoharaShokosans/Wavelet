import fs from 'node:fs';
import path from 'node:path';

/**
 * 校验目标路径是否严格位于指定父目录内
 * 支持真实路径 (realpath) 软链接穿透解析与未落盘父级回退 (防同名/同前缀目录混淆与路径穿越)
 */
export function isPathInsideDir(targetPath: string, parentDir: string): boolean {
  if (!targetPath || !parentDir) return false;

  let resolvedParent: string;
  try {
    resolvedParent = fs.realpathSync(parentDir);
  } catch {
    resolvedParent = path.resolve(parentDir);
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = fs.realpathSync(targetPath);
  } catch {
    // 目标路径可能尚未创建，回退至最临近的存在祖先目录进行符号链接解析与边界校验
    let current = path.resolve(targetPath);
    const uncreatedSegments: string[] = [];
    while (!fs.existsSync(current) && path.dirname(current) !== current) {
      uncreatedSegments.unshift(path.basename(current));
      current = path.dirname(current);
    }
    try {
      const resolvedAncestor = fs.realpathSync(current);
      resolvedTarget = path.join(resolvedAncestor, ...uncreatedSegments);
    } catch {
      resolvedTarget = path.resolve(targetPath);
    }
  }

  const rel = path.relative(resolvedParent, resolvedTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 校验目标路径是否位于任意一个允许的根目录内
 */
export function isPathInsideAnyRoot(targetPath: string, allowedRoots: string[]): boolean {
  if (!targetPath || !allowedRoots || allowedRoots.length === 0) return false;
  return allowedRoots.some((root) => isPathInsideDir(targetPath, root));
}

const BLACKLISTED_SYSTEM_DIRS = [
  '/',
  '/etc',
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/var/run',
];

/**
 * 校验待登记的曲库根目录是否合法可信
 * 拒绝不存在、非目录、系统敏感目录以及数据目录 (~/.wavelet)
 */
export function assertRootRegistrable(candidatePath: string, dataDir: string): void {
  if (!candidatePath || typeof candidatePath !== 'string') {
    throw new Error('曲库目录路径不能为空');
  }

  const absPath = path.resolve(candidatePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`曲库根目录不存在: ${candidatePath}`);
  }

  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    throw new Error(`曲库根路径必须为目录而非文件: ${candidatePath}`);
  }

  let realCandidate: string;
  try {
    realCandidate = fs.realpathSync(absPath);
  } catch {
    realCandidate = absPath;
  }

  // 1. 拦截根目录与黑名单系统目录
  for (const sysDir of BLACKLISTED_SYSTEM_DIRS) {
    if (realCandidate === sysDir) {
      throw new Error(`禁止将系统关键目录 (${sysDir}) 登记为曲库根目录`);
    }
    if (sysDir !== '/' && isPathInsideDir(realCandidate, sysDir)) {
      throw new Error(`禁止将系统子目录 (${realCandidate}) 登记为曲库根目录`);
    }
  }

  // 2. 拦截 ~/.wavelet 数据存储目录 (防止读取 SQLite 数据库或日志文件)
  let realDataDir: string;
  try {
    realDataDir = fs.realpathSync(path.resolve(dataDir));
  } catch {
    realDataDir = path.resolve(dataDir);
  }

  if (realCandidate === realDataDir || isPathInsideDir(realCandidate, realDataDir)) {
    throw new Error('禁止将 Wavelet 数据与运行日志存储目录登记为曲库根');
  }
}
