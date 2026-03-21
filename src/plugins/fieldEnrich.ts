import type { LogEntry, Plugin } from '../types.ts';

/**
 * Creates a plugin that merges static fields into every log entry's data.
 * @param fields - Key-value pairs to add to each entry. Snapshot is taken at creation time.
 * @returns A Plugin that enriches entries with the provided fields.
 */
export function createFieldEnrichPlugin(fields: Record<string, unknown>): Plugin {
  const frozenFields = Object.freeze({ ...fields });
  return {
    name: 'fieldEnrich',
    transform(entry: LogEntry): LogEntry {
      return { ...entry, data: { ...entry.data, ...frozenFields } };
    },
  };
}
