import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpBatchTransport } from '../../src/transports/http.ts';
import type { LogEntry, LogLevel } from '../../src/types.ts';

function makeEntry(level: LogLevel = 'info'): LogEntry {
  return { level, timestamp: Date.now(), message: 'test', context: {}, data: {} };
}

function makeOkResponse() {
  return Promise.resolve({ ok: true, status: 200 } as Response);
}

describe('createHttpBatchTransport', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => makeOkResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('flush with no entries does not call fetch', async () => {
    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    await transport.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flush sends NDJSON body to configured url', async () => {
    const transport = createHttpBatchTransport({
      url: 'http://example.com/logs',
      headers: { 'X-Custom': 'value' },
    });
    const entry1 = makeEntry('info');
    const entry2 = makeEntry('warn');
    transport.write(entry1);
    transport.write(entry2);

    await transport.flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://example.com/logs');
    expect(init.method).toBe('POST');
    const expectedBody = `${JSON.stringify(entry1)}\n${JSON.stringify(entry2)}`;
    expect(init.body).toBe(expectedBody);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-ndjson');
    expect((init.headers as Record<string, string>)['X-Custom']).toBe('value');
  });

  it('flush clears the buffer', async () => {
    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    transport.write(makeEntry());
    transport.write(makeEntry());
    await transport.flush();
    // Second flush — buffer should be empty
    await transport.flush();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries once on network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network error'))
      .mockImplementationOnce(() => makeOkResponse());

    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    transport.write(makeEntry());

    const flushPromise = transport.flush();
    // Advance past the 500ms retry delay
    await vi.runAllTimersAsync();
    await flushPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on non-2xx response', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockImplementationOnce(() => makeOkResponse());

    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    transport.write(makeEntry());

    const flushPromise = transport.flush();
    await vi.runAllTimersAsync();
    await flushPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logs warning and does not throw after second failure', async () => {
    fetchMock.mockRejectedValue(new Error('always fails'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    transport.write(makeEntry());

    const flushPromise = transport.flush();
    await vi.runAllTimersAsync();
    await expect(flushPromise).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('entries are not re-sent after failed flush', async () => {
    // First call: reject, second: reject (failed flush), third: success (second flush)
    fetchMock
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockImplementationOnce(() => makeOkResponse());

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const transport = createHttpBatchTransport({ url: 'http://example.com/logs' });
    const entry1 = makeEntry('info');
    transport.write(entry1);

    const firstFlush = transport.flush();
    await vi.runAllTimersAsync();
    await firstFlush; // fails, but doesn't throw

    const entry2 = makeEntry('warn');
    transport.write(entry2);

    const secondFlush = transport.flush();
    await vi.runAllTimersAsync();
    await secondFlush;

    // Third fetch call body should contain only entry2
    const [, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify(entry2));
    warnSpy.mockRestore();
  });

  it('auto-timer calls flush at configured interval', async () => {
    const transport = createHttpBatchTransport({
      url: 'http://example.com/logs',
      flushInterval: 1000,
    });
    transport.write(makeEntry());

    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
