import type { LogLevel } from './types.ts';

/** Numeric severity values for each log level, used for level comparisons. */
export const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};
