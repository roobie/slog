import type { LogEntry, Plugin } from '../types.ts';

function serializeError(val: unknown): { name: string; message: string; stack?: string } {
  if (val instanceof Error) {
    return { name: val.name, message: val.message, stack: val.stack };
  }
  if (typeof val === 'object' && val !== null) {
    return { name: 'Error', message: JSON.stringify(val) };
  }
  return { name: 'Error', message: String(val) };
}

export const errorSerializer: Plugin = {
  name: 'errorSerializer',
  transform(entry: LogEntry): LogEntry {
    const data = { ...entry.data };
    let mutated = false;

    for (const key of ['error', 'err'] as const) {
      if (key in data && data[key] != null) {
        data[key] = serializeError(data[key]);
        mutated = true;
      }
    }

    return mutated ? { ...entry, data } : entry;
  },
};
