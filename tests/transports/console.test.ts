import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsoleTransport } from '../../src/transports/console.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    timestamp: 1711008225123,
    message: 'test message',
    context: {},
    data: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createConsoleTransport', () => {
  it('returns an object with write and flush methods', () => {
    const transport = createConsoleTransport();
    expect(typeof transport.write).toBe('function');
    expect(typeof transport.flush).toBe('function');
  });

  it('trace level calls console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'trace' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('debug level calls console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'debug' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('info level calls console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'info' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('warn level calls console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'warn' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('error level calls console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'error' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fatal level calls console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'fatal' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('output passed to console method is valid JSON', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'info' }));
    const arg = spy.mock.calls[0][0] as string;
    expect(() => JSON.parse(arg)).not.toThrow();
  });

  it('output is single-line JSON (no newlines)', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'info' }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).not.toContain('\n');
  });

  it('entry with undefined message does not have "message" key in JSON output', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(makeEntry({ level: 'info', message: undefined }));
    const arg = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(arg);
    expect(Object.hasOwn(parsed, 'message')).toBe(false);
  });

  it('entry with context and data includes both in JSON output', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createConsoleTransport();
    transport.write(
      makeEntry({
        level: 'info',
        context: { requestId: 'abc' },
        data: { userId: 123 },
      }),
    );
    const arg = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed.context).toEqual({ requestId: 'abc' });
    expect(parsed.data).toEqual({ userId: 123 });
  });

  it('flush() resolves without error', async () => {
    const transport = createConsoleTransport();
    await expect(transport.flush()).resolves.toBeUndefined();
  });
});
