import type { LogEntry, Plugin } from '../types.ts';

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
