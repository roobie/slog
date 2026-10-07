import { describe, expect, it } from 'vitest';
import { createLevelFilterPlugin } from '../../src/plugins/levelFilter.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(level: LogEntry['level']): LogEntry {
  return { level, timestamp: 1000, context: {}, data: {} };
}

describe('createLevelFilterPlugin', () => {
  it('drops entries below threshold', () => {
    const plugin = createLevelFilterPlugin('warn');
    expect(plugin.transform(makeEntry('trace'))).toBeNull();
    expect(plugin.transform(makeEntry('debug'))).toBeNull();
    expect(plugin.transform(makeEntry('info'))).toBeNull();
  });

  it('passes entries at or above threshold', () => {
    const plugin = createLevelFilterPlugin('warn');
    const warnEntry = makeEntry('warn');
    const errorEntry = makeEntry('error');
    const fatalEntry = makeEntry('fatal');
    expect(plugin.transform(warnEntry)).toBe(warnEntry);
    expect(plugin.transform(errorEntry)).toBe(errorEntry);
    expect(plugin.transform(fatalEntry)).toBe(fatalEntry);
  });

  it('trace threshold passes everything', () => {
    const plugin = createLevelFilterPlugin('trace');
    for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
      const entry = makeEntry(level);
      expect(plugin.transform(entry)).toBe(entry);
    }
  });

  it('fatal threshold drops everything except fatal', () => {
    const plugin = createLevelFilterPlugin('fatal');
    expect(plugin.transform(makeEntry('trace'))).toBeNull();
    expect(plugin.transform(makeEntry('debug'))).toBeNull();
    expect(plugin.transform(makeEntry('info'))).toBeNull();
    expect(plugin.transform(makeEntry('warn'))).toBeNull();
    expect(plugin.transform(makeEntry('error'))).toBeNull();
    const fatal = makeEntry('fatal');
    expect(plugin.transform(fatal)).toBe(fatal);
  });

  it('plugin has name "levelFilter"', () => {
    const plugin = createLevelFilterPlugin('info');
    expect(plugin.name).toBe('levelFilter');
  });
});
