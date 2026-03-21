# Requirements: slog

**Defined:** 2026-03-20
**Core Value:** Structured logging that works everywhere with zero configuration

## v1 Requirements

### Core Logger

- [x] **CORE-01**: Logger supports 6 levels: trace, debug, info, warn, error, fatal
- [x] **CORE-02**: Level gate is the first operation — zero allocation for disabled levels
- [x] **CORE-03**: Object-only API: `log.info({ message: 'text', ...data })`
- [x] **CORE-04**: Consistent log entry schema: level, timestamp, message, context, data
- [x] **CORE-05**: `withContext()` creates child logger with merged immutable context
- [x] **CORE-06**: Logger factory with configurable minimum level and defaults
- [x] **CORE-07**: Zero-config startup: `createLogger()` works with no arguments

### Plugin Pipeline

- [x] **PLUG-01**: Middleware pipeline for transforming/filtering log entries
- [x] **PLUG-02**: Plugins can modify entries, filter (return null to drop), or enrich
- [x] **PLUG-03**: Built-in error serialization plugin (detects Error objects, extracts name/message/stack)
- [x] **PLUG-04**: Built-in redaction plugin (mask sensitive fields by key pattern)
- [x] **PLUG-05**: Built-in level filter plugin
- [x] **PLUG-06**: Built-in field enrichment plugin (add static fields to all entries)

### Transports

- [x] **TRAN-01**: Transport interface with `flush(): Promise<void>` contract
- [x] **TRAN-02**: Console transport (JSON.stringify each entry to appropriate console method)
- [x] **TRAN-03**: Pretty console transport (human-readable with colors, timestamps, formatted data)
- [x] **TRAN-04**: HTTP batch transport (POST entries to configurable endpoint with headers and batch size)
- [x] **TRAN-05**: Built-in level-routed transport wrapper (route levels to different transports)
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
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| CORE-05 | Phase 1 | Complete |
| CORE-06 | Phase 1 | Complete |
| CORE-07 | Phase 1 | Complete |
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 1 | Complete |
| PLUG-03 | Phase 1 | Complete |
| PLUG-04 | Phase 1 | Complete |
| PLUG-05 | Phase 1 | Complete |
| PLUG-06 | Phase 1 | Complete |
| TRAN-01 | Phase 2 | Complete |
| TRAN-02 | Phase 2 | Complete |
| TRAN-03 | Phase 2 | Complete |
| TRAN-04 | Phase 2 | Complete |
| TRAN-05 | Phase 2 | Complete |
| TRAN-06 | Phase 2 | Pending |
| TRAN-07 | Phase 2 | Pending |
| HONO-01 | Phase 3 | Pending |
| HONO-02 | Phase 3 | Pending |
| HONO-03 | Phase 3 | Pending |
| HONO-04 | Phase 3 | Pending |
| HONO-05 | Phase 3 | Pending |
| PACK-01 | Phase 4 | Pending |
| PACK-02 | Phase 4 | Pending |
| PACK-03 | Phase 4 | Pending |
| PACK-04 | Phase 4 | Pending |
| PACK-05 | Phase 4 | Pending |
| PACK-06 | Phase 4 | Pending |
| PACK-07 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 — phase mappings added after roadmap creation*
