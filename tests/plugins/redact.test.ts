import { describe, expect, it } from 'vitest';
import { createRedactPlugin } from '../../src/plugins/redact.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(data: Record<string, unknown>): LogEntry {
  return { level: 'info', timestamp: 1000, context: {}, data };
}

describe('createRedactPlugin', () => {
  it('redacts string-matched keys', () => {
    const plugin = createRedactPlugin(['password']);
    const entry = makeEntry({ password: 'secret123', user: 'jani' });
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    expect(result!.data.password).toBe('[REDACTED]');
    expect(result!.data.user).toBe('jani');
  });

  it('redacts regex-matched keys', () => {
    const plugin = createRedactPlugin([/token/i]);
    const entry = makeEntry({ authToken: 'abc', user: 'jani' });
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    expect(result!.data.authToken).toBe('[REDACTED]');
    expect(result!.data.user).toBe('jani');
  });

  it('handles mixed string and regex patterns', () => {
    const plugin = createRedactPlugin(['password', /secret/i]);
    const entry = makeEntry({ password: 'pw', mySecret: 'shh', user: 'jani' });
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    expect(result!.data.password).toBe('[REDACTED]');
    expect(result!.data.mySecret).toBe('[REDACTED]');
    expect(result!.data.user).toBe('jani');
  });

  it('does not mutate original entry', () => {
    const plugin = createRedactPlugin(['password']);
    const entry = makeEntry({ password: 'secret123' });
    plugin.transform(entry);
    expect(entry.data.password).toBe('secret123');
  });

  it('returns same reference when no keys match', () => {
    const plugin = createRedactPlugin(['password']);
    const entry = makeEntry({ foo: 1 });
    const result = plugin.transform(entry);
    expect(result).toBe(entry);
  });

  it('plugin has name "redact"', () => {
    const plugin = createRedactPlugin([]);
    expect(plugin.name).toBe('redact');
  });
});
