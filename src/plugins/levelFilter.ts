import { LOG_LEVELS } from '../levels.ts';
import type { LogEntry, LogLevel, Plugin } from '../types.ts';

/**
 * Creates a plugin that drops log entries below the specified minimum severity level.
 * @param minLevel - Minimum log level to allow through.
 * @returns A Plugin that filters entries below minLevel.
 */
export function createLevelFilterPlugin(minLevel: LogLevel): Plugin {
  const threshold = LOG_LEVELS[minLevel];
  return {
    name: 'levelFilter',
    transform(entry: LogEntry): LogEntry | null {
      return LOG_LEVELS[entry.level] >= threshold ? entry : null;
    },
  };
}
