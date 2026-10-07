import { describe, expect, it } from 'vitest';
import { createNdjsonTransport } from '../../src/index.ts';
import type { LogEntry } from '../../src/types.ts';

function makeEntry(message: string): LogEntry {
  return {
    level: 'info',
    timestamp: 1711008225123,
    message,
    context: {},
    data: {},
  };
}

describe('createNdjsonTransport', () => {
  it('writes buffered entries as newline-terminated JSON records on flush', async () => {
    const output: string[] = [];
    const transport = createNdjsonTransport((line) => output.push(line));

    transport.write(makeEntry('first'));
    transport.write(makeEntry('second'));
    expect(output).toEqual([]);

    await transport.flush();

    expect(output).toHaveLength(2);
    expect(output.every((line) => line.endsWith('\n'))).toBe(true);
    expect(output.map((line) => JSON.parse(line).message)).toEqual(['first', 'second']);
  });

  it('awaits async writes and preserves order across concurrent flush calls', async () => {
    const output: string[] = [];
    let releaseFirstWrite!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const transport = createNdjsonTransport(async (line) => {
      output.push(line);
      if (output.length === 1) await firstWriteGate;
    });

    transport.write(makeEntry('first'));
    transport.write(makeEntry('second'));
    const firstFlush = transport.flush();
    const secondFlush = transport.flush();

    expect(output).toHaveLength(1);
    releaseFirstWrite();
    await Promise.all([firstFlush, secondFlush]);

    expect(output.map((line) => JSON.parse(line).message)).toEqual(['first', 'second']);
  });

  it('retains the failed record and following records for the next flush', async () => {
    const output: string[] = [];
    let failNextWrite = true;
    const transport = createNdjsonTransport((line) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('write failed');
      }
      output.push(line);
    });

    transport.write(makeEntry('first'));
    transport.write(makeEntry('second'));

    await expect(transport.flush()).rejects.toThrow('write failed');
    expect(output).toEqual([]);

    await transport.flush();
    expect(output.map((line) => JSON.parse(line).message)).toEqual(['first', 'second']);
  });
});
