import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LogEntry } from '../../src/types.ts';
import { createPrettyTransport } from '../../src/transports/pretty.ts';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    timestamp: 1711008225123,  // 2024-03-21T10:23:45.123Z
    message: 'test message',
    context: {},
    data: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPrettyTransport', () => {
  it('returns an object with write and flush methods', () => {
    const transport = createPrettyTransport();
    expect(typeof transport.write).toBe('function');
    expect(typeof transport.flush).toBe('function');
  });

  it('info entry output contains ISO timestamp string', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'info' }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('info entry output contains ANSI escape sequence', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'info' }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('\x1b[');
  });

  it('info entry output contains "INFO " (uppercased, 5-char padded)', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'info' }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('INFO ');
  });

  it('warn entry calls console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'warn' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('trace entry calls console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'trace' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('debug entry calls console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'debug' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('error entry calls console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'error' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fatal entry calls console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ level: 'fatal' }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('entry with numeric data outputs bare key=value pairs', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ data: { userId: 123, action: 'login' } }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('userId=123');
    expect(arg).toContain('action=login');
  });

  it('string value with space is quoted: key="value with spaces"', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ data: { query: 'hello world' } }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('query="hello world"');
  });

  it('object value is JSON-stringified: key={"a":1}', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ data: { obj: { a: 1 } } }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('obj={"a":1}');
  });

  it('entry with context and data outputs both fields', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({
      context: { requestId: 'abc' },
      data: { status: 200 },
    }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('requestId=abc');
    expect(arg).toContain('status=200');
  });

  it('entry with no message shows fields without message text', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    transport.write(makeEntry({ message: undefined, data: { key: 'value' } }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('key=value');
    expect(arg).not.toContain('undefined');
  });

  it('flush() resolves without error', async () => {
    const transport = createPrettyTransport();
    await expect(transport.flush()).resolves.toBeUndefined();
  });

  it('long string value (200 chars) gets truncated with "..." appended', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport();
    const longStr = 'a'.repeat(200);
    transport.write(makeEntry({ data: { val: longStr } }));
    const arg = spy.mock.calls[0][0] as string;
    expect(arg).toContain('...');
    expect(arg).not.toContain('a'.repeat(200));
  });

  it('createPrettyTransport({ maxValueLength: 20 }) truncates at 20 chars', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = createPrettyTransport({ maxValueLength: 20 });
    const longStr = 'b'.repeat(50);
    transport.write(makeEntry({ data: { val: longStr } }));
    const arg = spy.mock.calls[0][0] as string;
    // Should contain truncated value ending with ...
    expect(arg).toContain('...');
    // Should not contain more than 20 'b' chars in a row
    expect(arg).not.toContain('b'.repeat(21));
  });
});
