/** @module slog — Structured logging for every JavaScript runtime. */
export type { LogLevel, LogEntry, Plugin, Transport, Logger, LoggerOptions } from './types.ts';
export { LOG_LEVELS } from './levels.ts';
export { createLogger } from './logger.ts';
export { errorSerializer, createRedactPlugin, createLevelFilterPlugin, createFieldEnrichPlugin } from './plugins/index.ts';
export { createConsoleTransport, createPrettyTransport, createHttpBatchTransport, createRoutedTransport, atOrAboveLevel, exactLevel, belowLevel } from './transports/index.ts';
export type { HttpBatchTransportConfig, TransportRoute } from './transports/index.ts';
