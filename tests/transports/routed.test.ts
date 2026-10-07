import { describe, expect, it } from 'vitest';
import {
  atOrAboveLevel,
  belowLevel,
  createRoutedTransport,
  exactLevel,
} from '../../src/transports/routed.ts';
import type { LogEntry, LogLevel, Transport } from '../../src/types.ts';

function makeEntry(level: LogLevel): LogEntry {
  return { level, timestamp: Date.now(), context: {}, data: {} };
}

function mockTransport() {
  const entries: LogEntry[] = [];
  let flushed = false;
  return {
    entries,
    get flushed() {
      return flushed;
    },
    transport: {
      write(entry: LogEntry) {
        entries.push(entry);
      },
      async flush() {
        flushed = true;
      },
    } satisfies Transport,
  };
}

describe('createRoutedTransport', () => {
  it('routes entry to transport when predicate returns true', () => {
    const mock = mockTransport();
    const routed = createRoutedTransport([{ predicate: () => true, transport: mock.transport }]);
    const entry = makeEntry('info');
    routed.write(entry);
    expect(mock.entries).toHaveLength(1);
    expect(mock.entries[0]).toBe(entry);
  });

  it('does not route entry when predicate returns false', () => {
    const mock = mockTransport();
    const routed = createRoutedTransport([{ predicate: () => false, transport: mock.transport }]);
    routed.write(makeEntry('info'));
    expect(mock.entries).toHaveLength(0);
  });

  it('entry matching multiple routes goes to all', () => {
    const mock1 = mockTransport();
    const mock2 = mockTransport();
    const routed = createRoutedTransport([
      { predicate: () => true, transport: mock1.transport },
      { predicate: () => true, transport: mock2.transport },
    ]);
    const entry = makeEntry('warn');
    routed.write(entry);
    expect(mock1.entries).toHaveLength(1);
    expect(mock2.entries).toHaveLength(1);
  });

  it('entry matching no routes is silently dropped', () => {
    const mock = mockTransport();
    const routed = createRoutedTransport([{ predicate: () => false, transport: mock.transport }]);
    expect(() => routed.write(makeEntry('info'))).not.toThrow();
    expect(mock.entries).toHaveLength(0);
  });

  it('flush calls flush on all route transports', async () => {
    const mock1 = mockTransport();
    const mock2 = mockTransport();
    const routed = createRoutedTransport([
      { predicate: () => true, transport: mock1.transport },
      { predicate: () => false, transport: mock2.transport },
    ]);
    routed.write(makeEntry('info')); // only mock1 gets the write
    await routed.flush();
    expect(mock1.flushed).toBe(true);
    expect(mock2.flushed).toBe(true); // flush all unconditionally
  });

  it('flush uses allSettled — one failure does not block others', async () => {
    const failing = {
      write(_: LogEntry) {},
      async flush() {
        throw new Error('flush error');
      },
    } satisfies Transport;
    const mock = mockTransport();
    const routed = createRoutedTransport([
      { predicate: () => true, transport: failing },
      { predicate: () => true, transport: mock.transport },
    ]);
    routed.write(makeEntry('info'));
    await expect(routed.flush()).resolves.toBeUndefined();
    expect(mock.flushed).toBe(true);
  });
});

describe('atOrAboveLevel', () => {
  it('filters correctly for warn threshold', () => {
    const pred = atOrAboveLevel('warn');
    expect(pred(makeEntry('trace'))).toBe(false);
    expect(pred(makeEntry('debug'))).toBe(false);
    expect(pred(makeEntry('info'))).toBe(false);
    expect(pred(makeEntry('warn'))).toBe(true);
    expect(pred(makeEntry('error'))).toBe(true);
    expect(pred(makeEntry('fatal'))).toBe(true);
  });
});

describe('exactLevel', () => {
  it('matches only error', () => {
    const pred = exactLevel('error');
    expect(pred(makeEntry('trace'))).toBe(false);
    expect(pred(makeEntry('debug'))).toBe(false);
    expect(pred(makeEntry('info'))).toBe(false);
    expect(pred(makeEntry('warn'))).toBe(false);
    expect(pred(makeEntry('error'))).toBe(true);
    expect(pred(makeEntry('fatal'))).toBe(false);
  });
});

describe('belowLevel', () => {
  it('filters correctly for warn threshold', () => {
    const pred = belowLevel('warn');
    expect(pred(makeEntry('trace'))).toBe(true);
    expect(pred(makeEntry('debug'))).toBe(true);
    expect(pred(makeEntry('info'))).toBe(true);
    expect(pred(makeEntry('warn'))).toBe(false);
    expect(pred(makeEntry('error'))).toBe(false);
    expect(pred(makeEntry('fatal'))).toBe(false);
  });
});
