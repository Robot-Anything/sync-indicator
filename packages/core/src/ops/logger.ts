/**
 * 统一日志：前缀、级别、LOG_LEVEL 过滤
 * 格式：[prefix] ISO_TIMESTAMP LEVEL message
 */

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && LEVELS.includes(env as LogLevel)) return env as LogLevel;
  return 'info';
}

let cachedMinLevel: number = -1;

function shouldLog(level: LogLevel): boolean {
  if (cachedMinLevel < 0) cachedMinLevel = LEVEL_ORDER[getMinLevel()];
  return LEVEL_ORDER[level] >= cachedMinLevel;
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createLogger(prefix: string): Logger {
  const ts = (): string => new Date().toISOString();
  const out = (level: LogLevel, msg: string, ...args: unknown[]): void => {
    if (!shouldLog(level)) return;
    const line = `[${prefix}] ${ts()} ${level.toUpperCase()} ${msg}`;
    if (level === 'error') {
      console.error(line, ...args);
    } else {
      console.log(line, ...args);
    }
  };
  return {
    debug: (msg, ...a) => out('debug', msg, ...a),
    info: (msg, ...a) => out('info', msg, ...a),
    warn: (msg, ...a) => out('warn', msg, ...a),
    error: (msg, ...a) => out('error', msg, ...a),
  };
}
