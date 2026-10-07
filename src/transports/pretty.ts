import type { LogEntry, LogLevel, Transport } from '../types.ts';

const LEVEL_COLOR: Record<LogLevel, string> = {
  trace: '\x1b[2m', // dim
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m', // magenta
};

const RESET = '\x1b[0m';

/** Configuration for the pretty-print transport. */
export interface PrettyTransportConfig {
  /** Maximum number of characters to render for any single field value before truncating with `...`. Defaults to 120. */
  maxValueLength?: number;
}

function formatValue(val: unknown, maxLen: number): string {
  if (typeof val === 'string') {
    const truncated = val.length > maxLen ? `${val.slice(0, maxLen)}...` : val;
    // Quote if contains whitespace, double-quotes, or equals sign
    if (/[\s"=]/.test(truncated)) {
      return `"${truncated}"`;
    }
    return truncated;
  }
  if (typeof val === 'object') {
    const str = JSON.stringify(val);
    return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
  }
  return String(val);
}

function formatFields(obj: Record<string, unknown>, maxLen: number): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${formatValue(v, maxLen)}`)
    .join(' ');
}

export function formatPrettyEntry(entry: LogEntry, maxValueLength: number): string {
  const isoTimestamp = new Date(entry.timestamp).toISOString();
  const coloredLevel = `${LEVEL_COLOR[entry.level]}${entry.level.toUpperCase().padEnd(5)}${RESET}`;

  const allFields: Record<string, unknown> = { ...entry.context, ...entry.data };
  const fieldStr =
    Object.keys(allFields).length > 0 ? ` ${formatFields(allFields, maxValueLength)}` : '';

  const messagePart = entry.message !== undefined ? ` ${entry.message}` : '';

  return `${isoTimestamp} [${coloredLevel}]${messagePart}${fieldStr}`;
}

/**
 * Creates a transport that writes colorized, human-readable log output to stderr.
 * @param config - Optional pretty-print configuration.
 * @returns A Transport that writes human-readable output to stderr.
 */
export function createPrettyTransport(config?: PrettyTransportConfig): Transport {
  const maxValueLength = config?.maxValueLength ?? 120;

  return {
    write(entry: LogEntry): void {
      console.error(formatPrettyEntry(entry, maxValueLength));
    },
    async flush(): Promise<void> {},
  };
}
