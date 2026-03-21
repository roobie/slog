import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { slogMiddleware } from '../../src/hono.ts';
import { createLogger } from '../../src/logger.ts';
import type { LogEntry, Transport } from '../../src/types.ts';

function collectTransport() {
  const entries: LogEntry[] = [];
  let flushCount = 0;
  return {
    entries,
    get flushCount() { return flushCount; },
    transport: {
      write(entry: LogEntry) { entries.push(entry); },
      async flush() { flushCount++; },
    } satisfies Transport,
  };
}

describe('slogMiddleware', () => {

  // HONO-01: Import and basic usage
  it('is importable and returns middleware', () => {
    expect(typeof slogMiddleware).toBe('function');
    const col = collectTransport();
    const logger = createLogger({ transports: [col.transport] });
    const mw = slogMiddleware(logger);
    expect(typeof mw).toBe('function');
  });

  // HONO-05: Logger accessible via c.get('logger')
  it('sets logger on Hono context accessible via c.get', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => {
      const log = c.get('logger');
      expect(typeof log.info).toBe('function');
      log.info({ message: 'from handler' });
      return c.text('ok');
    });

    await app.request('/test');

    // The handler logged 'from handler', plus the middleware logs 'request completed'
    const fromHandler = col.entries.find(e => e.message === 'from handler');
    expect(fromHandler).toBeDefined();
  });

  // HONO-02: Per-request context fields
  it('populates requestId, method, path, userAgent on child logger', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok'));

    await app.request('/test', {
      headers: { 'user-agent': 'test-agent' },
    });

    // All entries from this request should have context from withContext()
    expect(col.entries.length).toBeGreaterThan(0);
    const entry = col.entries[0]!;
    expect(typeof entry.context.requestId).toBe('string');
    expect((entry.context.requestId as string).length).toBeGreaterThan(0);
    expect(entry.context.method).toBe('GET');
    expect(entry.context.path).toBe('/test');
    expect(entry.context.userAgent).toBe('test-agent');
  });

  // HONO-02 (requestId from headers): Prefers cf-ray
  it('uses cf-ray header as requestId when present', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok'));

    await app.request('/test', {
      headers: { 'cf-ray': 'abc123' },
    });

    expect(col.entries.length).toBeGreaterThan(0);
    expect(col.entries[0]!.context.requestId).toBe('abc123');
  });

  // HONO-02 (requestId from headers): Falls back to x-request-id
  it('falls back to x-request-id header when cf-ray absent', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok'));

    await app.request('/test', {
      headers: { 'x-request-id': 'req-456' },
    });

    expect(col.entries.length).toBeGreaterThan(0);
    expect(col.entries[0]!.context.requestId).toBe('req-456');
  });

  // HONO-03: Completion log with duration and status
  it('writes completion log with status and integer duration', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok', 200));

    await app.request('/test');

    const completed = col.entries.find(e => e.message === 'request completed');
    expect(completed).toBeDefined();
    expect(completed!.data.status).toBe(200);
    expect(typeof completed!.data.duration).toBe('number');
    expect((completed!.data.duration as number) >= 0).toBe(true);
    expect(Number.isInteger(completed!.data.duration)).toBe(true);
  });

  // HONO-04: Flush is called (non-workerd path)
  it('calls flush on non-workerd runtime (flushCount >= 1 after request)', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok'));

    await app.request('/test');

    expect(col.flushCount).toBeGreaterThanOrEqual(1);
  });

  // Error handling: error logged and rethrown; completion log still fires
  it('logs error and rethrows when handler throws; completion log still fires', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/boom', () => {
      throw new Error('boom');
    });

    // Hono catches unhandled errors and returns 500
    const res = await app.request('/boom');
    expect(res.status).toBe(500);

    const failed = col.entries.find(e => e.message === 'request failed');
    expect(failed).toBeDefined();

    const completed = col.entries.find(e => e.message === 'request completed');
    expect(completed).toBeDefined();

    expect(col.flushCount).toBeGreaterThanOrEqual(1);
  });

  // HONO-03: Duration is integer milliseconds (Math.round applied)
  it('duration is an integer (Math.round applied)', async () => {
    const col = collectTransport();
    const logger = createLogger({ level: 'trace', transports: [col.transport] });

    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => c.text('ok'));

    await app.request('/test');

    const completed = col.entries.find(e => e.message === 'request completed');
    expect(completed).toBeDefined();
    const duration = completed!.data.duration as number;
    // Verify it equals Math.round of itself (i.e., it is already an integer)
    expect(duration).toBe(Math.round(duration));
    expect(duration === Math.floor(duration)).toBe(true);
  });

});
