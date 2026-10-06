import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { getConfig } from '../../config/index.js';
import { logger } from '../bootstrap/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TranscodeTask {
  id: string;
  inputPath: string;
  outputPath: string;
  compressionLevel?: number;
  onProgress?: (percent: number) => void;
}

interface WorkerWrapper {
  worker: Worker;
  busy: boolean;
  taskId?: string;
}

export class TranscodeWorkerPool extends EventEmitter {
  private workers: WorkerWrapper[] = [];
  private queue: Array<{
    task: TranscodeTask;
    resolve: (val: string) => void;
    reject: (err: Error) => void;
  }> = [];
  private concurrency: number;
  private workerScriptPath: string;

  constructor(concurrency?: number) {
    super();
    const config = getConfig();
    this.concurrency = concurrency ?? config.transcoder.maxConcurrency;

    // 智能定位 worker 脚本路径 (兼容源码 ts 与打包后 js 目录层级)
    const candidates = [
      path.join(__dirname, 'transcode.worker.js'),
      path.join(__dirname, 'transcode.worker.mjs'),
      path.join(__dirname, 'transcode.worker.ts'),
      path.join(__dirname, 'modules/transcoder/transcode.worker.js'),
    ];

    this.workerScriptPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
    this.initPool();
  }

  private initPool(): void {
    if (!fs.existsSync(this.workerScriptPath)) {
      logger.warn(
        { path: this.workerScriptPath },
        '[WorkerPool] 未检测到 Worker 脚本文件，转码调度池将按需延迟激活'
      );
      return;
    }

    logger.info({ concurrency: this.concurrency }, '[WorkerPool] 正在初始化多线程转码调度池...');

    for (let i = 0; i < this.concurrency; i++) {
      try {
        const worker = new Worker(this.workerScriptPath);
        const wrapper: WorkerWrapper = { worker, busy: false };

        worker.on(
          'message',
          (msg: { type: string; taskId: string; percent?: number; error?: string }) => {
            if (msg.type === 'progress') {
              this.emit(`progress:${msg.taskId}`, msg.percent);
            }
          }
        );

        worker.on('error', (err) => {
          logger.error({ err }, '[WorkerPool] Worker 线程异常崩溃');
        });

        this.workers.push(wrapper);
      } catch (err) {
        logger.error({ err }, '[WorkerPool] 初始化单个 Worker 失败');
      }
    }
  }

  async submit(task: TranscodeTask): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;

    const idleWorker = this.workers.find((w) => !w.busy);
    if (!idleWorker) return;

    const item = this.queue.shift();
    if (!item) return;

    const { task, resolve, reject } = item;
    idleWorker.busy = true;
    idleWorker.taskId = task.id;

    const config = getConfig();
    const compressionLevel = task.compressionLevel ?? config.transcoder.compressionLevel;
    const ffmpegPath = config.transcoder.customFfmpegPath;

    const progressHandler = (percent: number) => {
      task.onProgress?.(percent);
    };
    this.on(`progress:${task.id}`, progressHandler);

    const messageHandler = (msg: {
      type: string;
      taskId: string;
      error?: string;
      outputPath?: string;
    }) => {
      if (msg.taskId !== task.id) return;

      if (msg.type === 'done') {
        cleanup();
        resolve(msg.outputPath || task.outputPath);
        this.dispatch();
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.error || '转码失败'));
        this.dispatch();
      }
    };

    const cleanup = () => {
      idleWorker.busy = false;
      idleWorker.taskId = undefined;
      idleWorker.worker.off('message', messageHandler);
      this.off(`progress:${task.id}`, progressHandler);
    };

    idleWorker.worker.on('message', messageHandler);

    idleWorker.worker.postMessage({
      type: 'start',
      taskId: task.id,
      inputPath: task.inputPath,
      outputPath: task.outputPath,
      compressionLevel,
      customFfmpegPath: ffmpegPath,
    });
  }

  terminate(): void {
    for (const w of this.workers) {
      w.worker.terminate();
    }
    this.workers = [];
    logger.info('[WorkerPool] 转码线程池已安全终止释放');
  }
}
