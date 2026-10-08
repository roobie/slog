import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrettyTransport } from '../../src/transports/pretty.ts';
import type { LogEntry, LogLevel } from '../../src/types.ts';

function makeEntry(level: LogLevel): LogEntry {
  return {
    level,
    timestamp: 1711008225123,
    message: 'test message',
    context: {},
    data: {},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPrettyTransport', () => {
  it('writes every level to stderr via console.error', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const transport = createPrettyTransport();

    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      transport.write(makeEntry(level));
    }

    expect(stderr).toHaveBeenCalledTimes(6);
    expect(stdout).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('formats entries as human-readable output', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = createPrettyTransport();

    transport.write({ ...makeEntry('info'), data: { requestId: 'abc123' } });

    const output = stderr.mock.calls[0][0] as string;
    expect(output).toContain('INFO ');
    expect(output).toContain('requestId=abc123');
  });

  it('flush resolves without error', async () => {
    await expect(createPrettyTransport().flush()).resolves.toBeUndefined();
  });
});
