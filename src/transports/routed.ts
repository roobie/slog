import { LOG_LEVELS } from '../levels.ts';
import type { LogEntry, LogLevel, Transport } from '../types.ts';

/** A predicate-transport pair for routing log entries. */
export interface TransportRoute {
  /** Function that returns true if the entry should be sent to this route's transport. */
  predicate: (entry: LogEntry) => boolean;
  /** The transport to write matching entries to. */
  transport: Transport;
}

/**
 * Creates a transport that routes each entry to transports whose predicates match.
 * @param routes - Array of predicate-transport pairs.
 * @returns A Transport that routes entries by predicate.
 */
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
      await Promise.allSettled(routes.map((r) => r.transport.flush()));
    },
  };
}

/**
 * Creates a predicate that matches entries at or above the given severity level.
 * @param level - The minimum severity level to match.
 * @returns A predicate function that returns true for entries at or above the given level.
 */
export function atOrAboveLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const min = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] >= min;
}

/**
 * Creates a predicate that matches entries at exactly the given severity level.
 * @param level - The exact severity level to match.
 * @returns A predicate function that returns true for entries at exactly the given level.
 */
export function exactLevel(level: LogLevel): (entry: LogEntry) => boolean {
  return (entry) => entry.level === level;
}

/**
 * Creates a predicate that matches entries below the given severity level.
 * @param level - The exclusive upper bound severity level.
 * @returns A predicate function that returns true for entries below the given level.
 */
export function belowLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const threshold = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] < threshold;
}
