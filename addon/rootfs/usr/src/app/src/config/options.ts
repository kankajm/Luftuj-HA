import { existsSync, readFileSync } from "fs";
import { z } from "zod";

const OPTIONS_PATH = "/data/options.json";
const DEFAULT_STATIC_ROOT = "/usr/share/luftujha/www";
const DEFAULT_WEB_PORT = 8000;
const VALID_LOG_LEVELS = ["trace", "debug", "info", "notice", "warning", "error", "fatal"] as const;

const optionsFileSchema = z
  .object({
    log_level: z.string().optional(),
    ha_base_url: z.string().optional(),
    ha_token: z.string().optional(),
    web_port: z.number().int().optional(),
  })
  .partial();

type OptionsFile = z.infer<typeof optionsFileSchema>;

type LogLevel = (typeof VALID_LOG_LEVELS)[number];

const envSchema = z.object({
  LOG_LEVEL: z.string().optional(),
  PORT: z.string().optional(),
  WEB_PORT: z.string().optional(),
  HA_BASE_URL: z.string().optional(),
  HA_TOKEN: z.string().optional(),
  SUPERVISOR_TOKEN: z.string().optional(),
  STATIC_ROOT: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
});

export interface AppConfig {
  logLevel: LogLevel;
  baseUrl: string;
  token: string | null;
  webPort: number;
  staticRoot: string;
  corsOrigins: string[];
  offlineMode: boolean;
}

let cachedConfig: AppConfig | null = null;

function parseOptionsFile(): OptionsFile | null {
  if (!existsSync(OPTIONS_PATH)) {
    return null;
  }

  const raw = readFileSync(OPTIONS_PATH, "utf-8");
  const json = JSON.parse(raw) as unknown;
  return optionsFileSchema.parse(json);
}

function normaliseLogLevel(input?: string | null): LogLevel {
  if (!input) {
    return "info";
  }

  const value = input.toLowerCase();
  if (VALID_LOG_LEVELS.includes(value as LogLevel)) {
    return value as LogLevel;
  }

  throw new Error(`Invalid log level: ${input}`);
}

function parseCorsOrigins(input?: string | null): string[] {
  if (!input) {
    return ["*"];
  }

  const entries = input
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return entries.length > 0 ? entries : ["*"];
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const env = envSchema.parse(process.env);
  const options = parseOptionsFile();

  const logLevel = normaliseLogLevel(env.LOG_LEVEL ?? options?.log_level ?? "info");
  const baseUrl = options?.ha_base_url ?? env.HA_BASE_URL ?? "http://supervisor/core";
  const token = options?.ha_token ?? env.HA_TOKEN ?? env.SUPERVISOR_TOKEN ?? null;

  const envPort = Number.parseInt(env.PORT ?? env.WEB_PORT ?? "", 10);
  const optionsPort = options?.web_port;
  const webPort = envPort || optionsPort || DEFAULT_WEB_PORT;
  const staticRoot = env.STATIC_ROOT ?? DEFAULT_STATIC_ROOT;
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);

  cachedConfig = {
    logLevel,
    baseUrl,
    token,
    webPort,
    staticRoot,
    corsOrigins,
    offlineMode: token === null,
  };

  return cachedConfig;
}

export function getConfig(): AppConfig {
  return cachedConfig ?? loadConfig();
}
