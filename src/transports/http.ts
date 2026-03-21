import type { LogEntry, Transport } from '../types.ts';

/** Configuration for the HTTP batch transport. */
export interface HttpBatchTransportConfig {
  /** The URL to POST NDJSON batches to. */
  url: string;
  /** Optional HTTP headers to include in every POST request. */
  headers?: Record<string, string>;
  /** Interval in milliseconds between automatic flushes. When omitted, the transport only flushes on explicit flush() calls. */
  flushInterval?: number; // ms, optional auto-flush timer
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function postWithRetry(url: string, body: string, headers: Record<string, string>): Promise<void> {
  const init: RequestInit = { method: 'POST', headers, body };
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    await sleep(500);
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (retryErr) {
      console.warn('[slog] HttpBatchTransport flush failed after retry:', retryErr);
    }
  }
}

/**
 * Creates a transport that buffers entries in memory and sends them as NDJSON batches via HTTP POST on flush.
 * @param config - HTTP batch transport configuration.
 * @returns A Transport that batches and sends entries over HTTP.
 */
export function createHttpBatchTransport(config: HttpBatchTransportConfig): Transport {
  const buffer: LogEntry[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  const transport: Transport = {
    write(entry: LogEntry): void {
      buffer.push(entry);
    },

    async flush(): Promise<void> {
      if (buffer.length === 0) return;

      // Splice buffer before sending (concurrent flush safety)
      const entries = buffer.splice(0, buffer.length);
      const body = entries.map(e => JSON.stringify(e)).join('\n');
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-ndjson',
        ...config.headers,
      };

      await postWithRetry(config.url, body, headers);
    },
  };

  if (config.flushInterval !== undefined) {
    timer = setInterval(() => {
      void transport.flush();
    }, config.flushInterval);

    process?.on?.('exit', () => {
      if (timer) clearInterval(timer);
    });
  }

  return transport;
}
