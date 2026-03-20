# Project Research Summary

**Project:** slog — universal structured logging library
**Domain:** TypeScript library for structured logging across Node.js, Bun, Deno, and Cloudflare Workers
**Researched:** 2026-03-20
**Confidence:** HIGH

## Executive Summary

slog occupies a real gap in the JavaScript logging ecosystem: every major library (pino, winston, bunyan, consola) is effectively Node.js-only, and none enforce structured logging at the API level. The recommended approach is a zero-dependency TypeScript library with a clean layered architecture — level gate, immutable plugin pipeline, passive buffer-then-flush transports, and explicit `withContext()` for context propagation. The object-only API (no string shorthands) is the primary design bet: it prevents lazy unstructured logging at call sites and is architecturally defensible, even though it breaks muscle memory from `console.log`. The dual publish to npm (compiled) and JSR (TypeScript source) signals runtime-agnostic intent and gives Deno users first-class access.

The key architectural insight from research is that the buffer-then-flush transport pattern, which is essential for Cloudflare Workers (`executionCtx.waitUntil()`), is also the correct pattern for HTTP batch transports everywhere else. This means there is no compromise between Workers compatibility and general usability — one design serves both. The `slog/hono` subpath export as a first-party integration, not a third-party package, is the concrete proof-of-concept that validates the entire architecture.

The critical risks are implementation-level, not design-level: error objects serializing to `{}`, logs silently dropped in Workers without `waitUntil`, context mutation bugs in `withContext()`, and TypeScript type resolution breaking on subpath exports. All are preventable with upfront interface contracts and a cross-runtime CI matrix. The packaging risks (JSR slow types, npm/JSR version drift) are avoided by automating dual-publish from a single CI workflow from the start.

## Key Findings

### Recommended Stack

The stack is lean by design — the zero-dependency constraint eliminates runtime library choices and focuses decisions on build tooling only. TypeScript 5.9.3 with `verbatimModuleSyntax` and `isolatedModules` enforced, compiled to ESM-only output via tsup 8.5.1 (esbuild under the hood). No CJS output — modern runtimes require ESM and adding CJS doubles build complexity for no stated use case.

Testing is Vitest 4.1.0 on Node (not Bun's native test runner, not `node:test`). Releases are managed with `@changesets/cli` for deliberate batched releases rather than semantic-release's automated cut-on-every-merge behavior. `jsr publish` takes TypeScript source directly; `npm publish` takes the compiled `dist/`. Versions must stay in sync between `package.json` and `jsr.json` — automated in CI.

**Core technologies:**
- TypeScript 5.9.3 — source language with strict ESM-only output, `verbatimModuleSyntax` required
- tsup 8.5.1 — build/bundler via esbuild; handles subpath exports, ESM output, and `.d.ts` generation
- Vitest 4.1.0 — test runner (Node >= 20 required; do not use `bun test` or Deno for running tests)
- @changesets/cli 2.30.0 — deliberate release management, not automated semantic-release
- typescript-eslint 8.57.1 — ESLint 9 flat config with type-aware rules

### Expected Features

The feature dependency chain is clear: core logger with stable entry schema must come first, then `withContext()`, then plugin pipeline, then transports, then Hono middleware. Each layer depends on the one below being locked. The object-only API and zero-dependency constraint are non-negotiable design decisions, not features to debate.

**Must have (table stakes):**
- debug/info/warn/error log levels with runtime level filtering — expected by all consumers
- Object-only API with stable entry schema (`level`, `time`, `message` + arbitrary fields) — the core design bet
- `withContext()` child logger with merged bindings — required before any real-world use
- Plugin pipeline (transform/filter/enrich entries) — the primary extension point
- Console transport (JSON to stdout) — the production deployment transport
- Pretty console transport for development — required for developer adoption
- HTTP batch transport with buffer-then-flush — the serverless/Workers deployment transport
- `slog/hono` Hono middleware with per-request context and `waitUntil` flush — validates the design
- Full TypeScript declarations shipped with the package
- Zero runtime dependencies — a hard constraint, not optional

**Should have (competitive):**
- Dual publish to npm and JSR — signals runtime-agnostic intent; low complexity, high signal value
- Redaction plugin — documents the plugin API pattern as a first-party example
- Error object serializer — prevents the silent `{}` failure mode; implement as pipeline plugin
- `cf-ray` automatic injection in Hono middleware — low complexity once middleware exists

**Defer (v2+):**
- Additional framework middleware (Express, Fastify, Elysia) — validate Hono design first
- OpenTelemetry trace context injection — high value but requires OTel SDK interaction research
- AsyncLocalStorage opt-in mode — explicitly out of scope per project constraints; reconsider only if Workers ALS support matures

### Architecture Approach

The architecture is five cleanly separated layers: public API (Logger + `withContext()`), level gate (numeric fast-exit before any allocation), plugin pipeline (ordered pure functions, `(entry) => entry | null`), transport interface (`write(entry)` + `flush()`), and framework integration (`slog/hono` subpath that core has no knowledge of). The core exclusively uses Web Platform APIs (`fetch`, `console.log`, `JSON.stringify`, `Date.now()`) — no `process`, no `Buffer`, no Node built-ins. The build order follows component dependencies: types → levels → pipeline → transport interface → console transport → core → pretty transport → HTTP transport → hono middleware.

**Major components:**
1. Logger factory + `withContext()` — level gate, context merge, pipeline dispatch, transport routing
2. Plugin pipeline — ordered array of pure functions; `null` return drops the entry; no side effects
3. Transport interface (`write` + `flush`) — passive buffer accumulation; flush triggered by framework, not by timer
4. Console + Pretty transports — validation of the interface; Web Platform APIs only
5. HTTP batch transport — `fetch()` POST with configurable endpoint; flush hands to `waitUntil` in Workers
6. `slog/hono` middleware — per-request child logger, cf-ray injection, `executionCtx.waitUntil(flush())`

### Critical Pitfalls

1. **Error objects serialize to `{}`** — `JSON.stringify(new Error())` returns empty object due to non-enumerable properties. Implement error serializer in the plugin pipeline before any transport work. Test explicitly: `log.error({ err: new Error('x') })` must show `err.message` and `err.stack` in output.

2. **Workers logs silently dropped without `waitUntil`** — HTTP batch transport `fetch()` calls are cancelled when the Worker sends its response unless registered with `ctx.waitUntil()`. The `flush()` method must be in the transport interface contract from day one; the Hono middleware must call `ctx.waitUntil(logger.flush())`.

3. **Object allocation on disabled log levels** — level check must be the absolute first operation before any allocation. Context merge, timestamp generation, field preparation all happen after the gate. Benchmark: disabled-level call must be near-zero allocation.

4. **Mutable shared context corrupts child loggers** — `withContext()` must shallow-copy + freeze bindings. If the parent's context object is mutated after a child is created, the child must not reflect that mutation. Write a regression test that explicitly tests this.

5. **Subpath exports TypeScript resolution breakage** — `types` condition must be listed before `import` in each exports entry. Run `attw` (Are The Types Wrong?) in CI under both `node16` and `bundler` moduleResolution. Never publish without this check passing.

6. **npm/JSR version drift** — dual publish must be a single atomic CI workflow triggered by git tag. Both registries fail = release fails. Never allow manual step for one registry to be skipped under pressure.

## Implications for Roadmap

Based on the feature dependency chain and architecture build order from research, a 5-phase structure is recommended:

### Phase 1: Core Foundation

**Rationale:** Everything depends on stable types and the entry schema. Build the contract first, then the implementation. The level gate and plugin interface must be locked before any transport work begins — transports depend on the entry shape being stable.

**Delivers:** Fully functional in-memory logger with level filtering, `withContext()`, and plugin pipeline. No I/O yet — testable in complete isolation.

**Addresses:** Core logger + levels, object-only API + entry schema, `withContext()` child logger, plugin pipeline (all P1 from FEATURES.md)

**Avoids:** Object allocation on disabled levels (level gate first), mutable shared context (freeze bindings in `withContext()`), plugin pipeline mutation (define pure function contract upfront)

**Research flag:** Standard patterns — well-documented in pino, winston, LogTape source. Skip research-phase.

### Phase 2: Transport System

**Rationale:** Core is stable; now add I/O. Console transport first (simplest, validates the interface), then pretty transport (validates dev DX), then HTTP batch transport (validates the buffer-then-flush pattern that Workers requires). Define the `flush()` method in the transport interface before writing any concrete transport.

**Delivers:** Console transport (JSON stdout), pretty console transport (colorized dev output), HTTP batch transport with configurable endpoint.

**Uses:** `fetch()` for HTTP transport (Web Platform API, zero polyfill on all targets), `console.log()` not `process.stdout.write`

**Implements:** Transport interface, buffer-then-flush pattern, ConsoleTransport, PrettyTransport, HttpBatchTransport

**Avoids:** Synchronous I/O in `write()`, timer-based auto-flush, `process.stdout.write` (Workers incompatible), silent data loss on crash (document shutdown hook pattern)

**Research flag:** Standard patterns for console and pretty transports. HTTP batch transport pattern is well-documented. Skip research-phase.

### Phase 3: Hono Middleware

**Rationale:** Core and transports are stable. The Hono middleware is the integration that validates the entire design end-to-end: per-request child logger, cf-ray injection, `executionCtx.waitUntil(flush())`. This is the primary proof-of-concept.

**Delivers:** `slog/hono` subpath export with full Cloudflare Workers integration. Validates buffer-then-flush transport in a real Workers execution context.

**Implements:** `hono.ts` entry point (isolated from core), subpath exports configuration, Miniflare integration test

**Avoids:** Logs silently dropped without `waitUntil` (middleware must call `ctx.waitUntil(logger.flush())`), runtime detection inside core (hono.ts is the only file that knows about Workers/Hono)

**Research flag:** Hono middleware API patterns are well-documented. `executionCtx.waitUntil()` semantics verified. Skip research-phase.

### Phase 4: Packaging and Publishing

**Rationale:** Library is feature-complete for v1. Packaging must be correct before any publish — TypeScript type resolution for subpath exports, JSR slow types, and dual-registry version sync are all easier to get right once rather than fix post-publish.

**Delivers:** Correct `package.json` exports map, `jsr.json` config, `attw` CI check, `jsr publish --dry-run` CI check, dual-publish GitHub Actions workflow.

**Uses:** tsup build output, `jsr publish`, `npm publish`, @changesets/cli for version management

**Avoids:** Subpath exports TypeScript breakage (`types` first in exports conditions), JSR slow types (explicit return type annotations on all public API), npm/JSR version drift (single atomic CI workflow)

**Research flag:** Packaging is well-documented (tsup docs, JSR publishing docs, andrewbranch's subpath exports guide). Skip research-phase.

### Phase 5: P2 Additions

**Rationale:** Core is shipped and validated. Add the features that need real-world signal to prioritize: redaction plugin (documents the plugin API pattern), error serializer (prevents the `{}` failure mode, should arguably be in v1 but can ship as a plugin), `cf-ray` auto-injection.

**Delivers:** Redaction plugin, error serializer plugin, `cf-ray` automatic injection in Hono middleware.

**Implements:** First-party plugin examples that document the plugin API

**Avoids:** Error objects serializing to `{}` in production (error serializer added here if not in Phase 1)

**Research flag:** Error serializer is straightforward. Redaction is documented in pino as built-in `redact` option — study its path-based approach. Low research need.

### Phase Ordering Rationale

- Types and entry schema must be stable before transports (transports serialize entries; changing the schema breaks serializers).
- Plugin pipeline must be defined before any plugins are written (Phase 1 establishes the contract; Phase 5 ships first-party plugins using it).
- HTTP batch transport must exist before Hono middleware (middleware calls `flush()`; transport must expose that method).
- Packaging is last deliberate work before publish — getting it right once avoids post-publish patch releases for type resolution bugs.
- The buffer-then-flush pattern is established in Phase 2 (transport system) and validated end-to-end in Phase 3 (Workers + `waitUntil`). This ordering ensures the Workers integration is not the first time the pattern is tested.

### Research Flags

Phases with standard patterns (skip `research-phase` during planning):
- **Phase 1 (Core Foundation):** Level gate, plugin pipeline, and child logger patterns are well-documented in pino, winston, and LogTape. Architecture research has concrete TypeScript examples.
- **Phase 2 (Transport System):** Buffer-then-flush is an established pattern. Console and pretty transport implementations are straightforward.
- **Phase 3 (Hono Middleware):** Hono middleware API is well-documented. `waitUntil` semantics are verified from Cloudflare official docs.
- **Phase 4 (Packaging):** tsup + JSR + npm dual-publish is documented. `attw` tooling is standard.
- **Phase 5 (P2 Additions):** Error serializer and redaction are established patterns.

No phases require `research-phase` — the research base is comprehensive and high-confidence.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry versions verified live; official docs for tsup, Vitest 4, TypeScript 5.x, JSR publishing |
| Features | HIGH | Competitor analysis across pino, winston, bunyan, consola, roarr with primary sources; feature dependency chain verified |
| Architecture | HIGH | Pino, winston, LogTape source-verified; cross-runtime patterns from official tooling documentation |
| Pitfalls | HIGH | Findings verified across multiple authoritative sources including official GitHub issues and Cloudflare docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Error serializer scope:** Research recommends P2, but the `JSON.stringify(new Error())` returns `{}` problem is severe enough it arguably belongs in Phase 1 as part of the core logger. Resolve during requirements definition — it is low implementation cost and high user impact.
- **Pretty transport TTY detection:** Research notes that pretty output in non-TTY environments breaks JSON-parsing tooling. The exact TTY detection API (`process.stdout.isTTY`) is not available in Workers — decide during Phase 2 planning whether to require explicit `pretty: true` opt-in or auto-detect on supported runtimes only.
- **Miniflare testing setup:** Vitest + Miniflare integration for Workers end-to-end tests is not covered in the architecture research. This needs a short spike during Phase 3 planning to verify the test setup before committing to the approach.
- **`attw` version:** The `attw` (Are The Types Wrong?) tool version and CI integration pattern were not researched. Validate during Phase 4 planning.

## Sources

### Primary (HIGH confidence)
- npm registry (live query) — tsup@8.5.1, typescript@5.9.3, vitest@4.1.0, @changesets/cli@2.30.0, typescript-eslint@8.57.1
- [tsup official docs](https://tsup.egoist.dev/) — subpath exports, dts generation, ESM config
- [JSR Publishing Docs](https://jsr.io/docs/publishing-packages) — jsr.json, slow types, dual publish workflow
- [Vitest 4.0 release announcement](https://vitest.dev/blog/vitest-4) — Node >= 20 requirement
- [TypeScript 5.8 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-8/) — verbatimModuleSyntax, erasableSyntaxOnly
- [typescript-eslint getting started](https://typescript-eslint.io/getting-started/) — flat config setup
- [pino API documentation](https://github.com/pinojs/pino/blob/main/docs/api.md) — architecture, child loggers, transports
- [LogTape comparison page](https://logtape.org/comparison) — cross-runtime patterns, feature matrix, performance benchmarks
- [Cloudflare Workers Context/waitUntil docs](https://developers.cloudflare.com/workers/runtime-apis/context/) — waitUntil semantics
- [andrewbranch/example-subpath-exports-ts-compat](https://github.com/andrewbranch/example-subpath-exports-ts-compat) — TypeScript-friendly subpath exports
- [pino GitHub issue #2033](https://github.com/pinojs/pino/issues/2033) — object-only API rationale
- [Deno/Vitest panic issue](https://github.com/denoland/deno/issues/31354) — Vitest 4.0.10 Deno incompatibility

### Secondary (MEDIUM confidence)
- [Total TypeScript TSConfig cheat sheet](https://www.totaltypescript.com/tsconfig-cheat-sheet) — tsconfig library best practices
- [Cross-runtime JS library patterns 2025](https://debugg.ai/resources/js-runtimes-have-forked-2025-cross-runtime-libraries-node-bun-deno-edge-workers) — Web Platform API baseline, adapter isolation
- [structured-log pipeline](https://github.com/structured-log/structured-log) — BatchedSink buffer pattern
- [LogLayer plugin architecture](https://loglayer.dev/) — plugin-as-middleware pattern
- [Guide to package.json exports field](https://hirok.io/posts/package-json-exports) — condition ordering, TypeScript resolution
- Multiple sources on changesets vs semantic-release — Changesets preferred for manual release cadence

### Tertiary (LOW confidence)
- [PkgPulse: consola vs tslog vs roarr 2026](https://www.pkgpulse.com/blog/consola-vs-tslog-vs-roarr-structured-logging-nodejs-2026) — single source, not cross-verified; used only for ecosystem overview

---
*Research completed: 2026-03-20*
*Ready for roadmap: yes*
