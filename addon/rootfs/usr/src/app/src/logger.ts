import pino from "pino";
import type { Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
