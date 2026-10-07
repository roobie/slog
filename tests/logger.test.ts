import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry, Plugin, Transport } from '../src/index.ts';
import { createLogger } from '../src/index.ts';

function collectTransport() {
  const entries: LogEntry[] = [];
  return {
    entries,
    transport: {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      async flush() {},
    } satisfies Transport,
  };
}

describe('log levels', () => {
  it('logger has all 6 log methods', () => {
    const log = createLogger();
    expect(typeof log.trace).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.fatal).toBe('function');
  });

  it('all 6 log methods are callable with an object argument', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'trace', transports: [col.transport] });
    log.trace({ message: 'trace' });
    log.debug({ message: 'debug' });
    log.info({ message: 'info' });
    log.warn({ message: 'warn' });
    log.error({ message: 'error' });
    log.fatal({ message: 'fatal' });
    await log.flush();
    expect(col.entries).toHaveLength(6);
    expect(col.entries.map((e) => e.level)).toEqual([
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]);
  });
});

describe('level gate', () => {
  it('disabled level produces no buffer entry', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'warn', transports: [col.transport] });
    log.trace({ message: 'should be dropped' });
    log.debug({ message: 'should be dropped' });
    log.info({ message: 'should be dropped' });
    await log.flush();
    expect(col.entries).toHaveLength(0);
  });

  it('enabled level produces buffer entries', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'warn', transports: [col.transport] });
    log.warn({ message: 'should appear' });
    log.error({ message: 'should appear' });
    log.fatal({ message: 'should appear' });
    await log.flush();
    expect(col.entries).toHaveLength(3);
  });
});

describe('object-only api', () => {
  it('message field is extracted from data into top-level message', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.info({ message: 'hello', userId: 1 });
    await log.flush();
    expect(col.entries[0]?.message).toBe('hello');
    expect(col.entries[0]?.data).not.toHaveProperty('message');
  });

  it('non-message fields go into data', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.info({ message: 'hello', userId: 1, action: 'login' });
    await log.flush();
    expect(col.entries[0]?.data).toEqual({ userId: 1, action: 'login' });
  });

  it('object without message field has undefined message', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.info({ userId: 42 });
    await log.flush();
    expect(col.entries[0]?.message).toBeUndefined();
    expect(col.entries[0]?.data).toEqual({ userId: 42 });
  });
});

describe('entry schema', () => {
  it('buffered entry has level, timestamp, message, context, data', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    const before = Date.now();
    log.info({ message: 'hello', userId: 1 });
    const after = Date.now();
    await log.flush();
    const entry = col.entries[0];
    expect(entry).toBeDefined();
    expect(entry!.level).toBe('info');
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry!.timestamp).toBeLessThanOrEqual(after);
    expect(entry!.message).toBe('hello');
    expect(entry!.context).toEqual({});
    expect(entry!.data).toEqual({ userId: 1 });
  });

  it('entry does NOT have an error field at the top level', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.error({ message: 'fail', error: new Error('oops') });
    await log.flush();
    const entry = col.entries[0];
    expect(entry).toBeDefined();
    expect('error' in entry!).toBe(false);
    // error lives in data
    expect(entry!.data).toHaveProperty('error');
  });
});

describe('withContext', () => {
  it('child logger entries include merged parent+child context', async () => {
    const col = collectTransport();
    const parent = createLogger({ context: { app: 'slog' }, transports: [col.transport] });
    const child = parent.withContext({ service: 'api' });
    child.info({ message: 'test' });
    await child.flush();
    expect(col.entries[0]?.context).toEqual({ app: 'slog', service: 'api' });
  });

  it('parent context does not appear in child entries when child overrides key', async () => {
    const col = collectTransport();
    const parent = createLogger({ context: { env: 'prod' }, transports: [col.transport] });
    const child = parent.withContext({ env: 'staging' });
    child.info({ message: 'test' });
    await child.flush();
    expect(col.entries[0]?.context).toEqual({ env: 'staging' });
  });

  it('mutating original parent context object after child creation does not affect child', async () => {
    const col = collectTransport();
    const parentContext: Record<string, unknown> = { app: 'slog' };
    const parent = createLogger({ context: parentContext, transports: [col.transport] });
    const child = parent.withContext({ service: 'api' });
    // Mutate after child creation
    parentContext['injected'] = 'evil';
    child.info({ message: 'test' });
    await child.flush();
    expect(col.entries[0]?.context).not.toHaveProperty('injected');
    expect(col.entries[0]?.context).toEqual({ app: 'slog', service: 'api' });
  });

  it('parent log entries are not affected by child context', async () => {
    const col = collectTransport();
    const parent = createLogger({ context: { app: 'slog' }, transports: [col.transport] });
    parent.withContext({ service: 'child' });
    parent.info({ message: 'from parent' });
    await parent.flush();
    expect(col.entries[0]?.context).toEqual({ app: 'slog' });
  });
});

describe('configurable level', () => {
  it('createLogger({ level: warn }) filters out trace, debug, info', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'warn', transports: [col.transport] });
    log.trace({ message: 'no' });
    log.debug({ message: 'no' });
    log.info({ message: 'no' });
    await log.flush();
    expect(col.entries).toHaveLength(0);
  });

  it('createLogger({ level: warn }) passes warn, error, fatal', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'warn', transports: [col.transport] });
    log.warn({ message: 'yes' });
    log.error({ message: 'yes' });
    log.fatal({ message: 'yes' });
    await log.flush();
    expect(col.entries).toHaveLength(3);
  });

  it('createLogger({ level: trace }) passes everything', async () => {
    const col = collectTransport();
    const log = createLogger({ level: 'trace', transports: [col.transport] });
    log.trace({ message: 't' });
    log.debug({ message: 'd' });
    log.info({ message: 'i' });
    log.warn({ message: 'w' });
    log.error({ message: 'e' });
    log.fatal({ message: 'f' });
    await log.flush();
    expect(col.entries).toHaveLength(6);
  });
});

describe('zero-config', () => {
  it('createLogger() with no args returns a working logger', () => {
    expect(() => createLogger()).not.toThrow();
    const log = createLogger();
    expect(typeof log.info).toBe('function');
  });

  it('zero-config logger defaults to info level', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.trace({ message: 'no' });
    log.debug({ message: 'no' });
    log.info({ message: 'yes' });
    await log.flush();
    expect(col.entries).toHaveLength(1);
    expect(col.entries[0]?.level).toBe('info');
  });

  it('zero-config logger buffers entries', async () => {
    const col = collectTransport();
    const log = createLogger({ transports: [col.transport] });
    log.info({ message: 'hello' });
    log.warn({ message: 'world' });
    await log.flush();
    expect(col.entries).toHaveLength(2);
  });
});
