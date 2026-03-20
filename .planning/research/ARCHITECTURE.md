# Architecture Research

**Domain:** Structured logging library (TypeScript, zero-dependency, universal runtime)
**Researched:** 2026-03-20
**Confidence:** HIGH (pino/winston/logtape source-verified; cross-runtime patterns from official tooling)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PUBLIC API LAYER                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Logger  (log.info / log.warn / log.error / log.debug)     │  │
│  │  withContext() → child Logger (inherits + merges context)  │  │
│  └────────────────────────┬───────────────────────────────────┘  │
├───────────────────────────┼─────────────────────────────────────┤
│                    PROCESSING PIPELINE                           │
│                           │                                      │
│                    Level Gate (fast exit)                        │
│                           │                                      │
│              ┌────────────▼────────────────┐                    │
│              │  Plugin Pipeline             │                    │
│              │  [plugin1] → [plugin2] → ... │                    │
│              │  (transform / filter / enrich│                    │
│              └────────────┬────────────────┘                    │
├───────────────────────────┼─────────────────────────────────────┤
│                     TRANSPORT LAYER                              │
│                           │                                      │
│              ┌────────────▼────────────────┐                    │
│              │  Transport Interface         │                    │
│              │  write(entry) / flush()      │                    │
│              └──┬──────────────┬───────────┘                    │
│                 │              │                                  │
│        ┌────────▼──┐   ┌──────▼──────────┐                      │
│        │  Console  │   │  HTTP Batch     │  (+ user-defined)    │
│        │ Transport │   │  Transport      │                       │
│        └───────────┘   └─────────────────┘                      │
├─────────────────────────────────────────────────────────────────┤
│              FRAMEWORK INTEGRATION (slog/hono)                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Hono Middleware  (per-request child logger,             │    │
│  │  cf-ray injection, executionCtx.waitUntil flush)        │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Logger | Owns level check, merges bindings context, invokes pipeline, routes to transport | Plain object with prototype methods; no class inheritance needed |
| Level Gate | Fast numeric comparison before any allocation; drops entry immediately if below threshold | Integer comparison on `levels[name]` map |
| Plugin Pipeline | Ordered array of pure functions that can transform, enrich, or drop entries | `(entry) => entry | null` — null drops the entry |
| Transport Interface | Contract for receiving processed entries; owns buffering and flush | Interface: `{ write(entry): void; flush(): Promise<void> }` |
| Console Transport | Serializes entry to JSON string, writes to stdout | `JSON.stringify` + `process.stdout.write` (or `console.log` for Workers) |
| Pretty Transport | Human-readable colorized output for development | Formats fields with ANSI codes; same interface as Console |
| HTTP Batch Transport | Accumulates entries in array, POSTs on flush or size limit | Buffer array + `fetch()` — universal across all runtimes |
| Child Logger | Clones parent bindings, merges new context, shares parent's pipeline and transport | Shallow object with merged `bindings` map; no independent transport |
| Hono Middleware (`slog/hono`) | Creates per-request child logger, injects cf-ray, schedules flush via waitUntil | Separate entrypoint — core logger has no knowledge of this |

## Recommended Project Structure

```
src/
├── core.ts              # Logger factory, withContext(), level methods
├── levels.ts            # Level name → numeric value map, level gate logic
├── pipeline.ts          # Plugin type definition, runPipeline() function
├── transport.ts         # Transport interface, base buffer logic
├── transports/
│   ├── console.ts       # ConsoleTransport (JSON to stdout)
│   ├── pretty.ts        # PrettyTransport (colorized dev output)
│   └── http.ts          # HttpBatchTransport (POST to endpoint)
├── types.ts             # Shared TypeScript types (LogEntry, Plugin, Transport, Logger)
└── hono.ts              # Hono middleware (exported as slog/hono subpath)
```

### Structure Rationale

- **core.ts is the single entry point** for `slog` — keeps the public API surface explicit.
- **types.ts holds all shared interfaces** — prevents circular imports between core, pipeline, and transport.
- **transports/ subdirectory** — each transport is independently tree-shakable if consumers use bundlers.
- **hono.ts at root** — maps cleanly to the `slog/hono` subpath export without extra directory nesting.

## Architectural Patterns

### Pattern 1: Level Gate Before Allocation

**What:** Check numeric level before creating any object or string. If the entry would be dropped, return immediately.

**When to use:** Always — this is the single most impactful performance optimization in any logger.

**Trade-offs:** Eliminates cost of object creation for suppressed levels. No downside.

**Example:**
```typescript
// levels.ts
export const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 }

// core.ts — inside log.info()
if (LEVELS.info < this._minLevel) return
// only now build the entry object
```

### Pattern 2: Immutable Entry Object + Plugin Chain

**What:** Each log call assembles a plain object (LogEntry). The plugin pipeline is an ordered array of pure functions. Each plugin receives the entry and returns either a (possibly modified) entry or null to drop it.

**When to use:** This is the standard pattern established by winston's format pipeline and structured-log's enricher/filter chain. Pino skips it for performance (string concatenation instead), but for a zero-alloc-fast-enough library this pattern wins on clarity.

**Trade-offs:**
- Pro: Composable, testable, each plugin is a pure function
- Pro: Dropping entries is explicit (return null)
- Con: More allocations than pino's string-build approach — acceptable outside extreme throughput requirements

**Example:**
```typescript
// types.ts
export type LogEntry = {
  level: string
  timestamp: number
  [key: string]: unknown
}
export type Plugin = (entry: LogEntry) => LogEntry | null

// pipeline.ts
export function runPipeline(entry: LogEntry, plugins: Plugin[]): LogEntry | null {
  let current: LogEntry | null = entry
  for (const plugin of plugins) {
    if (current === null) return null
    current = plugin(current)
  }
  return current
}
```

### Pattern 3: Buffer-Then-Flush Transport

**What:** Transports accumulate entries in an in-memory array. Flushing (serializing + sending) is triggered explicitly by the caller or by a size limit. No timers — the transport is passive.

**When to use:** Essential for serverless (Cloudflare Workers, Lambda). Timers cannot be used in Workers because the execution context is destroyed between requests. The framework integration (Hono middleware) is responsible for calling `flush()` at the right time.

**Trade-offs:**
- Pro: Works identically in all runtimes including Workers (no `setInterval` dependency)
- Pro: HTTP batch transport can batch multiple entries into a single POST
- Con: If the caller forgets to flush, entries are lost — the integration layer must own this responsibility

**Example:**
```typescript
// transport.ts
export interface Transport {
  write(entry: LogEntry): void
  flush(): Promise<void>
}

// transports/http.ts
export class HttpBatchTransport implements Transport {
  private buffer: LogEntry[] = []

  write(entry: LogEntry): void {
    this.buffer.push(entry)
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush() // fire-and-forget size-triggered flush
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const batch = this.buffer.splice(0)
    await fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(batch),
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
```

### Pattern 4: Explicit Context Inheritance via withContext()

**What:** Child loggers are created by merging new bindings onto a copy of the parent's bindings. The child shares the parent's pipeline and transport reference — it does not create new instances.

**When to use:** Standard pattern across pino (child()), winston, and bunyan. Explicit over AsyncLocalStorage because it works in Cloudflare Workers which does not support ALS in older runtime versions.

**Trade-offs:**
- Pro: Works everywhere, predictable, no runtime magic
- Pro: Easy to test — no global state
- Con: Must be passed explicitly through call stack rather than propagated automatically

**Example:**
```typescript
// core.ts
export function withContext(parent: Logger, ctx: Record<string, unknown>): Logger {
  return createLogger({
    ...parent._config,
    bindings: { ...parent._bindings, ...ctx }  // shallow merge, last-write wins
  })
}
```

### Pattern 5: Subpath Exports for Runtime-Specific Code

**What:** Keep core logic free of any runtime-specific imports. Framework integrations live in separate subpath entrypoints (`slog/hono`) that are never loaded unless explicitly imported.

**When to use:** Any time you need to support multiple runtimes. This is how LogTape, logtape, and the cross-runtime adapter pattern work: Web Platform APIs (`fetch`, `console`, `TextEncoder`) form the baseline — runtime-specific code is isolated in explicit adapters.

**Trade-offs:**
- Pro: Core remains zero-dependency and portable
- Pro: Tree-shaking works cleanly — unused transports are never bundled
- Con: Slightly more complex package.json `exports` config required

**Example:**
```json
{
  "exports": {
    ".": "./dist/core.js",
    "./hono": "./dist/hono.js"
  }
}
```

## Data Flow

### Log Entry Flow (happy path)

```
Caller: log.info({ message: 'user logged in', userId: 123 })
    │
    ▼
Level Gate: LEVELS.info (30) >= minLevel (30) — pass
    │
    ▼
Entry Assembly: merge(bindings, callArgs) → LogEntry object
    │
    ▼
Plugin Pipeline: [plugin1(entry)] → [plugin2(entry)] → ... → entry | null
    │                                                     (null = dropped)
    ▼
Transport.write(entry): appended to in-memory buffer
    │
    (later, triggered by framework or size limit)
    ▼
Transport.flush(): serialize buffer → write to stdout / POST to HTTP
```

### Child Logger Inheritance Flow

```
root = createLogger({ minLevel: 'info', bindings: { service: 'api' } })
    │
    ▼
child = root.withContext({ requestId: 'abc-123' })
    │  bindings = { service: 'api', requestId: 'abc-123' }
    │  pipeline = root._pipeline (shared reference)
    │  transport = root._transport (shared reference)
    ▼
child.info({ message: 'handler start' })
    → entry includes: { service: 'api', requestId: 'abc-123', message: 'handler start', ... }
```

### Flush Flow in Cloudflare Workers (via slog/hono)

```
Request arrives
    │
    ▼
Hono Middleware (slog/hono):
    - child = logger.withContext({ requestId: c.req.header('cf-ray') })
    - c.set('log', child)
    │
    ▼
Handler executes, uses c.get('log').info(...)
    │
    ▼
Middleware after-handler:
    - ctx.executionCtx.waitUntil(logger.getTransport().flush())
    │
    ▼
Workers runtime: flush() runs after response sent, within execution context lifetime
```

### Key Data Flows Summary

1. **Log call → buffer:** Synchronous. Level gate → pipeline → write to buffer. Fast path, no I/O.
2. **Buffer → output:** Async. Triggered explicitly (flush call) or by size limit. I/O happens here.
3. **Context propagation:** Downward only — child inherits parent bindings at creation time. No upward propagation.
4. **Plugin mutations:** Entry object flows through pipeline. Plugins may enrich (add fields), redact (remove/mask), or drop (return null). No side effects to caller.

## Anti-Patterns

### Anti-Pattern 1: Synchronous I/O in write()

**What people do:** Call `console.log()` or `fs.writeSync()` directly inside the `write()` method, flushing on every log call.

**Why it's wrong:** Blocks the event loop on every log call. In high-throughput paths this is measurable overhead. In Workers, synchronous file writes don't exist at all.

**Do this instead:** `write()` always appends to the in-memory buffer. I/O only happens in `flush()`.

### Anti-Pattern 2: Timers in Transports

**What people do:** Use `setInterval(() => flush(), 5000)` inside the transport constructor for automatic periodic flushing.

**Why it's wrong:** Cloudflare Workers and other edge runtimes do not support persistent timers between requests. Timer-based auto-flush silently does nothing, entries are lost.

**Do this instead:** Make transports passive (write + flush only). Let the framework integration (Hono middleware) own the flush trigger via `waitUntil` or `finally` blocks.

### Anti-Pattern 3: Runtime Detection Inside Core

**What people do:** `if (typeof process !== 'undefined')` guards sprinkled through core to handle different runtimes.

**Why it's wrong:** Makes core untestable in isolation, bloats bundle with dead branches, couples core to runtime specifics.

**Do this instead:** Core uses only Web Platform APIs (`fetch`, `console.log`, `JSON.stringify`, `Date.now()`). Runtime-specific code lives exclusively in subpath entrypoints.

### Anti-Pattern 4: Mutable Shared Bindings

**What people do:** Child loggers mutate the parent's bindings object in place, or store a reference to the same object.

**Why it's wrong:** Child context bleeds into parent and sibling loggers. Debugging context contamination across concurrent requests is extremely painful.

**Do this instead:** Always shallow-copy bindings on `withContext()`. Each logger instance owns its bindings object exclusively.

### Anti-Pattern 5: God Logger with Conditional Branches for Features

**What people do:** Single Logger class with `if (this.hasHonoContext)` / `if (this.isWorker)` conditional branches for framework-specific behavior.

**Why it's wrong:** Core becomes runtime-aware and untestable. Adding one more runtime doubles the branch count. This is exactly the problem slog is extracted from wlog to solve.

**Do this instead:** Core is a pure data-flow component. Framework integrations compose core by creating child loggers and calling flush at the right time.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| core ↔ plugin pipeline | core calls `runPipeline(entry, plugins)` | pipeline module is a pure function — no state |
| core ↔ transport | core calls `transport.write(entry)` | transport is injected at logger creation; core holds an interface reference, not a concrete type |
| transport ↔ runtime | transport calls `fetch()` or `console.log()` | only Web Platform APIs — no runtime-specific imports in built-in transports |
| slog/hono ↔ core | imports `withContext` from core | one-way dependency: hono knows about core, core knows nothing about hono |
| slog/hono ↔ executionCtx | calls `ctx.executionCtx.waitUntil(flush())` | the only Workers-specific code in the codebase; isolated here intentionally |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| stdout / stderr | `console.log()` (portable across all runtimes) | Do NOT use `process.stdout.write` — not available in Workers or Deno by default |
| HTTP log endpoint | `fetch()` POST with JSON body | Available natively in Node 18+, Bun, Deno, Workers — no polyfill needed |
| npm registry | `npm publish` via CI | Requires `dist/` build artifact with type declarations |
| JSR registry | `jsr publish` via CI | Requires `jsr.json` config; prefers TypeScript sources directly |

## Suggested Build Order

Based on component dependencies, the implementation sequence is:

1. **types.ts** — Define `LogEntry`, `Plugin`, `Transport`, `Logger` interfaces. Everything depends on this.
2. **levels.ts** — Level name/number map and gate check. Depends only on types.
3. **pipeline.ts** — `runPipeline()` pure function. Depends on types.
4. **transport.ts** — `Transport` interface and optional base buffer class. Depends on types.
5. **transports/console.ts** — Simplest concrete transport. Validates the interface.
6. **core.ts** — Logger factory, `withContext()`. Assembles all of the above.
7. **transports/pretty.ts** — Depends on core being stable; formats the same entry shape.
8. **transports/http.ts** — Depends on core; uses `fetch()` — can be tested with mock fetch.
9. **hono.ts** — Depends on stable core API; imports Workers/Hono types only here.

This ordering ensures each phase builds on a stable interface and the most complex components (core, hono) are last.

## Sources

- [pino transports documentation](https://github.com/pinojs/pino/blob/main/docs/transports.md) — worker thread architecture, pipeline, multi-stream — HIGH confidence
- [pino child loggers documentation](https://github.com/pinojs/pino/blob/main/docs/child-loggers.md) — inheritance, binding concatenation — HIGH confidence
- [pino source entry point](https://github.com/pinojs/pino) — lib/proto, lib/levels, lib/tools component breakdown — HIGH confidence
- [LogTape comparison table](https://logtape.org/comparison) — feature matrix across winston/pino/bunyan, zero-dep universal runtime — HIGH confidence
- [LogTape GitHub](https://github.com/dahlia/logtape) — hierarchical sink architecture, library-first design — HIGH confidence
- [winston GitHub README](https://github.com/winstonjs/winston) — Logger/Format/Transport separation, `format.combine()` pipeline — HIGH confidence
- [structured-log pipeline](https://github.com/structured-log/structured-log) — enricher/filter/sink flow, BatchedSink buffer pattern — MEDIUM confidence
- [Cross-runtime JS library patterns 2025](https://debugg.ai/resources/js-runtimes-have-forked-2025-cross-runtime-libraries-node-bun-deno-edge-workers) — Web Platform API baseline, conditional exports, adapter isolation — MEDIUM confidence
- [LogLayer plugin architecture](https://loglayer.dev/) — plugin-as-middleware pattern for log transformation — MEDIUM confidence

---
*Architecture research for: structured logging library (slog)*
*Researched: 2026-03-20*
