import type { LogEntry, LogLevel, Transport } from '../types.ts';
import { LOG_LEVELS } from '../levels.ts';

export interface TransportRoute {
  predicate: (entry: LogEntry) => boolean;
  transport: Transport;
}

export function createRoutedTransport(routes: TransportRoute[]): Transport {
  return {
    write(entry: LogEntry): void {
      for (const { predicate, transport } of routes) {
        if (predicate(entry)) {
          transport.write(entry);
        }
      }
    },
    async flush(): Promise<void> {
      await Promise.allSettled(routes.map(r => r.transport.flush()));
    },
  };
}

export function atOrAboveLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const min = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] >= min;
}

export function exactLevel(level: LogLevel): (entry: LogEntry) => boolean {
  return (entry) => entry.level === level;
}

export function belowLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const threshold = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] < threshold;
}
