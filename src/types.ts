export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  timestamp: number;        // Unix ms via Date.now()
  message?: string;
  context: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface Plugin {
  name: string;
  transform(entry: LogEntry): LogEntry | null;
}

export interface Transport {
  write(entry: LogEntry): void;
  flush(): Promise<void>;
}

export interface Logger {
  trace(data: object): void;
  debug(data: object): void;
  info(data: object): void;
  warn(data: object): void;
  error(data: object): void;
  fatal(data: object): void;
  withContext(context: Record<string, unknown>): Logger;
  flush(): Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel;
  plugins?: Plugin[];
  transports?: Transport[];
  context?: Record<string, unknown>;
}
