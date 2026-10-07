import type { LogEntry, Transport } from '../types.ts';

/**
 * Creates a transport that buffers newline-delimited JSON records and writes them on flush.
 * @param writeLine - Writes one record, optionally asynchronously.
 * @returns A Transport that writes NDJSON records to the provided destination.
 */
export function createNdjsonTransport(
  writeLine: (line: string) => void | Promise<void>,
): Transport {
  const buffer: string[] = [];
  let flushing: Promise<void> | undefined;

  async function flushBuffer(): Promise<void> {
    while (true) {
      const line = buffer[0];
      if (line === undefined) return;
      await writeLine(line);
      buffer.shift();
    }
  }

  return {
    write(entry: LogEntry): void {
      const output: Record<string, unknown> = {
        level: entry.level,
        timestamp: entry.timestamp,
        context: entry.context,
        data: entry.data,
      };
      if (entry.message !== undefined) {
        output.message = entry.message;
      }
      buffer.push(`${JSON.stringify(output)}\n`);
    },
    flush(): Promise<void> {
      if (!flushing) {
        flushing = flushBuffer().finally(() => {
          flushing = undefined;
        });
      }
      return flushing;
    },
  };
}
