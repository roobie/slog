import { describe, expect, it } from 'vitest';
import { errorSerializer } from '../../src/plugins/errorSerializer.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(data: Record<string, unknown>): LogEntry {
  return { level: 'error', timestamp: 1000, context: {}, data };
}

describe('errorSerializer', () => {
  it('serializes Error instance on data.error', () => {
    const entry = makeEntry({ error: new Error('test') });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.error as { name: string; message: string; stack: string }).name).toBe(
      'Error',
    );
    expect((result!.data.error as { name: string; message: string; stack: string }).message).toBe(
      'test',
    );
    expect((result!.data.error as { name: string; message: string; stack: string }).stack).toEqual(
      expect.any(String),
    );
  });

  it('serializes Error instance on data.err', () => {
    const entry = makeEntry({ err: new Error('err test') });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.err as { name: string; message: string; stack: string }).name).toBe(
      'Error',
    );
    expect((result!.data.err as { name: string; message: string; stack: string }).message).toBe(
      'err test',
    );
    expect((result!.data.err as { name: string; message: string; stack: string }).stack).toEqual(
      expect.any(String),
    );
  });

  it('serializes TypeError with correct name', () => {
    const entry = makeEntry({ error: new TypeError('bad') });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.error as { name: string; message: string }).name).toBe('TypeError');
    expect((result!.data.error as { name: string; message: string }).message).toBe('bad');
  });

  it('serializes plain object as JSON string', () => {
    const entry = makeEntry({ error: { code: 42 } });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.error as { name: string; message: string }).name).toBe('Error');
    expect((result!.data.error as { name: string; message: string }).message).toContain('code');
  });

  it('serializes primitive as string', () => {
    const entry = makeEntry({ error: 'oops' });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.error as { name: string; message: string }).name).toBe('Error');
    expect((result!.data.error as { name: string; message: string }).message).toBe('oops');
  });

  it('passes through entry with no error keys unchanged (same reference)', () => {
    const entry = makeEntry({ foo: 1 });
    const result = errorSerializer.transform(entry);
    expect(result).toBe(entry);
  });

  it('handles both error and err present', () => {
    const entry = makeEntry({ error: new Error('e1'), err: new Error('e2') });
    const result = errorSerializer.transform(entry);
    expect(result).not.toBeNull();
    expect((result!.data.error as { message: string }).message).toBe('e1');
    expect((result!.data.err as { message: string }).message).toBe('e2');
  });
});
