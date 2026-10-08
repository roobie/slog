import type { LogEntry, LogLevel, Transport } from '../types.ts';
import { formatPrettyEntry, type PrettyTransportConfig } from './pretty.ts';

const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  trace: 'log',
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

/**
 * Creates a transport that writes colorized, human-readable output using level-appropriate console methods.
 * @param config - Optional pretty-print configuration.
 * @returns A Transport that writes human-readable output to the browser console.
 */
export function createBrowserConsoleTransport(config?: PrettyTransportConfig): Transport {
  const maxValueLength = config?.maxValueLength ?? 120;

  return {
    write(entry: LogEntry): void {
      console[CONSOLE_METHOD[entry.level]](formatPrettyEntry(entry, maxValueLength));
    },
    async flush(): Promise<void> {},
  };
}
