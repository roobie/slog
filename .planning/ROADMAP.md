# Roadmap: slog

## Overview

slog is built in four phases that follow its natural dependency chain: core logic first (no I/O, fully testable in isolation), then the transport layer (all I/O), then the Hono middleware integration (validates the buffer-then-flush design end-to-end in a real Workers context), and finally packaging and dual publishing. Each phase delivers a complete, independently verifiable capability. Nothing ships until Phase 4.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Foundation** - Fully functional in-memory logger with level filtering, child loggers, and plugin pipeline — no I/O, no transports
- [ ] **Phase 2: Transport System** - Console, pretty, and HTTP batch transports with buffer-then-flush pattern
- [ ] **Phase 3: Hono Integration** - slog/hono subpath export with per-request context and Cloudflare Workers waitUntil flush
- [ ] **Phase 4: Packaging and Publishing** - Correct exports map, TypeScript declarations, and dual publish to npm and JSR

## Phase Details

### Phase 1: Core Foundation
**Goal**: Users can create and use a fully functional structured logger with level filtering, child loggers, and a plugin pipeline — entirely in memory with no I/O
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, PLUG-01, PLUG-02, PLUG-03, PLUG-04, PLUG-05, PLUG-06
**Success Criteria** (what must be TRUE):
  1. `createLogger()` works with no arguments and accepts log entries via `log.info({ message: 'text' })`
  2. Calling a log method below the configured minimum level produces zero side effects — no allocation, no processing
  3. `withContext()` returns a child logger whose entries include the parent's context fields merged with its own; mutating the parent's context object after child creation does not affect the child
  4. A plugin returning `null` drops the entry from all downstream processing; a plugin can modify or enrich entry fields
  5. Built-in plugins (error serializer, redaction, level filter, field enrichment) are importable and usable without custom code
**Plans**: TBD

### Phase 2: Transport System
**Goal**: Users can route log entries to stdout (JSON), a human-readable pretty output, or an HTTP endpoint — all via the buffer-then-flush pattern
**Depends on**: Phase 1
**Requirements**: TRAN-01, TRAN-02, TRAN-03, TRAN-04, TRAN-05, TRAN-06, TRAN-07
**Success Criteria** (what must be TRUE):
  1. `ConsoleTransport` writes each entry as a JSON line to stdout via the appropriate `console` method (not `process.stdout.write`)
  2. `PrettyTransport` writes colorized, human-readable output with timestamps and formatted data fields
  3. `HttpBatchTransport` accumulates entries in memory and POSTs them as a batch to a configurable endpoint when `flush()` is called
  4. Calling `flush()` on a logger with multiple transports sends all buffered entries to all transports; a failure in one transport is caught and logged to console without blocking the others
  5. A level-routed transport wrapper can send `error`/`fatal` entries to one transport and lower levels to another
**Plans**: TBD

### Phase 3: Hono Integration
**Goal**: Users can attach slog to a Hono app and receive a per-request child logger with automatic context, duration tracking, and correct flush behavior in Cloudflare Workers
**Depends on**: Phase 2
**Requirements**: HONO-01, HONO-02, HONO-03, HONO-04, HONO-05
**Success Criteria** (what must be TRUE):
  1. `import { slogMiddleware } from 'slog/hono'` works without importing anything from the core `slog` entrypoint
  2. Each request handler receives a child logger via `c.get('logger')` with `requestId`, `method`, `path`, and `userAgent` pre-populated
  3. A completion log entry with the request duration in milliseconds is written automatically when the response is sent
  4. In a Cloudflare Workers environment, `flush()` is registered with `executionCtx.waitUntil()` so buffered HTTP transport entries are not dropped after the response is sent
**Plans**: TBD

### Phase 4: Packaging and Publishing
**Goal**: Users can install slog from npm or JSR and get correct TypeScript types for all subpath exports, with no runtime dependencies
**Depends on**: Phase 3
**Requirements**: PACK-01, PACK-02, PACK-03, PACK-04, PACK-05, PACK-06, PACK-07
**Success Criteria** (what must be TRUE):
  1. `npm install slog` followed by `import { createLogger } from 'slog'` and `import { slogMiddleware } from 'slog/hono'` resolves types correctly under both `node16` and `bundler` moduleResolution — verified by `attw` in CI
  2. The published package has zero entries in `dependencies` (devDependencies and peerDependencies are exempt)
  3. `jsr publish --dry-run` passes with no slow types errors — all public API functions have explicit return type annotations
  4. A single CI workflow triggered by git tag publishes to both npm and JSR atomically; if either registry rejects the publish, the workflow fails

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Foundation | 0/TBD | Not started | - |
| 2. Transport System | 0/TBD | Not started | - |
| 3. Hono Integration | 0/TBD | Not started | - |
| 4. Packaging and Publishing | 0/TBD | Not started | - |
