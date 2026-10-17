import { z } from 'zod';

export const ServerConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1024).max(65535).default(23333),
  corsOrigins: z.array(z.string()).default(['http://127.0.0.1:5173', 'http://localhost:5173']),
});

export const StorageConfigSchema = z.object({
  dataDir: z.string().default('~/.wavelet'),
  libraryDir: z.string().default('./musics'),
  quarantineDir: z.string().default('~/.wavelet/quarantine'),
  cacheDir: z.string().default('~/.wavelet/cache'),
  logsDir: z.string().default('~/.wavelet/logs'),
  databaseFile: z.string().default('~/.wavelet/wavelet.db'),
  titleParseMode: z.enum(['smart', 'filename', 'tag']).default('smart'),
});

export const AudioConfigSchema = z.object({
  outputMode: z.enum(['direct', 'web']).default('web'),
  outputDevice: z.string().default('default'),
  bufferSize: z.number().int().min(1024).max(65536).default(4096),
  defaultVolume: z.number().min(0).max(1).default(0.8),
});

export const TranscoderConfigSchema = z.object({
  maxConcurrency: z.number().int().min(1).max(64).default(2),
  compressionLevel: z.number().int().min(0).max(8).default(5),
  customFfmpegPath: z.string().default(''),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  maxFileSizeMB: z.number().int().min(1).max(100).default(10),
  maxFiles: z.number().int().min(1).max(10).default(3),
  consolePretty: z.boolean().default(true),
});

export const WaveletConfigSchema = z.object({
  version: z.number().int().default(1),
  server: ServerConfigSchema.default({}),
  storage: StorageConfigSchema.default({}),
  audio: AudioConfigSchema.default({}),
  transcoder: TranscoderConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

export type ValidatedWaveletConfig = z.infer<typeof WaveletConfigSchema>;
