# slog

## What This Is

A dead simple structured logger for modern JavaScript runtimes (Node, Bun, Deno, Cloudflare Workers). Zero dependencies, single package with subpath exports. Universal core that knows nothing about runtimes, with framework-specific integrations (like Hono middleware) as separate entrypoints.

## Core Value

Structured logging that works everywhere with zero configuration — import, create, log.

## Requirements

### Validated

- ✓ Universal structured logging core with 6-level filtering (trace/debug/info/warn/error/fatal) — Phase 1
- ✓ Object-only API: `log.info({ message: 'hi', userId: 123 })` — Phase 1
- ✓ `withContext()` for explicit child logger creation with merged immutable context — Phase 1
- ✓ Plugin pipeline for transforming/filtering log entries (sync, named objects) — Phase 1
- ✓ Built-in plugins: error serializer, redaction, level filter, field enrichment — Phase 1

### Active
- [ ] Transport system with buffer-then-flush pattern
- [ ] Console transport (JSON to stdout)
- [ ] Pretty console transport (human-readable with colors)
- [ ] HTTP batch transport (POST entries to endpoint)
- [ ] Hono middleware integration (`slog/hono`) with per-request context
- [ ] Cloudflare Workers support (waitUntil, cf-ray, executionCtx)
- [ ] Subpath exports: `slog` (core), `slog/hono` (middleware)
- [ ] Dual publish to npm and JSR
- [ ] Zero dependencies
- [ ] Full test coverage

### Out of Scope

- AsyncLocalStorage-based context propagation — explicit `withContext()` is sufficient and more portable
- Backwards compatibility with legacy tooling — consumers use modern ESM-capable bundlers/runtimes
- Browser logging — server-side runtimes only
- File transport — consumers on serverless don't have filesystem; others can write their own via transport interface
- Log rotation/management — not the logger's job

## Context

This is a clean extraction and generalization of `@entitleedge/wlog`, a ~335-line structured logger built for Cloudflare Workers. wlog proved the design in production but is tightly coupled to the Workers/Hono ecosystem. slog takes the same core design — object-only structured entries, plugin pipeline, transport system, buffer-then-flush — and makes it runtime-agnostic.

Key architectural difference from wlog: the core logger has no knowledge of any runtime or framework. CF Workers specifics (Hono middleware, `cf-ray` headers, `executionCtx.waitUntil()`) live in `slog/hono` as a separate entrypoint, not baked into core.

The package targets modern runtimes exclusively — no CommonJS, no legacy Node versions. This simplifies packaging and allows clean ESM-only distribution.

## Constraints

- **Zero dependencies**: No runtime deps — the logger must be entirely self-contained
- **Single file core**: Core implementation should stay minimal (under ~400 lines)
- **ESM only**: No CommonJS support — targets modern runtimes
- **TypeScript first**: Source TypeScript, ship with type declarations
- **Dual registry**: Must publish to both npm and JSR

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Object-only API (no string shorthand) | Forces structured logging at the call site — prevents lazy `log.info('something happened')` without context | — Pending |
| Subpath exports over monorepo | Single package is simpler — no version coordination, no monorepo tooling. Modern bundlers handle subpath exports natively | — Pending |
| Explicit context over AsyncLocalStorage | More portable (works in Workers), more predictable, less magic. ALS can be added later as opt-in if needed | — Pending |
| Buffer-then-flush over immediate write | Aligns with serverless (Workers) execution model and enables batch transports efficiently | — Pending |

---
*Last updated: 2026-03-21 after Phase 1 completion*
