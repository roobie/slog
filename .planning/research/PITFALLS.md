# Pitfalls Research

**Domain:** Universal JavaScript structured logging library (Node, Bun, Deno, Cloudflare Workers)
**Researched:** 2026-03-20
**Confidence:** HIGH — findings verified across multiple authoritative sources

---

## Critical Pitfalls

### Pitfall 1: Error Objects Serialize to Empty JSON

**What goes wrong:**
`JSON.stringify(new Error('boom'))` returns `{}`. JavaScript's `Error` object has non-enumerable properties (`message`, `name`, `stack`), so naive JSON serialization silently drops all useful information. A log entry that looks like `{"level":"error","err":{}}` is completely useless in production.

**Why it happens:**
Library authors assume objects serialize cleanly and defer error handling to the caller. Callers assume the logger handles it. Nobody writes the serializer.

**How to avoid:**
Implement a built-in error serializer that runs before transport. At minimum:
```typescript
function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { value: String(err) };
  return {
    type: err.constructor.name,
    message: err.message,
    stack: err.stack,
    // preserve any enumerable custom properties
    ...Object.fromEntries(
      Object.entries(err).filter(([k]) => !['message','stack','name'].includes(k))
    ),
  };
}
```
Apply this automatically to any field whose value is an `Error` instance in the plugin pipeline.

**Warning signs:**
- Tests that log errors and only assert level/message pass, but fields containing the Error object are never asserted
- No test case for `log.error({ err: new Error('x') })` checking `err.message` in output

**Phase to address:** Core logger phase — before any transport work. Must be part of the base serialization layer.

---

### Pitfall 2: Logs Silently Dropped in Cloudflare Workers Without waitUntil

**What goes wrong:**
HTTP batch transports (and any async work) are cancelled when the Worker sends its response. A `fetch()` call to a log drain that is not registered with `ctx.waitUntil()` will be silently terminated. Logs appear to work in local dev (where the process stays alive) but are lost in production Workers deployments.

**Why it happens:**
The Workers runtime terminates all outstanding promises once the response is delivered. Unlike Node.js where the process persists, Workers have no ambient event loop after response completion. Developers test locally and never observe the loss.

**How to avoid:**
The `slog/hono` middleware must capture `ctx` (the `ExecutionContext`) and pass it to the transport's flush mechanism. The flush call must be wrapped in `ctx.waitUntil()`:
```typescript
ctx.waitUntil(logger.flush());
```
The transport interface must support an explicit async `flush(): Promise<void>` method. The core logger must not assume synchronous delivery.

**Warning signs:**
- HTTP transport implementation has no `flush()` method
- Hono middleware does not call `ctx.waitUntil()`
- Integration tests run against Node.js only, never against a Workers simulator (Miniflare)

**Phase to address:** Transport system phase and Hono middleware phase. The `flush()` contract must be in the transport interface spec before any transport is implemented.

---

### Pitfall 3: Object Allocation on Disabled Log Levels

**What goes wrong:**
Even when a log level is filtered out, callers already paid the cost of object construction before calling the logger. Worse, the logger itself may allocate intermediate objects (merged context, timestamp, serialized fields) before checking the level. Under high throughput this creates GC pressure that manifests as latency spikes, not CPU usage — making it hard to diagnose as a logging problem.

**Why it happens:**
The level check is placed after context merging and field preparation rather than as the first operation. This is the natural "read top to bottom" implementation order.

**How to avoid:**
Level check must be the absolute first operation, before any allocation:
```typescript
log(level: Level, fields: Record<string, unknown>): void {
  if (level < this.minLevel) return;  // FIRST — zero alloc on hot path
  // ... rest of processing
}
```
Benchmark with level set to `error` while calling `log.debug()` in a tight loop. The result should be indistinguishable from no-op.

**Warning signs:**
- No benchmark for "disabled level" call throughput
- Context merge (`{ ...this.context, ...fields }`) happens before level check
- Timestamp generation happens before level check

**Phase to address:** Core logger phase. Enforce in code review — the level gate must be documented as an invariant.

---

### Pitfall 4: Subpath Exports TypeScript Type Resolution Breaks Consumer DX

**What goes wrong:**
`slog/hono` subpath export works at runtime but TypeScript consumers get "cannot find module" or resolves to `any`. The `types` condition in the exports map is either missing, in the wrong order, or points to a non-existent file. This is especially common with the `bundler` moduleResolution mode (used by Vite/esbuild consumers) versus `node16`/`nodenext`.

**Why it happens:**
The `exports` field has multiple condition resolution modes. TypeScript requires `"types"` to be listed before `"import"`/`"require"` within each condition block. Library authors get runtime working and assume types work too, but never test with `moduleResolution: bundler`.

**How to avoid:**
The exports map must follow this exact ordering per entry:
```json
"./hono": {
  "types": "./dist/hono/index.d.ts",
  "import": "./dist/hono/index.js"
}
```
Verify with `attw` (Are The Types Wrong?) tool after every build. Test type resolution under both `moduleResolution: node16` and `moduleResolution: bundler`.

**Warning signs:**
- No `attw` run in CI
- `types` condition listed after `import` condition in exports map
- Only tested type resolution with a single `tsconfig.json` setup
- `exports` field added but `typesVersions` not removed (they conflict)

**Phase to address:** Packaging phase. Validate before any publish to npm or JSR.

---

### Pitfall 5: JSR "Slow Types" Break Downstream TypeScript Performance

**What goes wrong:**
JSR actively warns about "slow types" — exported functions and values whose types are inferred by TypeScript rather than explicitly annotated. These cause JSR's documentation generator to fail and significantly degrade type-checking speed for all consumers who install the package. The package publishes successfully but users experience degraded IDE performance.

**Why it happens:**
TypeScript's type inference is powerful enough that developers rarely annotate return types explicitly. This is fine for applications but not for published libraries, where JSR has stricter requirements to protect consumers.

**How to avoid:**
All exported API surfaces must have explicit TypeScript annotations — function return types, parameter types, exported constants. Enable `"noImplicitAny": true` and consider a lint rule requiring explicit return types on public functions. Run `jsr publish --dry-run` in CI to catch slow type warnings before publish.

**Warning signs:**
- `jsr publish` output includes "slow types" warnings
- No explicit return type annotations on exported functions
- TypeScript compiler options don't enforce explicit annotations

**Phase to address:** Packaging phase, but type annotation discipline must start in the core logger phase.

---

### Pitfall 6: Buffer-Then-Flush Creates Silent Data Loss on Crash

**What goes wrong:**
The buffer-then-flush transport pattern works well for serverless but creates a dangerous failure mode for long-running processes: if the process crashes or is killed (SIGTERM), buffered logs that haven't been flushed are lost. The developer sees no errors — logs just silently vanish for the period before crash.

**Why it happens:**
The buffer is the right choice for Workers (where `waitUntil` handles it), but the same implementation applied to Node.js without a shutdown hook loses data. There's no built-in mechanism to flush on SIGTERM.

**How to avoid:**
For Node.js usage, document that consumers should register a shutdown hook:
```typescript
process.on('SIGTERM', async () => {
  await logger.flush();
  process.exit(0);
});
```
Consider whether the core logger should accept a `shutdownHook` option that auto-registers this, or whether it should be left to the consumer (per the project's "no magic" philosophy). Either way, document the pattern prominently.

**Warning signs:**
- HTTP transport tests only verify successful delivery, not crash-during-buffer scenarios
- No documentation on graceful shutdown patterns
- `flush()` is not part of the public API surface

**Phase to address:** Transport system phase. Define `flush()` as a required method on the transport interface.

---

### Pitfall 7: Mutable Shared Context Causes Log Corruption

**What goes wrong:**
`withContext()` appears to work but child loggers share a reference to the parent context object rather than copying it. Mutations to a parent logger's context after `withContext()` bleed into child logger output. This causes confusing logs where a child logger suddenly starts showing fields it shouldn't.

**Why it happens:**
```typescript
// Wrong: shares reference
withContext(extra: object) {
  this.context = { ...this.context, ...extra }; // spread is shallow
  return new Logger(this.context);  // passes reference
}
```
Spread is shallow — nested objects in context are still shared by reference.

**How to avoid:**
`withContext()` must create a new logger with a frozen, deep-copied context object. For the project's object-only flat context model (no nested logging objects), shallow copy + `Object.freeze()` is sufficient and avoids the deep clone cost:
```typescript
withContext(extra: Record<string, unknown>): Logger {
  return new Logger(Object.freeze({ ...this.context, ...extra }), this.options);
}
```

**Warning signs:**
- Tests for `withContext()` never mutate parent context after creating child
- Context type allows nested objects (increases risk of reference sharing)
- No `Object.freeze()` or equivalent immutability guard

**Phase to address:** Core logger phase. Write a regression test that mutates parent context after `withContext()` and verifies child is unaffected.

---

### Pitfall 8: Cross-Runtime `process` and `Buffer` References Break Non-Node Runtimes

**What goes wrong:**
Node-isms (`process.env`, `process.stdout`, `Buffer`, `__dirname`) referenced anywhere in the core package cause immediate failures in Deno, Cloudflare Workers, and Bun (where they are polyfilled inconsistently). Console transport writing to `process.stdout` instead of `console.log` is the most common example.

**Why it happens:**
Node.js muscle memory. Developers write `process.stdout.write(...)` because it's lower overhead than `console.log` in Node, but it doesn't exist in Workers.

**How to avoid:**
Core logger must exclusively use Web Platform APIs. For console output: `console.log()` works everywhere. For environment inspection: accept config explicitly rather than reading `process.env`. For binary data: `Uint8Array` not `Buffer`. Create a CI matrix that runs the test suite on Node LTS, Bun, and Deno — failures are immediately visible.

**Warning signs:**
- Any `import { ... } from 'node:...'` in core package files
- Any reference to `process`, `Buffer`, `__dirname` in non-Node-specific entrypoints
- CI only runs on Node

**Phase to address:** Core logger phase. Add cross-runtime CI job before any code is shipped.

---

### Pitfall 9: npm/JSR Version Drift Between Registries

**What goes wrong:**
The npm and JSR releases get out of sync — a patch is published to npm but the JSR version lags, or vice versa. Users on JSR get a different (often older) version of the package than users on npm. Bug reports become impossible to diagnose because the reporter's runtime determines which version they have.

**Why it happens:**
Dual publish requires two separate publish steps. Manual publish processes are forgotten under pressure. Automated CI publish pipelines often only target one registry.

**How to avoid:**
Both registries must be published atomically from a single CI workflow triggered by a git tag. Use a single script that runs `npm publish` and `jsr publish` in sequence (or parallel), and treats failure of either as a failed release. Never publish to one without the other.

**Warning signs:**
- Separate manual steps for npm vs JSR publish in the release guide
- No CI check verifying both registry versions match after release
- JSR version in `jsr.json` can drift from npm version in `package.json`

**Phase to address:** Release/publishing phase. Automate from the start — never rely on remembering to do both.

---

### Pitfall 10: Plugin Pipeline That Mutates Input Objects

**What goes wrong:**
Plugins receive the log entry object and mutate it directly (`entry.timestamp = Date.now()`). This works until two transports run in sequence and the second transport sees the modifications made by the first transport's plugin, or a plugin accidentally deletes fields another plugin was relying on. Debugging becomes extremely difficult.

**Why it happens:**
Mutation is the path of least resistance. It avoids object allocation. Plugin authors naturally write `entry.x = ...` rather than `return { ...entry, x: ... }`.

**How to avoid:**
Define plugins as pure transformers: `(entry: LogEntry) => LogEntry`. The pipeline executor must pass each plugin a frozen (or structurally copied) version of the entry and use the returned value. If performance requires mutation for the internal pipeline, convert to a new immutable object before passing to each plugin.

**Warning signs:**
- Plugin interface type is `void` return (signals mutation is expected)
- No test that runs two plugins and verifies the second plugin sees original fields
- No test for a plugin that accidentally returns `undefined`

**Phase to address:** Core logger phase — the plugin interface contract must be defined before any plugins are written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `JSON.stringify` directly for output | Simple to implement | Error objects log as `{}`, circular refs throw | Never — always use a safe serializer |
| Skipping `flush()` method on transport interface | Faster to ship first transport | Cannot support Workers `waitUntil` or graceful shutdown | Never — define interface correctly upfront |
| Hardcoding `console.log` calls in tests | Quick test setup | Tests pass on Node but CI never catches non-Node breakage | Never — add cross-runtime CI early |
| Publishing to npm only first, JSR later | Unblocks early users | JSR users get different version; dual-publish automation added late is painful | Only for a private beta before any public announcement |
| `Object.assign` context merge instead of spread+freeze | Marginally faster | Shared references cause context mutation bugs | Never in library code |
| Implicit `any` on exported plugin types | Less annotation burden | JSR slow types warnings; consumer type inference degrades | Never — annotate all public API surfaces |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Hono middleware | Forgetting to pass `ExecutionContext` to transport flush | Middleware must accept `ctx` and call `ctx.waitUntil(logger.flush())` |
| HTTP batch transport | Using `fetch()` inside Workers without `waitUntil` | Always wrap flush `fetch()` in `ctx.waitUntil()` |
| Cloudflare Workers | Using `process.stdout.write()` for console transport | Use `console.log()` — it works in all runtimes including Workers |
| JSR publish | Publishing TypeScript with inferred export types | All exported symbols need explicit type annotations to avoid slow-types errors |
| npm publish | `exports` field with `types` condition after `import` condition | `types` must be first in the condition object for TypeScript to resolve it |
| Deno consumers | Relative imports without extensions in core | Deno requires full extensions (`.ts`, `.js`) on imports when `package.json` is absent |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Level check after context merge | GC pauses under high request load despite no logging | Level check must be first statement in log method | At ~1000+ req/s with debug-level logs disabled |
| Spread operator on large context objects on every log call | Increased latency variance | Use immutable frozen context; only copy on `withContext()`, not on every `log()` call | Any non-trivial context size under sustained load |
| Synchronous JSON serialization of large objects | Request handler latency spike | Keep log entries small; document that transports should serialize off critical path | Payloads > 1KB logged at high frequency |
| HTTP transport per-log HTTP request (no batching) | Worker rate limits hit; external service overwhelmed | Batch transport must buffer and flush, not send per entry | Any production load > 10 logs/req |
| Circular JSON throw crashing the app | Unhandled exception in production from logging code | Use try/catch with fallback serializer around all `JSON.stringify` calls | Any object graph with circular references (e.g., Express `req`) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging full request bodies or `Authorization` headers by default | Credential leak in log drain / log storage | Hono middleware must never log request body or `Authorization` header by default; redact-list pattern for sensitive headers |
| Logging objects that contain `__proto__` keys | Prototype pollution if logs are parsed and merged back into app state | Sanitize log entry keys to exclude `__proto__`, `constructor`, `prototype` before transport |
| HTTP transport posting logs to configurable URL without HTTPS enforcement | Log drain MITM | Document that transport URL must use HTTPS; consider warning at config time if non-HTTPS URL provided |
| Using `eval()` or `Function()` in plugin/serializer pipeline | Remote code execution if log data influences plugin behavior | Never use dynamic code execution; plugins are pure functions |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Forcing users to configure a transport before any logging works | New users hit a silent no-op logger; nothing logs until transport is wired | Ship a default console transport active out-of-box; require opt-in to disable |
| Opaque plugin errors — plugin throws, entire log call fails silently | Production logs go dark without any indication why | Wrap plugin execution in try/catch; emit to stderr on plugin error rather than swallowing |
| Pretty transport enabled in non-TTY environments | JSON-parsing tooling breaks when pretty output goes to a pipe | Auto-detect TTY or require explicit `pretty: true` opt-in |
| No way to disable all logging for test environments | Tests emit noisy logs; suppressing requires monkey-patching | Support `logger.setLevel('silent')` or a `SLOG_LEVEL=silent` env convention |
| `withContext()` returns untyped logger | TypeScript users lose autocomplete after child logger creation | Generic typing: `withContext(extra: Record<string, unknown>): Logger` preserves full type |

---

## "Looks Done But Isn't" Checklist

- [ ] **Error serialization:** `log.error({ err: new Error('x') })` — verify `err.message` and `err.stack` appear in JSON output, not `{}`
- [ ] **Circular reference safety:** `const a = {}; a.self = a; log.info({ a })` — verify graceful handling, not a thrown exception
- [ ] **Level filtering:** Set level to `error`, call `log.debug()` 10,000 times — verify zero allocations on disabled path (use `--expose-gc` + manual GC trace)
- [ ] **Workers flush:** Deploy HTTP transport test to Miniflare — verify logs arrive at drain even after response is sent
- [ ] **Cross-runtime console:** Run console transport test on Node, Bun, Deno — all three must emit identical JSON
- [ ] **Subpath types:** Run `attw` on published package — zero errors under both `node16` and `bundler` moduleResolution
- [ ] **JSR slow types:** `jsr publish --dry-run` — zero slow-types warnings
- [ ] **Context immutability:** After `const child = parent.withContext({ x: 1 })`, mutate parent context — child must not reflect mutation
- [ ] **Plugin isolation:** Plugin that throws must not crash the logger or prevent other plugins from running
- [ ] **npm/JSR version parity:** After release, check both registries report identical version number

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Error serialization shipped as `{}` | MEDIUM | Ship patch release with error serializer; consumers who cached empty errors must re-run logging scenarios |
| Workers logs silently dropped (no waitUntil) | HIGH | Requires slog/hono update + all consumer Hono middleware updates; data already lost cannot be recovered |
| Types broken on subpath exports | MEDIUM | Patch release; consumers may need to clear TS cache / node_modules |
| JSR slow types in published version | LOW | Republish with annotations; JSR allows republishing same version? No — patch version bump required |
| npm/JSR version drift | MEDIUM | Publish catch-up version to lagging registry; document which version range was affected |
| Context mutation bug | HIGH | Requires investigating all production logs produced during affected period; patch release + context audit for consumers |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Error objects serialize to `{}` | Core logger | Test: assert `err.message` and `err.stack` present in output |
| Workers logs dropped without waitUntil | Transport system + Hono middleware | Integration test with Miniflare verifying log delivery post-response |
| Allocations on disabled log levels | Core logger | Benchmark: disabled-level call must be ~0ns allocation |
| Subpath exports TypeScript breakage | Packaging | `attw` passing in CI under multiple moduleResolution modes |
| JSR slow types | Packaging | `jsr publish --dry-run` clean in CI |
| Buffer flush on crash (Node) | Transport system | Document shutdown hook pattern; test graceful flush |
| Mutable shared context | Core logger | Regression test: mutate parent after `withContext()`, assert child unaffected |
| Cross-runtime `process`/`Buffer` references | Core logger | CI matrix: Node LTS + Bun + Deno + Miniflare |
| npm/JSR version drift | Release pipeline | CI: single workflow publishes to both; version check post-deploy |
| Plugin pipeline mutation | Core logger | Test: two plugins in sequence; second plugin sees original fields |

---

## Sources

- [JSR Publishing Packages docs](https://jsr.io/docs/publishing-packages) — slow types, ESM-only, export configuration
- [JSR npm compatibility docs](https://jsr.io/docs/npm-compatibility) — dual registry constraints
- [Cloudflare Workers Context/waitUntil docs](https://developers.cloudflare.com/workers/runtime-apis/context/) — 30s limit, Tail Workers recommendation
- [LogTape comparison](https://logtape.org/comparison) — performance benchmarks (Winston 701ns disabled vs LogTape 163ns), dependency proliferation pitfalls
- [JS Runtimes Have Forked 2025](https://debugg.ai/resources/js-runtimes-have-forked-2025-cross-runtime-libraries-node-bun-deno-edge-workers) — cross-runtime API differences, `Buffer` vs `Uint8Array`, Web Standards strategy
- [TypeScript in 2025 with ESM](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) — exports field complexity, dual publish friction
- [andrewbranch/example-subpath-exports-ts-compat](https://github.com/andrewbranch/example-subpath-exports-ts-compat) — TypeScript-friendly subpath exports strategies
- [Stringify and Parse Errors in JavaScript](https://dev.to/zirkelc/stringify-and-parse-errors-in-javascript-2lnh) — `JSON.stringify(error)` empty object problem
- [Beware of Using JSON.stringify for Logging](https://levelup.gitconnected.com/beware-of-using-json-stringify-for-logging-933f18626d51) — serialization gotchas
- [Cloudflare Community: event.waitUntil isn't really waiting](https://community.cloudflare.com/t/event-waituntil-isnt-really-waiting/70769) — practical Workers async pitfalls
- [Guide to package.json exports field](https://hirok.io/posts/package-json-exports) — condition ordering, TypeScript resolution

---
*Pitfalls research for: Universal JavaScript structured logging library (slog)*
*Researched: 2026-03-20*
