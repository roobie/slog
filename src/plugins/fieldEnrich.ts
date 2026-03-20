import type { LogEntry, Plugin } from '../types.ts';

export function createFieldEnrichPlugin(fields: Record<string, unknown>): Plugin {
  const frozenFields = Object.freeze({ ...fields });
  return {
    name: 'fieldEnrich',
    transform(entry: LogEntry): LogEntry {
      return { ...entry, data: { ...entry.data, ...frozenFields } };
    },
  };
}
