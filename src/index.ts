/** @module slog — Structured logging for every JavaScript runtime. */

export { LOG_LEVELS } from './levels.ts';
export { createLogger } from './logger.ts';
export {
  createFieldEnrichPlugin,
  createLevelFilterPlugin,
  createRedactPlugin,
  errorSerializer,
} from './plugins/index.ts';
export type { HttpBatchTransportConfig, TransportRoute } from './transports/index.ts';
export {
  atOrAboveLevel,
  belowLevel,
  createConsoleTransport,
  createHttpBatchTransport,
  createPrettyTransport,
  createRoutedTransport,
  exactLevel,
} from './transports/index.ts';
export type { LogEntry, Logger, LoggerOptions, LogLevel, Plugin, Transport } from './types.ts';
