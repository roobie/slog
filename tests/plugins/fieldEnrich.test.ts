import { describe, it, expect } from 'vitest';
import { createFieldEnrichPlugin } from '../../src/plugins/fieldEnrich.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(data: Record<string, unknown>): LogEntry {
  return { level: 'info', timestamp: 1000, context: {}, data };
}

describe('createFieldEnrichPlugin', () => {
  it('adds static fields to entry data', () => {
    const plugin = createFieldEnrichPlugin({ service: 'api' });
    const entry = makeEntry({ foo: 1 });
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    expect(result!.data.service).toBe('api');
    expect(result!.data.foo).toBe(1);
  });

  it('enrichment fields override existing data keys', () => {
    const plugin = createFieldEnrichPlugin({ foo: 'enriched' });
    const entry = makeEntry({ foo: 'original' });
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    expect(result!.data.foo).toBe('enriched');
  });

  it('does not mutate original entry', () => {
    const plugin = createFieldEnrichPlugin({ service: 'api' });
    const entry = makeEntry({ foo: 1 });
    plugin.transform(entry);
    expect(entry.data.service).toBeUndefined();
    expect(entry.data.foo).toBe(1);
  });

  it('frozen fields — mutation after creation has no effect', () => {
    const fields: Record<string, unknown> = { service: 'api' };
    const plugin = createFieldEnrichPlugin(fields);
    // mutate the original fields object after plugin creation
    fields['service'] = 'mutated';
    const entry = makeEntry({});
    const result = plugin.transform(entry);
    expect(result).not.toBeNull();
    // enrichment should still use original value
    expect(result!.data.service).toBe('api');
  });

  it('plugin has name "fieldEnrich"', () => {
    const plugin = createFieldEnrichPlugin({});
    expect(plugin.name).toBe('fieldEnrich');
  });
});
