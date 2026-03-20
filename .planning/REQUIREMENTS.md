# Requirements: slog

**Defined:** 2026-03-20
**Core Value:** Structured logging that works everywhere with zero configuration

## v1 Requirements

### Core Logger

- [ ] **CORE-01**: Logger supports 6 levels: trace, debug, info, warn, error, fatal
- [ ] **CORE-02**: Level gate is the first operation — zero allocation for disabled levels
- [ ] **CORE-03**: Object-only API: `log.info({ message: 'text', ...data })`
- [ ] **CORE-04**: Consistent log entry schema: level, timestamp, message, context, data
- [ ] **CORE-05**: `withContext()` creates child logger with merged immutable context
- [ ] **CORE-06**: Logger factory with configurable minimum level and defaults
- [ ] **CORE-07**: Zero-config startup: `createLogger()` works with no arguments

### Plugin Pipeline

- [ ] **PLUG-01**: Middleware pipeline for transforming/filtering log entries
- [ ] **PLUG-02**: Plugins can modify entries, filter (return null to drop), or enrich
- [ ] **PLUG-03**: Built-in error serialization plugin (detects Error objects, extracts name/message/stack)
- [ ] **PLUG-04**: Built-in redaction plugin (mask sensitive fields by key pattern)
- [ ] **PLUG-05**: Built-in level filter plugin
- [ ] **PLUG-06**: Built-in field enrichment plugin (add static fields to all entries)

### Transports

- [ ] **TRAN-01**: Transport interface with `flush(): Promise<void>` contract
- [ ] **TRAN-02**: Console transport (JSON.stringify each entry to appropriate console method)
- [ ] **TRAN-03**: Pretty console transport (human-readable with colors, timestamps, formatted data)
- [ ] **TRAN-04**: HTTP batch transport (POST entries to configurable endpoint with headers and batch size)
- [ ] **TRAN-05**: Built-in level-routed transport wrapper (route levels to different transports)
- [ ] **TRAN-06**: Buffer-then-flush pattern: entries buffered in memory, sent to transports on flush()
- [ ] **TRAN-07**: Transport errors caught and logged to console — one transport failure does not block others

### Hono Integration

- [ ] **HONO-01**: Hono middleware available via `slog/hono` subpath export
- [ ] **HONO-02**: Per-request logger with auto-populated context (requestId, method, path, userAgent)
- [ ] **HONO-03**: Request duration measurement and completion logging
- [ ] **HONO-04**: Flush via `executionCtx.waitUntil()` for Cloudflare Workers
- [ ] **HONO-05**: Logger accessible via Hono context (`c.get('logger')`)

### Packaging

- [ ] **PACK-01**: Zero runtime dependencies
- [ ] **PACK-02**: ESM-only output (no CommonJS)
- [ ] **PACK-03**: Subpath exports: `slog` (core), `slog/hono` (middleware)
- [ ] **PACK-04**: TypeScript declarations for all exports
- [ ] **PACK-05**: Published to npm registry
- [ ] **PACK-06**: Published to JSR registry
- [ ] **PACK-07**: Explicit return type annotations for JSR slow types compliance

## v2 Requirements

### Extended Plugins

- **XPLG-01**: Sampling plugin (log N% of entries at a given level)
- **XPLG-02**: Rate limiting plugin (cap entries per second)
- **XPLG-03**: Async plugin support with queue management

### Extended Integrations

- **XINT-01**: Express/Koa middleware
- **XINT-02**: Fastify plugin
- **XINT-03**: SIGTERM flush handler for Node.js long-lived processes

### Observability

- **XOBS-01**: OpenTelemetry log bridge
- **XOBS-02**: Trace/span correlation in log entries

## Out of Scope

| Feature | Reason |
|---------|--------|
| File transport | Serverless-first — no filesystem. Users can write via transport interface |
| AsyncLocalStorage context | Explicit `withContext()` is more portable and predictable |
| Global singleton logger | Untestable, implicit state — factory pattern instead |
| String shorthand API (`log.info('message')`) | Defeats structured logging — object-only enforces discipline |
| CommonJS output | Modern runtimes only — simplifies build pipeline |
| Browser support | Server-side runtimes only |
| Log rotation/management | Not the logger's responsibility |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | — | Pending |
| CORE-02 | — | Pending |
| CORE-03 | — | Pending |
| CORE-04 | — | Pending |
| CORE-05 | — | Pending |
| CORE-06 | — | Pending |
| CORE-07 | — | Pending |
| PLUG-01 | — | Pending |
| PLUG-02 | — | Pending |
| PLUG-03 | — | Pending |
| PLUG-04 | — | Pending |
| PLUG-05 | — | Pending |
| PLUG-06 | — | Pending |
| TRAN-01 | — | Pending |
| TRAN-02 | — | Pending |
| TRAN-03 | — | Pending |
| TRAN-04 | — | Pending |
| TRAN-05 | — | Pending |
| TRAN-06 | — | Pending |
| TRAN-07 | — | Pending |
| HONO-01 | — | Pending |
| HONO-02 | — | Pending |
| HONO-03 | — | Pending |
| HONO-04 | — | Pending |
| HONO-05 | — | Pending |
| PACK-01 | — | Pending |
| PACK-02 | — | Pending |
| PACK-03 | — | Pending |
| PACK-04 | — | Pending |
| PACK-05 | — | Pending |
| PACK-06 | — | Pending |
| PACK-07 | — | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 0
- Unmapped: 32 ⚠️

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
