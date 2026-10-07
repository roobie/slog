import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/index.ts';
import { createConsoleTransport } from '../../src/transports/console.ts';
import { createHttpBatchTransport } from '../../src/transports/http.ts';
import type { LogEntry, Transport } from '../../src/types.ts';

function collectTransport() {
  const entries: LogEntry[] = [];
  let flushCount = 0;
  return {
    entries,
    get flushCount() {
      return flushCount;
    },
    transport: {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      async flush() {
        flushCount++;
      },
    } satisfies Transport,
  };
}

function failingTransport() {
  const entries: LogEntry[] = [];
  return {
    entries,
    transport: {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      async flush() {
        throw new Error('transport flush failed');
      },
    } satisfies Transport,
  };
}

describe('buffer-then-flush integration', () => {
  it('entries are buffered until flush() is called', async () => {
    const collector = collectTransport();
    const logger = createLogger({ transports: [collector.transport] });

    logger.info({ message: 'one' });
    logger.info({ message: 'two' });
    logger.info({ message: 'three' });

    // Not yet flushed — transport should have nothing
    expect(collector.entries).toHaveLength(0);

    await logger.flush();

    expect(collector.entries).toHaveLength(3);
  });

  it('flush delivers entries in order', async () => {
    const collector = collectTransport();
    const logger = createLogger({ transports: [collector.transport] });

    logger.info({ message: 'first' });
    logger.info({ message: 'second' });
    logger.info({ message: 'third' });

    await logger.flush();

    expect(collector.entries[0]?.message).toBe('first');
    expect(collector.entries[1]?.message).toBe('second');
    expect(collector.entries[2]?.message).toBe('third');
  });

  it('multiple transports receive all entries', async () => {
    const collector1 = collectTransport();
    const collector2 = collectTransport();
    const logger = createLogger({ transports: [collector1.transport, collector2.transport] });

    logger.info({ message: 'alpha' });
    logger.warn({ message: 'beta' });

    await logger.flush();

    expect(collector1.entries).toHaveLength(2);
    expect(collector2.entries).toHaveLength(2);
    expect(collector1.entries[0]?.message).toBe('alpha');
    expect(collector2.entries[0]?.message).toBe('alpha');
  });

  it('flush resolves even when transport.flush() rejects', async () => {
    const failing = failingTransport();
    const logger = createLogger({ transports: [failing.transport] });

    logger.info({ message: 'test' });

    await expect(logger.flush()).resolves.toBeUndefined();
  });

  it('one transport failure does not prevent other transports from receiving entries', async () => {
    const failing = failingTransport();
    const collector = collectTransport();
    const logger = createLogger({ transports: [failing.transport, collector.transport] });

    logger.info({ message: 'msg1' });
    logger.info({ message: 'msg2' });

    await logger.flush();

    // Both transports should have received all entries via write()
    expect(failing.entries).toHaveLength(2);
    expect(collector.entries).toHaveLength(2);
    // The collector transport flush should have been called
    expect(collector.flushCount).toBe(1);
  });

  it('flush with empty buffer does not call transport methods', async () => {
    const collector = collectTransport();
    const logger = createLogger({ transports: [collector.transport] });

    // No logging — flush immediately
    await logger.flush();

    expect(collector.entries).toHaveLength(0);
    expect(collector.flushCount).toBe(0);
  });

  it('buffer is cleared after flush (no double-delivery)', async () => {
    const collector = collectTransport();
    const logger = createLogger({ transports: [collector.transport] });

    logger.info({ message: 'first-flush' });
    logger.info({ message: 'second-flush' });

    await logger.flush();
    expect(collector.entries).toHaveLength(2);

    // Second flush with no new logs — nothing new delivered
    await logger.flush();
    expect(collector.entries).toHaveLength(2);
  });

  it('integration with ConsoleTransport', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const logger = createLogger({ transports: [createConsoleTransport()] });

      logger.info({ message: 'hello' });
      await logger.flush();

      expect(consoleSpy).toHaveBeenCalledOnce();
      const calledWith = consoleSpy.mock.calls[0]?.[0] as string;
      expect(typeof calledWith).toBe('string');
      expect(calledWith).toContain('hello');
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('integration with HttpBatchTransport', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    try {
      const logger = createLogger({
        transports: [createHttpBatchTransport({ url: 'https://example.com/logs' })],
      });

      logger.info({ message: 'http-test' });
      await logger.flush();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('https://example.com/logs');

      // Body should be NDJSON — a single line parseable as JSON
      const body = calledInit.body as string;
      const lines = body.trim().split('\n');
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('message', 'http-test');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
