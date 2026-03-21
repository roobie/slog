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
  transport: createConsoleTransport(),
});

log.info({ message: 'server started', port: 3000 });
log.warn({ message: 'high memory', bytes: 1_048_576 });
log.error({ message: 'request failed', error: new Error('timeout') });

// Child logger with inherited context
const reqLog = log.withContext({ requestId: 'abc123', userId: 42 });
reqLog.info({ message: 'user action', action: 'login' });
// => {"level":"info","requestId":"abc123","userId":42,"action":"login","message":"user action"}
```

`createLogger()` with no arguments works immediately — logs JSON to stdout.

## Transports

### Console Transport (JSON)

```typescript
import { createLogger, createConsoleTransport } from '@bjro/slog';

const log = createLogger({ transport: createConsoleTransport() });
log.info({ message: 'hello' });
// => {"level":"info","message":"hello"}
```

### Pretty Transport (human-readable)

```typescript
import { createLogger, createPrettyTransport } from '@bjro/slog';

const log = createLogger({ transport: createPrettyTransport() });
log.info({ message: 'server started', port: 3000 });
// => INFO  server started  port=3000
```

### HTTP Batch Transport

```typescript
import { createLogger, createHttpBatchTransport } from '@bjro/slog';

const log = createLogger({
  transport: createHttpBatchTransport({
    url: 'https://logs.example.com/ingest',
    batchSize: 100,
    flushInterval: 5000,
    headers: { Authorization: 'Bearer token' },
  }),
});
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
  transport: createRoutedTransport([
    { match: belowLevel('error'), transport: createConsoleTransport() },
    { match: atOrAboveLevel('error'), transport: createHttpBatchTransport({ url: '...' }) },
  ]),
});
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
  transport: createConsoleTransport(),
  plugins: [
    errorSerializer,                              // serialize Error objects
    createRedactPlugin(['password', 'token']),    // redact sensitive fields
    createFieldEnrichPlugin({ service: 'api' }),  // add static fields
    createLevelFilterPlugin('warn'),              // suppress below warn
  ],
});

log.error({ message: 'auth failed', error: new Error('invalid token') });
// error.message and error.stack serialized automatically
```

## Hono Integration

```typescript
import { createLogger, createConsoleTransport } from '@bjro/slog';
import { slogMiddleware } from '@bjro/slog/hono';

const logger = createLogger({ transport: createConsoleTransport() });

const app = new Hono();
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
| `createConsoleTransport()` | `() => Transport` | JSON to stdout/console |
| `createPrettyTransport()` | `() => Transport` | Formatted human-readable output |
| `createHttpBatchTransport(config)` | `(config: HttpBatchTransportConfig) => Transport` | Batched HTTP POST transport |
| `createRoutedTransport(routes)` | `(routes: TransportRoute[]) => Transport` | Route entries to multiple transports |
| `atOrAboveLevel(level)` | `(level: LogLevel) => MatchFn` | Route matcher |
| `exactLevel(level)` | `(level: LogLevel) => MatchFn` | Route matcher |
| `belowLevel(level)` | `(level: LogLevel) => MatchFn` | Route matcher |
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
