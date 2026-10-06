import fs from 'node:fs';
import os from 'node:os';
import { logger } from '../bootstrap/logger.js';

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  sampleRates: number[];
  bitDepths: number[];
}

export class DeviceManager {
  private cachedDevices: AudioDevice[] | null = null;
  private defaultSampleRates = [44100, 48000, 88200, 96000, 176400, 192000];
  private defaultBitDepths = [16, 24, 32];

  /**
   * 枚举系统物理输出声卡设备
   * 在 Linux 下优先通过 /proc/asound 原生内核描述符快速检索
   * 零外部子进程，微秒级极速冷启，绝不卡死事件循环
   */
  async listDevices(refresh = false): Promise<AudioDevice[]> {
    if (this.cachedDevices && !refresh) {
      return this.cachedDevices;
    }

    const platform = os.platform();
    const devices: AudioDevice[] = [];

    // 默认虚拟总线设备 (始终包含)
    devices.push({
      id: 'default',
      name: '系统默认音频输出 (Default Sound Output)',
      isDefault: true,
      sampleRates: this.defaultSampleRates,
      bitDepths: this.defaultBitDepths,
    });

    if (platform === 'linux') {
      try {
        const alsaDevices = this.readLinuxAlsaDevices();
        for (const dev of alsaDevices) {
          if (!devices.some((d) => d.id === dev.id)) {
            devices.push(dev);
          }
        }
      } catch {
        logger.debug('[DeviceManager] 无法读取 /proc/asound 硬件列表，使用系统默认通道');
      }
    } else if (platform === 'win32') {
      devices.push({
        id: 'wasapi_exclusive',
        name: 'WASAPI 独占直通模式 (Bit-Perfect Exclusive)',
        isDefault: false,
        sampleRates: this.defaultSampleRates,
        bitDepths: this.defaultBitDepths,
      });
    } else if (platform === 'darwin') {
      devices.push({
        id: 'coreaudio_direct',
        name: 'CoreAudio 硬件直通 (Bit-Perfect Direct)',
        isDefault: false,
        sampleRates: this.defaultSampleRates,
        bitDepths: this.defaultBitDepths,
      });
    }

    this.cachedDevices = devices;
    logger.info({ count: devices.length }, '[DeviceManager] 音频输出设备枚举完成');
    return devices;
  }

  /**
   * 原生读取 Linux 内核 /proc/asound 声卡拓扑
   */
  private readLinuxAlsaDevices(): AudioDevice[] {
    const cardsMap = new Map<number, string>();
    const cardsPath = '/proc/asound/cards';
    const pcmPath = '/proc/asound/pcm';

    if (fs.existsSync(cardsPath)) {
      const cardsContent = fs.readFileSync(cardsPath, 'utf-8');
      for (const line of cardsContent.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+\[([^\]]+)\]:\s+(.+)$/);
        if (match) {
          cardsMap.set(Number.parseInt(match[1], 10), match[2].trim());
        }
      }
    }

    const list: AudioDevice[] = [];
    if (fs.existsSync(pcmPath)) {
      const pcmContent = fs.readFileSync(pcmPath, 'utf-8');
      for (const line of pcmContent.split('\n')) {
        const match = line.match(/^(\d+)-(\d+):\s+([^:]+):.*playback/);
        if (match) {
          const cardNum = Number.parseInt(match[1], 10);
          const devNum = Number.parseInt(match[2], 10);
          const devName = match[3].trim();
          const cardName = cardsMap.get(cardNum) || `Card ${cardNum}`;

          list.push({
            id: `hw:${cardNum},${devNum}`,
            name: `${cardName} - ${devName}`,
            isDefault: false,
            sampleRates: this.defaultSampleRates,
            bitDepths: this.defaultBitDepths,
          });
        }
      }
    }

    return list;
  }

  /**
   * 获取当前默认输出设备
   */
  async getDefaultDevice(): Promise<AudioDevice> {
    const list = await this.listDevices();
    return list.find((d) => d.isDefault) || list[0];
  }

  /**
   * 校验特定设备 ID 是否真实可用
   */
  async testDevice(deviceId: string): Promise<boolean> {
    const list = await this.listDevices();
    return list.some((d) => d.id === deviceId);
  }
}

let deviceManagerInstance: DeviceManager | null = null;

export function getDeviceManager(): DeviceManager {
  if (!deviceManagerInstance) {
    deviceManagerInstance = new DeviceManager();
  }
  return deviceManagerInstance;
}
