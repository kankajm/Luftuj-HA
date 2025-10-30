type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMeta = Record<string, unknown> | undefined

type ConsoleMethod = (message?: unknown, ...optionalParams: unknown[]) => void

const LOG_NAMESPACE = '[Luftator]'

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const envLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined)?.toLowerCase() as LogLevel | undefined
const defaultLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'info'
const activeLevel: LogLevel = envLevel && envLevel in levelPriority ? envLevel : defaultLevel

const shouldLog = (level: LogLevel) => levelPriority[level] >= levelPriority[activeLevel]

const logWithConsole = (method: ConsoleMethod, level: LogLevel, message: string, meta?: LogMeta) => {
  if (!shouldLog(level)) {
    return
  }

  if (meta && Object.keys(meta).length > 0) {
    method(`${LOG_NAMESPACE} ${message}`, meta)
  } else {
    method(`${LOG_NAMESPACE} ${message}`)
  }
}

const log = (level: LogLevel, message: string, meta?: LogMeta) => {
  const consoleMethod: ConsoleMethod =
    level === 'debug'
      ? console.debug.bind(console)
      : level === 'info'
        ? console.info.bind(console)
        : level === 'warn'
          ? console.warn.bind(console)
          : console.error.bind(console)
  try {
    logWithConsole(consoleMethod, level, message, meta)
  } catch (error) {
    // If structured logging fails, fall back to a minimal console output.
    console.error(`${LOG_NAMESPACE} Failed to emit log`, { level, message, meta, error })
  }
}

const now = () => performance.now()

const formatDuration = (start: number) => Math.round((now() - start) * 100) / 100

export const logger = {
  level: activeLevel,
  debug: (message: string, meta?: LogMeta) => log('debug', message, meta),
  info: (message: string, meta?: LogMeta) => log('info', message, meta),
  warn: (message: string, meta?: LogMeta) => log('warn', message, meta),
  error: (message: string, meta?: LogMeta) => log('error', message, meta),
  async timeAsync<T>(label: string, fn: () => Promise<T>, meta?: LogMeta): Promise<T> {
    const start = now()
    try {
      const result = await fn()
      log('debug', `${label} completed`, { ...meta, durationMs: formatDuration(start) })
      return result
    } catch (error) {
      log('error', `${label} failed`, { ...meta, durationMs: formatDuration(start), error })
      throw error
    }
  },
}
