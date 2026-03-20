import { describe, it, expect, vi } from 'vitest';
import { createLogger } from '../../src/index.ts';
import type { LogEntry, Plugin, Transport } from '../../src/index.ts';

function collectTransport() {
  const entries: LogEntry[] = [];
  return {
    entries,
    transport: {
      write(entry: LogEntry) { entries.push(entry); },
      async flush() {},
    } satisfies Transport,
  };
}

function makePlugin(name: string, transform: (e: LogEntry) => LogEntry | null): Plugin {
  return { name, transform };
}

describe('plugin pipeline', () => {
  it('plugins execute in FIFO (array) order', async () => {
    const order: string[] = [];
    const pluginA = makePlugin('A', (e) => { order.push('A'); return e; });
    const pluginB = makePlugin('B', (e) => { order.push('B'); return e; });
    const col = collectTransport();
    const log = createLogger({ plugins: [pluginA, pluginB], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(order).toEqual(['A', 'B']);
  });

  it('plugin can modify entry fields and downstream plugin sees the changes', async () => {
    const enricher = makePlugin('enricher', (e) => ({
      ...e,
      data: { ...e.data, enriched: true },
    }));
    const downstream: LogEntry[] = [];
    const checker = makePlugin('checker', (e) => {
      downstream.push(e);
      return e;
    });
    const col = collectTransport();
    const log = createLogger({ plugins: [enricher, checker], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(downstream[0]?.data).toHaveProperty('enriched', true);
    expect(col.entries[0]?.data).toHaveProperty('enriched', true);
  });
});

describe('null drops', () => {
  it('plugin returning null drops the entry — buffer stays empty', async () => {
    const dropper = makePlugin('dropper', () => null);
    const col = collectTransport();
    const log = createLogger({ plugins: [dropper], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(col.entries).toHaveLength(0);
  });

  it('entry dropped by null does not reach downstream plugins', async () => {
    const downstream = vi.fn((e: LogEntry) => e);
    const dropper = makePlugin('dropper', () => null);
    const checker = makePlugin('checker', downstream);
    const col = collectTransport();
    const log = createLogger({ plugins: [dropper, checker], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(downstream).not.toHaveBeenCalled();
    expect(col.entries).toHaveLength(0);
  });

  it('plugin returning null stops the pipeline — later plugins do not run', async () => {
    const order: string[] = [];
    const pluginA = makePlugin('A', (e) => { order.push('A'); return e; });
    const pluginNull = makePlugin('null', () => { order.push('null'); return null; });
    const pluginC = makePlugin('C', (e) => { order.push('C'); return e; });
    const col = collectTransport();
    const log = createLogger({ plugins: [pluginA, pluginNull, pluginC], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(order).toEqual(['A', 'null']);
    expect(col.entries).toHaveLength(0);
  });
});

describe('plugin error handling', () => {
  it('throwing plugin triggers console.warn with plugin name', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thrower = makePlugin('badPlugin', () => { throw new Error('oops'); });
    const col = collectTransport();
    const log = createLogger({ plugins: [thrower], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    expect(warnSpy).toHaveBeenCalledOnce();
    const warnCall = warnSpy.mock.calls[0];
    expect(warnCall?.[0]).toContain('badPlugin');
    warnSpy.mockRestore();
  });

  it('throwing plugin passes original entry to next plugin', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalEntry: LogEntry[] = [];
    const thrower = makePlugin('thrower', () => { throw new Error('fail'); });
    const downstream = makePlugin('downstream', (e) => { originalEntry.push(e); return e; });
    const col = collectTransport();
    const log = createLogger({ plugins: [thrower, downstream], transports: [col.transport] });
    log.info({ message: 'test' });
    await log.flush();
    // downstream received the entry (original, before the thrower)
    expect(originalEntry).toHaveLength(1);
    expect(originalEntry[0]?.message).toBe('test');
    // entry also ended up in the buffer
    expect(col.entries).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('logging never crashes even when plugin throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const thrower = makePlugin('bad', () => { throw new Error('kaboom'); });
    const col = collectTransport();
    const log = createLogger({ plugins: [thrower], transports: [col.transport] });
    expect(() => log.info({ message: 'test' })).not.toThrow();
    await log.flush();
    vi.restoreAllMocks();
  });
});
