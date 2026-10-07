import type { LogEntry, LogLevel, Transport } from '../types.ts';

/**
 * Creates a transport that buffers newline-terminated JSON records and writes them to `stderr` on flush.
 * @param writeStdErr - Writes one record, optionally asynchronously.
 * @returns A Transport that writes NDJSON to `stderr`.
 */
export function createStdIoTransport(
  writeStdErr: (msg: string) => void | Promise<void>,
): Transport {
  const buffer: string[] = [];
  let flushing: Promise<void> | undefined;

  async function flushBuffer(): Promise<void> {
    while (true) {
      const line = buffer[0];
      if (line === undefined) return;
      await writeStdErr(line);
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
