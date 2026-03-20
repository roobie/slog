# Feature Research

**Domain:** Structured logging library for modern JavaScript runtimes
**Researched:** 2026-03-20
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Standard log levels: debug / info / warn / error (+ fatal/trace optional) | Every logging library has these; developers muscle-memory level names | LOW | slog's active requirements list debug/info/warn/error. fatal and trace are optional for v1 but absence will be noticed by power users |
| JSON-structured output by default | Modern log aggregators (Datadog, Loki, Cloud Logging) parse JSON; string output is nearly useless for production ops | LOW | slog's object-only API enforces this by design |
| Level filtering at runtime | Zero-overhead silencing of debug logs in production is a hard requirement | LOW | A `level` property on the logger is the standard interface |
| Timestamps on every entry | Log aggregators and correlation require chronological ordering | LOW | Should default to ISO 8601 or Unix epoch ms; configurable |
| Consistent log entry schema | Every entry must have at minimum: `level`, `time`, `message` (or equivalent) | LOW | Without a stable schema, log queries break on every deployment |
| Child logger / scoped context (`withContext`) | Per-request or per-component context enrichment without passing objects through every call site | MEDIUM | Pino calls this `.child()`, bunyan the same, consola uses `.withTag()`. slog calls it `withContext()` — well-aligned with ecosystem expectations |
| Pretty console output for development | Raw JSON in the terminal is hostile to developers during local development | LOW | Needs to be a separate transport/mode, not the default — pino's `pino-pretty`, consola's fancy reporter set this expectation |
| TypeScript types / full type safety | Every new JS library is expected to ship `.d.ts`; untyped loggers are rejected immediately | LOW | Source in TypeScript, ship declarations |
| Zero-config startup (`import, create, log`) | High friction bootstrap kills adoption; if the logger requires 30 lines of setup it will be skipped | LOW | pino and consola both satisfy this; slog explicitly targets this |
| Error serialization | `new Error()` does not JSON-serialize usefully; `{ message, stack, name }` extraction must happen automatically | LOW | Bunyan pioneered standard serializers for `err`; pino includes them |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Object-only API (no string shorthand) | Forces structured logging at call sites — prevents lazy `log.info('something happened')`. Makes accidental argument order swaps (`log.info(msg, obj)` vs `log.info(obj, msg)`) impossible at the type level | LOW | Pino supports both styles; that flexibility creates bugs. A GitHub issue in pino (#2033) explicitly requested dropping printf support for this reason. slog's approach is architecturally correct and safe |
| Plugin pipeline for transforming / filtering entries | Composable enrichment without forking the logger; allows per-installation customization (redaction, tracing, sampling) without baking it into core | MEDIUM | Winston has formatters/transforms; pino has hooks and mixins; neither is as clean as a first-class pipeline. This is slog's primary extension point |
| Buffer-then-flush transport pattern | Serverless / Cloudflare Workers execution model requires flushing before the process terminates; buffering also enables efficient HTTP batch transports | MEDIUM | Pino uses worker threads for this; that is not viable in Workers. slog's in-process buffer pattern is the correct solution for the target platform |
| Native Cloudflare Workers support | Workers has strict constraints: no filesystem, no persistent processes, `executionCtx.waitUntil()` for async work after response, `cf-ray` request IDs. Most loggers ignore this entirely | MEDIUM | hono-pino exists but is not designed for Workers. This is a real gap slog can own |
| Hono middleware with per-request context | Request-scoped logger creation, automatic request/response field injection, zero boilerplate in route handlers | MEDIUM | hono-pino provides this for pino but lacks Workers-native integration. slog/hono is a cleanly scoped subpath export |
| Runtime-agnostic core | Works identically on Node, Bun, Deno, and Cloudflare Workers without shims or conditional imports | MEDIUM | LogTape is the only other library that explicitly targets all four runtimes plus browsers. Winston and pino are effectively Node-only in practice |
| Subpath exports (single package, no monorepo) | Zero version coordination, simpler installation (`npm i slog`), no monorepo tooling overhead for consumers | LOW | Pino fragments into `pino`, `pino-http`, `pino-pretty`, `pino-noir` — each a separate install and version. slog unifies under one package |
| HTTP batch transport built-in | Allows shipping logs to any HTTP ingest endpoint (Better Stack, Axiom, custom) without a third-party agent | MEDIUM | Most libraries leave this to the ecosystem; having it first-party reduces integration friction |
| Dual publish to npm and JSR | JSR is the emerging standard for Deno and edge runtimes; npm-only libraries are invisible to Deno/JSR users | LOW | Very few libraries do this today; it signals runtime-agnostic intent |
| Explicit context over AsyncLocalStorage | More portable (ALS is not available in all Workers environments), more predictable, no "spooky action at a distance". Explicit `withContext()` chains are readable and traceable | LOW | Documented decision in PROJECT.md; defensible and differentiating for Workers use cases |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| String message shorthand (`log.info('message')`) | Feels ergonomic; familiar from `console.log` | Defeats structured logging at the call site; provides zero queryable data; pino's dual-mode API causes the `log.info(obj, msg)` vs `log.info(msg, obj)` order confusion that ships broken logs to production | Object-only API: `log.info({ message: 'text', ...context })` |
| printf / sprintf formatting (`log.info('user %s logged in', userId)`) | Familiar from C-style logging, reduces boilerplate | Makes the type signature `...any[]`; breaks IDE autocompletion; values end up embedded in the message string rather than as separate queryable fields | Structured fields: `log.info({ event: 'user_login', userId })` |
| AsyncLocalStorage-based implicit context propagation | Reduces need to pass logger through function parameters | Not available in all Cloudflare Workers environments; "spooky" — context appears/disappears based on async call graph topology; debugging broken context is hard | Explicit `withContext()` child loggers passed as parameters |
| File transport | Obvious for traditional servers | Serverless and Workers have no filesystem; including it adds code with zero utility for target platforms | HTTP batch transport or stdout; consumers on traditional servers can implement via custom transport interface |
| Log rotation / file management | Needed if writing to files | Not the logger's responsibility; creates operational coupling; OS-level tools (logrotate) or log shippers (fluentd, vector) handle this better | Delegate to infrastructure; document the boundary |
| Synchronous / blocking transports | "Simplicity" — each log write completes before continuing | Blocks the event loop; catastrophic under load; measured: winston (synchronous) is 10-15x slower than pino (async) at the same throughput | Async transports with buffer-then-flush; or worker threads in Node |
| Global singleton logger | Convenient; no DI required | Untestable; creates implicit shared state; makes log isolation in tests impossible without monkey-patching | Factory function returning logger instances; dependency-inject logger into services |
| Overly configurable log schemas | "Flexibility" — let users define their own field names | Schema fragmentation across teams; log aggregation queries break; tooling built around standard field names (`level`, `time`, `message`) stops working | Opinionated defaults with documented extension points; allow additional fields but not renaming core fields |
| Browser logging support | "Universal JS" argument | Different security model (users can see all logs in DevTools); different transport options; fundamentally different use case — server-side structured logging and browser logging solve different problems | Scope clearly to server-side runtimes; direct browser users to purpose-built browser loggers |
| Built-in sampling / rate limiting | Large-volume production need | Complex to configure correctly; sampling logic belongs at the transport/infrastructure layer where full context is available | Let consumers implement via the plugin pipeline; document the pattern |

## Feature Dependencies

```
Core logger (levels + JSON output)
    └──requires──> Entry schema (level, time, message)
    └──enables──> Child logger / withContext()
                      └──enables──> Hono middleware (per-request child)
                                        └──requires──> Buffer-then-flush transport

Plugin pipeline
    └──requires──> Core logger (entries flow through pipeline)
    └──enables──> Redaction plugin
    └──enables──> Sampling plugin
    └──enables──> Trace enrichment plugin

Transport system
    └──requires──> Core logger
    └──requires──> Buffer-then-flush pattern
    └──specializes──> Console transport (JSON stdout)
    └──specializes──> Pretty console transport (dev)
    └──specializes──> HTTP batch transport
                          └──requires──> Buffer-then-flush pattern

Cloudflare Workers support (waitUntil)
    └──requires──> Buffer-then-flush transport
    └──requires──> Hono middleware (executionCtx injection)

Subpath exports (slog/hono)
    └──requires──> Core logger stable API
    └──requires──> Hono middleware
```

### Dependency Notes

- **Entry schema requires core logger:** The schema is the contract everything else depends on; it must be stable before transport or plugin work begins.
- **Child logger / withContext() requires core logger:** Context merging only makes sense once the base entry structure is defined.
- **Hono middleware requires withContext():** Per-request scoping is built on the child logger primitive.
- **HTTP batch transport requires buffer-then-flush:** Batching is the entire reason to buffer; without it, you'd just HTTP POST on every log call.
- **Cloudflare Workers waitUntil requires buffer-then-flush:** Workers terminates the process after response; pending async work must be registered with `executionCtx.waitUntil()` to survive. The buffer flush is what gets handed to `waitUntil`.
- **Plugin pipeline requires stable entry schema:** Plugins transform entries; if the entry shape is not locked, plugins break on schema changes.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Core logger with debug/info/warn/error levels and level filtering — the reason the library exists
- [ ] Object-only API with stable entry schema (level, time, message + arbitrary fields) — the design bet that differentiates slog
- [ ] `withContext()` child logger with merged bindings — required by every real application before first use
- [ ] Plugin pipeline (transform/filter entries) — the primary extension point; needed before transports so transports can be implemented as plugins or sit after the pipeline
- [ ] Console transport (JSON to stdout) — the deployment transport; without it the library is not usable in production
- [ ] Pretty console transport (human-readable dev output) — required for developer adoption; hostile DX without it
- [ ] HTTP batch transport with buffer-then-flush — the target platform's (serverless / Workers) deployment transport
- [ ] `slog/hono` middleware with per-request context and `waitUntil` flush — the concrete integration that validates the entire design
- [ ] TypeScript source with full type declarations — non-negotiable for modern library adoption
- [ ] Zero dependencies — a core project constraint, not optional

### Add After Validation (v1.x)

Features to add once core is working and deployed.

- [ ] Redaction plugin (path-based field masking) — add when first consumer needs to handle PII or secrets; implement as first-party plugin to document the plugin API pattern
- [ ] `cf-ray` automatic injection in Hono middleware — nice-to-have for Workers deployments; low complexity once middleware exists
- [ ] Serializer support for `Error` objects — add when consumers report poor error output; straightforward to add to plugin pipeline

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Additional framework middleware (Express, Fastify, Elysia) — defer; validate Hono integration design first; other adapters follow the same pattern
- [ ] OpenTelemetry trace context injection — high value for distributed systems but requires understanding OTel SDK interaction; defer until consumer demand is clear
- [ ] AsyncLocalStorage opt-in mode — explicitly out of scope per PROJECT.md; reconsider only if Workers ALS support matures and consumer demand is strong
- [ ] Sampling plugin — complex to configure correctly; implement after understanding real-world log volume patterns from consumers

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core logger + levels + level filtering | HIGH | LOW | P1 |
| Object-only API + entry schema | HIGH | LOW | P1 |
| `withContext()` child logger | HIGH | LOW | P1 |
| Plugin pipeline | HIGH | MEDIUM | P1 |
| Console transport (JSON stdout) | HIGH | LOW | P1 |
| Pretty console transport | HIGH | LOW | P1 |
| HTTP batch transport + buffer-then-flush | HIGH | MEDIUM | P1 |
| `slog/hono` Hono middleware | HIGH | MEDIUM | P1 |
| TypeScript types | HIGH | LOW | P1 |
| Zero dependencies | HIGH | LOW (constraint, not a feature) | P1 |
| Dual npm + JSR publish | MEDIUM | LOW | P2 |
| Redaction plugin | MEDIUM | LOW | P2 |
| Error serializer | MEDIUM | LOW | P2 |
| `cf-ray` auto-injection | LOW | LOW | P2 |
| Additional framework middleware | MEDIUM | MEDIUM | P3 |
| OpenTelemetry integration | MEDIUM | HIGH | P3 |
| AsyncLocalStorage mode | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | pino | winston | bunyan | consola | roarr | slog approach |
|---------|------|---------|--------|---------|-------|---------------|
| JSON output by default | Yes | Optional (requires json format) | Yes | No (pretty default) | Yes | Yes — always structured |
| Object-only API | No (supports string + printf) | No | No | No | Partial (message + context object) | Yes — enforced by design |
| Child loggers | `.child()` | No native child | `.child()` | `.withTag()` (tags only, no arbitrary bindings) | `.child()` | `withContext()` with full binding merge |
| Plugin / transform pipeline | Hooks + serializers + formatters (fragmented) | Formats + transports (tightly coupled) | Serializers only | Custom reporters | None in-process | First-class plugin pipeline |
| Transport system | Worker threads (Node only) | Synchronous, multiple built-in transports | Stream-based | Reporter interface | External process only (stdout pipe) | In-process buffer-then-flush (cross-runtime) |
| Pretty dev output | `pino-pretty` (separate package) | Built-in, complex to configure | CLI tool (`bunyan` binary) | Built-in fancy reporter | External (`roarr` CLI) | First-party pretty transport |
| HTTP batch transport | Community packages | Built-in HTTP transport (single write, not batch) | Community | None | External | Built-in, batch with configurable flush |
| Cloudflare Workers support | Partial (no worker threads) | No | No | No | No | First-class with `waitUntil` |
| Hono middleware | `hono-pino` (third-party) | None | None | None | None | `slog/hono` first-party subpath export |
| Cross-runtime (Node/Bun/Deno/Workers) | Node-primary | Node only | Node only | Node + browser | Node + browser | Node + Bun + Deno + CF Workers |
| Zero dependencies | Yes (3.1KB gzip) | No (38.3KB, 17 deps) | No | No | No | Yes |
| TypeScript source | No (JS + d.ts) | No (JS + d.ts) | No | Yes | No | Yes |
| JSR publish | No | No | No | No | No | Yes (alongside npm) |
| Level filtering | Yes | Yes | Yes | Yes | Env var controlled | Yes |
| Error serialization | Built-in serializers | Manual configuration | Built-in serializers | Partial | None | Via plugin pipeline (P2) |
| Redaction | Built-in (`redact` option) | Manual | None | None | None | Via plugin pipeline (P2) |

## Sources

- [Pino API documentation](https://github.com/pinojs/pino/blob/main/docs/api.md) — HIGH confidence
- [LogTape comparison page](https://logtape.org/comparison) — HIGH confidence (official docs)
- [Better Stack: Top 8 Node.js logging libraries](https://betterstack.com/community/guides/logging/best-nodejs-logging-libraries/) — MEDIUM confidence
- [Sentry: JavaScript Logging Library Definitive Guide 2026](https://blog.sentry.io/javascript-logging-library-definitive-guide/) — MEDIUM confidence
- [Last9: Complete Guide to Node.js Logging Libraries 2025](https://last9.io/blog/node-js-logging-libraries/) — MEDIUM confidence
- [consola GitHub repository](https://github.com/unjs/consola) — HIGH confidence
- [bunyan GitHub repository](https://github.com/trentm/node-bunyan) — HIGH confidence
- [roarr GitHub repository](https://github.com/gajus/roarr) — HIGH confidence
- [pino GitHub issue #2033: Drop printf-style logging](https://github.com/pinojs/pino/issues/2033) — HIGH confidence (primary source for anti-feature rationale)
- [Pino v7 worker thread transport announcement](https://nearform.com/insights/pino7-0-0-pino-transport-worker-thread-transport/) — HIGH confidence
- [Cloudflare Workers Logs docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) — HIGH confidence
- [PkgPulse: consola vs tslog vs roarr 2026](https://www.pkgpulse.com/blog/consola-vs-tslog-vs-roarr-structured-logging-nodejs-2026) — LOW confidence (single source, no verification)

---
*Feature research for: structured logging library (slog)*
*Researched: 2026-03-20*
