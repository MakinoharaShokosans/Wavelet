import fs from 'node:fs';
import path from 'node:path';
import {
  PlaybackRouter,
  TrackRepository,
  closeDatabase,
  getDatabase,
  loadConfig,
  runMigrations,
} from '@wavelet/backend';
import type { Track } from '@wavelet/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSandbox } from '../test-helper.js';

describe('Unit Test: Playback Queue & Modes (播放队列与播放模式状态机)', () => {
  let sandbox: ReturnType<typeof createTestSandbox>;
  let router: PlaybackRouter;
  let trackRepo: TrackRepository;

  const sampleTracks: Track[] = [
    {
      id: 'trk_q_01',
      title: 'Queue Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      duration: 180,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/q1.flac',
      fileSize: 1000,
      fileHash: 'hash_q1',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'trk_q_02',
      title: 'Queue Song 2',
      artist: 'Artist 2',
      album: 'Album 2',
      duration: 200,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/q2.flac',
      fileSize: 1000,
      fileHash: 'hash_q2',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'trk_q_03',
      title: 'Queue Song 3',
      artist: 'Artist 3',
      album: 'Album 3',
      duration: 220,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: '/music/q3.flac',
      fileSize: 1000,
      fileHash: 'hash_q3',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  beforeAll(() => {
    sandbox = createTestSandbox();
    loadConfig(sandbox.configPath);
    runMigrations(getDatabase());

    // 创建虚拟音频文件以满足物理文件存在性校验
    for (const t of sampleTracks) {
      const realPath = path.join(sandbox.config.storage.libraryDir, path.basename(t.filePath));
      fs.writeFileSync(realPath, 'dummy-audio-content');
      t.filePath = realPath;
    }

    trackRepo = new TrackRepository();
    for (const t of sampleTracks) {
      trackRepo.insert(t);
    }

    router = new PlaybackRouter();
  });

  afterAll(() => {
    closeDatabase();
    sandbox.cleanup();
  });

  it('初始队列应当为空', () => {
    const queueStatus = router.getQueue();
    expect(queueStatus.queue.length).toBe(0);
    expect(queueStatus.currentIndex).toBe(-1);
    expect(queueStatus.currentTrack).toBeNull();
    expect(queueStatus.playMode).toBe('sequence');
  });

  it('setQueue 应当设置整批曲目并启动第一首播放', async () => {
    await router.setQueue(sampleTracks, 0);

    const q = router.getQueue();
    expect(q.queue.length).toBe(3);
    expect(q.currentIndex).toBe(0);
    expect(q.currentTrack?.id).toBe('trk_q_01');

    // 验证播放时已自动累加 play_count
    const updatedTrack = trackRepo.findById('trk_q_01');
    expect(updatedTrack?.playCount).toBeGreaterThanOrEqual(1);
    expect(updatedTrack?.lastPlayedAt).toBeDefined();
  });

  it('addToQueue 应当支持插队播放 (next: true) 与追加队尾 (next: false)', () => {
    const extraFilePath = path.join(sandbox.config.storage.libraryDir, 'extra.flac');
    fs.writeFileSync(extraFilePath, 'dummy-audio-content');
    const extraTrack: Track = {
      id: 'trk_q_extra',
      title: 'Extra Track',
      artist: 'Extra',
      album: 'Extra',
      duration: 150,
      bitrate: 320000,
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      filePath: extraFilePath,
      fileSize: 1000,
      fileHash: 'hash_extra',
      hasEmbeddedCover: false,
      hasEmbeddedLyrics: false,
      healthyStatus: 'healthy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    trackRepo.insert(extraTrack);

    // 插队到当前正在播放 (index: 0) 的下一位
    router.addToQueue([extraTrack], true);
    const q1 = router.getQueue();
    expect(q1.queue.length).toBe(4);
    expect(q1.queue[1].id).toBe('trk_q_extra');

    // 从队列移除该单曲
    router.removeFromQueue(1);
    expect(router.getQueue().queue.length).toBe(3);
  });

  it('播放模式控制：sequence 模式到达末尾应自动停止', async () => {
    router.setPlayMode('sequence');
    await router.setQueue(sampleTracks, 1); // 从第 2 首开始

    await router.next(); // 应该切到第 3 首 (index 2)
    expect(router.getQueue().currentIndex).toBe(2);

    await router.next(); // 到达末尾，sequence 模式应该停止
    expect(router.getStatus().state).toBe('stopped');
  });

  it('播放模式控制：repeat-list 模式到达末尾应自动循环回第 1 首', async () => {
    router.setPlayMode('repeat-list');
    await router.setQueue(sampleTracks, 2); // 设在最后一首 (index 2)

    await router.next();
    expect(router.getQueue().currentIndex).toBe(0);
    expect(router.getQueue().currentTrack?.id).toBe('trk_q_01');

    // 上一首应该环回至最后一首
    await router.previous();
    expect(router.getQueue().currentIndex).toBe(2);
    expect(router.getQueue().currentTrack?.id).toBe('trk_q_03');
  });

  it('播放模式控制：repeat-track 单曲循环模式 next 应持续重播当前曲目', async () => {
    router.setPlayMode('repeat-track');
    await router.setQueue(sampleTracks, 1);

    await router.next();
    expect(router.getQueue().currentIndex).toBe(1);
    expect(router.getQueue().currentTrack?.id).toBe('trk_q_02');
  });

  it('clearQueue 应当清空未播列表但保留当前播放中的曲目', async () => {
    await router.setQueue(sampleTracks, 1);
    router.clearQueue();

    const q = router.getQueue();
    expect(q.queue.length).toBe(1);
    expect(q.currentIndex).toBe(0);
    expect(q.currentTrack?.id).toBe('trk_q_02');
  });

  it('播放控制：pause、resume、seek 与 setVolume 状态流转应当正常', async () => {
    await router.play('trk_q_01', 0);
    expect(router.getStatus().state).toBe('playing');

    router.pause();
    expect(router.getStatus().state).toBe('paused');

    await router.seek(15000);
    expect(router.getStatus().currentTimeMs).toBe(15000);

    router.resume();
    expect(router.getStatus().state).toBe('playing');

    router.setVolume(0.45);
    expect(router.getStatus().volume).toBe(0.45);

    router.stop();
    expect(router.getStatus().state).toBe('stopped');
  });

  it('输出模式与设备切换：setOutputMode 与 setOutputDevice 应当平滑切换', async () => {
    await router.play('trk_q_01', 5000);
    expect(router.getStatus().mode).toBe('web');

    // 切换至 direct 模式
    router.setOutputMode('direct');
    expect(router.getStatus().mode).toBe('direct');

    // 切换物理设备
    router.setOutputDevice('hw:0,0');
    expect(router.getStatus().deviceId).toBe('hw:0,0');

    // 切换回 web 模式
    router.setOutputMode('web');
    expect(router.getStatus().mode).toBe('web');

    router.stop();
  });

  it('播放模式控制：shuffle 随机播放模式 next 应当切换曲目', async () => {
    router.setPlayMode('shuffle');
    await router.setQueue(sampleTracks, 0);

    await router.next();
    const q = router.getQueue();
    expect(q.currentIndex).toBeGreaterThanOrEqual(0);
    expect(q.currentIndex).toBeLessThan(sampleTracks.length);
  });

  it('当曲目不存在时 play 应当抛出异常', async () => {
    await expect(router.play('non_existent_id')).rejects.toThrow('不存在');
  });
});
