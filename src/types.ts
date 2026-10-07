/** Severity levels from least to most severe. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** A structured log record produced by the logger. */
export interface LogEntry {
  /** Severity level of the entry. */
  level: LogLevel;
  /** Unix millisecond timestamp via Date.now(). */
  timestamp: number; // Unix ms via Date.now()
  /** Optional human-readable message. */
  message?: string;
  /** Contextual fields inherited from the logger or withContext(). */
  context: Record<string, unknown>;
  /** Per-call structured data fields. */
  data: Record<string, unknown>;
}

/** Transforms or filters log entries before they reach transports. */
export interface Plugin {
  /** Unique identifier for the plugin. */
  name: string;
  /**
   * Transforms the given log entry, or returns null to drop it.
   * @param entry - The log entry to transform.
   * @returns The transformed entry, or null to drop it from the pipeline.
   */
  transform(entry: LogEntry): LogEntry | null;
}

/** Delivers log entries to an output destination. */
export interface Transport {
  /**
   * Writes a log entry to the transport's internal buffer or directly to output.
   * @param entry - The log entry to write.
   */
  write(entry: LogEntry): void;
  /** Flushes buffered entries to the output destination. */
  flush(): Promise<void>;
}

/** Structured logger supporting leveled methods, child contexts, and flush. */
export interface Logger {
  /**
   * Logs an entry at trace level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  trace(data: object): void;
  /**
   * Logs an entry at debug level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  debug(data: object): void;
  /**
   * Logs an entry at info level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  info(data: object): void;
  /**
   * Logs an entry at warn level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  warn(data: object): void;
  /**
   * Logs an entry at error level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  error(data: object): void;
  /**
   * Logs an entry at fatal level.
   * @param data - Structured data fields; use a `message` key for a human-readable message.
   */
  fatal(data: object): void;
  /**
   * Returns a new Logger with additional context fields merged in.
   * @param context - Key-value pairs to add to every subsequent log entry.
   * @returns A new Logger instance with the merged context.
   */
  withContext(context: Record<string, unknown>): Logger;
  /** Flushes all buffered entries through transports and awaits completion. */
  flush(): Promise<void>;
}

/** Configuration for createLogger(). */
export interface LoggerOptions {
  /** Minimum log level to emit. Entries below this level are silently dropped. Defaults to `'info'`. */
  level?: LogLevel;
  /** Array of plugins applied to each entry in order before transport delivery. */
  plugins?: Plugin[];
  /** Array of transports that receive entries on flush. */
  transports?: Transport[];
  /** Initial context fields merged into every log entry produced by this logger. */
  context?: Record<string, unknown>;
}
