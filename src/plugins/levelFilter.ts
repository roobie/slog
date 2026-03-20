import type { LogEntry, Plugin } from '../types.ts';
import type { LogLevel } from '../types.ts';
import { LOG_LEVELS } from '../levels.ts';

export function createLevelFilterPlugin(minLevel: LogLevel): Plugin {
  const threshold = LOG_LEVELS[minLevel];
  return {
    name: 'levelFilter',
    transform(entry: LogEntry): LogEntry | null {
      return LOG_LEVELS[entry.level] >= threshold ? entry : null;
    },
  };
}
