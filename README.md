# @bjro/slog

A dead-simple structured logger for ECMAScript runtimes — Cloudflare Workers, Node.js, Deno, Bun. Zero runtime dependencies.

## Install

```sh
# npm
npm install @bjro/slog

# JSR
jsr add @bjro/slog
```

## Quick Start

```typescript
import { createLogger, createConsoleTransport } from '@bjro/slog';

const log = createLogger({
  transports: [createConsoleTransport()],
});

log.info({ message: 'server started', port: 3000 });
log.warn({ message: 'high memory', bytes: 1_048_576 });
log.error({ message: 'request failed', error: new Error('timeout') });
await log.flush();

// Child logger with inherited context
const reqLog = log.withContext({ requestId: 'abc123', userId: 42 });
reqLog.info({ message: 'user action', action: 'login' });
await reqLog.flush();
// => {"level":"info","timestamp":1711008225123,"context":{"requestId":"abc123","userId":42},"data":{"action":"login"},"message":"user action"}
```

A logger with no configured transports does not write output. Add a transport with the `transports` option and call `flush()` to deliver buffered entries.

## Transports

### Console Transport (JSON)

```typescript
import { createLogger, createConsoleTransport } from '@bjro/slog';

const log = createLogger({ transports: [createConsoleTransport()] });
log.info({ message: 'hello' });
await log.flush();
// => {"level":"info","timestamp":1711008225123,"context":{},"data":{},"message":"hello"}
```

### Pretty Transport (human-readable)

```typescript
import { createLogger, createPrettyTransport } from '@bjro/slog';

const log = createLogger({ transports: [createPrettyTransport()] });
log.info({ message: 'server started', port: 3000 });
await log.flush();
// => 2024-03-21T10:23:45.123Z [INFO ] server started port=3000 (written to stderr)
```

### NDJSON Transport

Provide a line writer to choose the destination. This Node.js example writes newline-delimited JSON to stderr; each line includes its trailing newline.

```typescript
import { createLogger, createNdjsonTransport } from '@bjro/slog';

const log = createLogger({
  transports: [createNdjsonTransport((line) => { process.stderr.write(line); })],
});
log.info({ message: 'server started', port: 3000 });
await log.flush();
```

### Browser Console Transport

Use this transport when you want formatted output routed through severity-specific console methods in browser DevTools.

```typescript
import { createLogger, createBrowserConsoleTransport } from '@bjro/slog';

const log = createLogger({ transports: [createBrowserConsoleTransport()] });
log.warn({ message: 'slow request', durationMs: 1200 });
await log.flush();
```

### HTTP Batch Transport

```typescript
import { createLogger, createHttpBatchTransport } from '@bjro/slog';

const log = createLogger({
  transports: [createHttpBatchTransport({
    url: 'https://logs.example.com/ingest',
    flushInterval: 5000,
    headers: { Authorization: 'Bearer token' },
  })],
});

log.info({ message: 'batching logs' });
await log.flush();
```

### Routed Transport

```typescript
import {
  createLogger,
  createConsoleTransport,
  createHttpBatchTransport,
  createRoutedTransport,
  atOrAboveLevel,
  belowLevel,
} from '@bjro/slog';

const log = createLogger({
  transports: [createRoutedTransport([
    { predicate: belowLevel('error'), transport: createConsoleTransport() },
    { predicate: atOrAboveLevel('error'), transport: createHttpBatchTransport({ url: '...' }) },
  ])],
});

log.info({ message: 'request handled' });
await log.flush();
```

## Plugins

```typescript
import {
  createLogger,
  createConsoleTransport,
  errorSerializer,
  createRedactPlugin,
  createFieldEnrichPlugin,
  createLevelFilterPlugin,
} from '@bjro/slog';

const log = createLogger({
  transports: [createConsoleTransport()],
  plugins: [
    errorSerializer,                              // serialize Error objects
    createRedactPlugin(['password', 'token']),    // redact sensitive fields
    createFieldEnrichPlugin({ service: 'api' }),  // add static fields
    createLevelFilterPlugin('warn'),              // suppress below warn
  ],
});

log.error({ message: 'auth failed', error: new Error('invalid token') });
await log.flush();
// error.message and error.stack serialized automatically
```

## Hono Integration

```typescript
import { Hono } from 'hono';
import { createLogger, createConsoleTransport } from '@bjro/slog';
import { slogMiddleware, type Logger } from '@bjro/slog/hono';

const logger = createLogger({ transports: [createConsoleTransport()] });

const app = new Hono<{ Variables: { logger: Logger } }>();
app.use('*', slogMiddleware(logger));

app.get('/', (c) => {
  const log = c.get('logger'); // request-scoped logger
  log.info({ message: 'handling request' });
  return c.text('OK');
});
```

The middleware automatically logs request completion with `status` and `duration`, and uses `waitUntil` on Cloudflare Workers for non-blocking flush.

## API Reference

### Main entrypoint — `@bjro/slog`

| Export | Type | Description |
|--------|------|-------------|
| `createLogger(options?)` | `(options?: LoggerOptions) => Logger` | Create a logger instance |
| `LOG_LEVELS` | `Record<LogLevel, number>` | Numeric level map |
| `createConsoleTransport()` | `() => Transport` | JSON via level-appropriate console methods (stdout/stderr in Node.js) |
| `createBrowserConsoleTransport()` | `() => Transport` | Formatted output using level-appropriate browser console methods |
| `createNdjsonTransport(writeLine)` | `(writeLine: (line: string) => void \| Promise<void>) => Transport` | Newline-delimited JSON records to the provided writer on flush |
| `createPrettyTransport()` | `() => Transport` | Formatted human-readable output to stderr |
| `createHttpBatchTransport(config)` | `(config: HttpBatchTransportConfig) => Transport` | Batched HTTP POST transport |
| `createRoutedTransport(routes)` | `(routes: TransportRoute[]) => Transport` | Route entries to multiple transports |
| `atOrAboveLevel(level)` | `(level: LogLevel) => (entry: LogEntry) => boolean` | Route predicate |
| `exactLevel(level)` | `(level: LogLevel) => (entry: LogEntry) => boolean` | Route predicate |
| `belowLevel(level)` | `(level: LogLevel) => (entry: LogEntry) => boolean` | Route predicate |
| `errorSerializer` | `Plugin` | Serialize Error objects in `error`/`err` fields |
| `createRedactPlugin(keys)` | `(keys: string[]) => Plugin` | Redact field values |
| `createFieldEnrichPlugin(fields)` | `(fields: Record<string, unknown>) => Plugin` | Add static fields to every entry |
| `createLevelFilterPlugin(minLevel)` | `(minLevel: LogLevel) => Plugin` | Drop entries below minimum level |

**Types:** `LogLevel`, `LogEntry`, `Plugin`, `Transport`, `Logger`, `LoggerOptions`, `HttpBatchTransportConfig`, `TransportRoute`

### Hono entrypoint — `@bjro/slog/hono`

| Export | Type | Description |
|--------|------|-------------|
| `slogMiddleware(logger)` | `(logger: Logger) => MiddlewareHandler` | Hono middleware for request logging |
| `Logger` | type | Re-exported Logger type |

## Log Levels

`trace` < `debug` < `info` < `warn` < `error` < `fatal`

Default minimum level: `info`.

## License

Apache 2.0 — see [LICENSE](LICENSE).
