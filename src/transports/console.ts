import type { LogEntry, LogLevel, Transport } from '../types.ts';

const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  trace: 'log',
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

/**
 * Creates a transport that writes JSON-serialized log entries to the console using level-appropriate methods.
 * @returns A Transport that writes NDJSON to console.
 */
export function createConsoleTransport(): Transport {
  return {
    write(entry: LogEntry): void {
      const method = CONSOLE_METHOD[entry.level];
      const output: Record<string, unknown> = {
        level: entry.level,
        timestamp: entry.timestamp,
        context: entry.context,
        data: entry.data,
      };
      if (entry.message !== undefined) {
        output.message = entry.message;
      }
      console[method](JSON.stringify(output));
    },
    async flush(): Promise<void> {},
  };
}
