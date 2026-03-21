import type { LogEntry, Plugin } from '../types.ts';

/**
 * Creates a plugin that replaces values of matching data keys with `[REDACTED]`.
 * @param patterns - Array of exact key strings or RegExp patterns to match against data field keys.
 * @returns A Plugin that redacts matched fields.
 */
export function createRedactPlugin(patterns: Array<string | RegExp>): Plugin {
  return {
    name: 'redact',
    transform(entry: LogEntry): LogEntry {
      const data = { ...entry.data };
      let mutated = false;

      for (const key of Object.keys(data)) {
        const shouldRedact = patterns.some((p) =>
          typeof p === 'string' ? p === key : p.test(key)
        );
        if (shouldRedact) {
          data[key] = '[REDACTED]';
          mutated = true;
        }
      }

      return mutated ? { ...entry, data } : entry;
    },
  };
}
