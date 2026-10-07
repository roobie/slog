import { LOG_LEVELS } from './levels.ts';
import type { LogEntry, Logger, LoggerOptions, LogLevel, Plugin, Transport } from './types.ts';

class LoggerImpl implements Logger {
  private readonly minLevel: LogLevel;
  private readonly plugins: Plugin[];
  private readonly transports: Transport[];
  private readonly context: Record<string, unknown>;
  private readonly buffer: LogEntry[];

  constructor(options?: LoggerOptions) {
    this.minLevel = options?.level ?? 'info';
    this.plugins = options?.plugins ?? [];
    this.transports = options?.transports ?? [];
    this.context =
      options?.context != null
        ? Object.freeze(Object.assign({}, options.context))
        : Object.freeze({});
    this.buffer = [];
  }

  trace(data: object): void {
    this.log('trace', data);
  }
  debug(data: object): void {
    this.log('debug', data);
  }
  info(data: object): void {
    this.log('info', data);
  }
  warn(data: object): void {
    this.log('warn', data);
  }
  error(data: object): void {
    this.log('error', data);
  }
  fatal(data: object): void {
    this.log('fatal', data);
  }

  private log(level: LogLevel, data: object): void {
    // GATE FIRST — nothing above this line allocates
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

    // All allocation happens after the gate
    const { message, ...rest } = data as { message?: string; [key: string]: unknown };
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      context: this.context,
      data: rest,
    };

    this.runPipeline(entry);
  }

  private runPipeline(entry: LogEntry): void {
    let current: LogEntry | null = entry;

    for (const plugin of this.plugins) {
      if (current === null) return; // dropped upstream

      let next: LogEntry | null;
      try {
        next = plugin.transform(current);
      } catch (err) {
        console.warn(`[slog] plugin "${plugin.name}" threw:`, err);
        next = current; // pass original entry, not undefined
      }
      current = next;
    }

    if (current !== null) {
      this.buffer.push(current);
    }
  }

  withContext(extraContext: Record<string, unknown>): Logger {
    const frozenContext = Object.freeze(Object.assign({}, this.context, extraContext));
    return new LoggerImpl({
      level: this.minLevel,
      plugins: this.plugins, // same array reference — intentional
      transports: this.transports, // same array reference — intentional
      context: frozenContext,
    });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Splice all buffered entries out
    const entries = this.buffer.splice(0, this.buffer.length);

    // Send each entry to each transport via write(), then flush transports
    for (const transport of this.transports) {
      for (const entry of entries) {
        transport.write(entry);
      }
    }

    await Promise.allSettled(this.transports.map((t) => t.flush()));
  }
}

/**
 * Creates a new structured logger instance.
 * @param options - Logger configuration (level, plugins, transports, context).
 * @returns A Logger instance.
 */
export function createLogger(options?: LoggerOptions): Logger {
  return new LoggerImpl(options);
}
