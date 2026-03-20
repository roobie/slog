# Phase 1: Core Foundation - Research

**Researched:** 2026-03-21
**Domain:** TypeScript structured logger — level gating, plugin pipeline, child loggers, built-in plugins
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry Schema**
- Timestamp stored as Unix milliseconds (`Date.now()`) — fast, compact, machine-friendly
- Ship a built-in plugin to convert timestamps to ISO 8601 for transports that want it
- `message` is an optional top-level field — pulled out of `data` if present, omitted if not
- Core entry shape: `{ level, timestamp, message?, context, data }`
- No `error` field in core schema — error serializer plugin owns error representation

**Plugin Contract**
- Plugins are sync — pipeline runs synchronously in the hot path
- Separate async post-process hook available for rare async needs (outside the sync pipeline)
- Plugin errors are caught: `console.warn` with error details, original entry passed to next plugin — logging must never crash
- Plugin shape is a named object: `{ name: string, transform: (entry) => entry | null }`
- Returning `null` drops the entry from all downstream processing

**API Surface**
- `createLogger()` accepts a single options object: `{ level?, plugins?, transports?, context? }`
- `withContext()` does shallow merge only (`Object.assign` semantics) — child overrides parent keys, no deep nesting
- Log methods (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) return `void` — fire-and-forget

**Built-in Plugins**
- Error serializer checks known keys only: `data.error` and `data.err` — convention-based, fast, predictable
- Serialized error shape: `{ name, message, stack }`
- Redaction matches field names via patterns: `['password', 'token', 'secret', /auth/i]`
- Redacted values replaced with fixed string `'[REDACTED]'`
- Level filter plugin: drop entries below a threshold
- Field enrichment plugin: add static key-value pairs to all entries

### Claude's Discretion
- Exact TypeScript generic signatures for plugin pipeline
- Internal buffering data structure (array vs ring buffer)
- Whether `createLogger()` with no args defaults to `info` or `debug` level
- Plugin pipeline execution order guarantees (FIFO assumed)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | Logger supports 6 levels: trace, debug, info, warn, error, fatal | Numeric level map (see Code Examples) enables O(1) comparison |
| CORE-02 | Level gate is the first operation — zero allocation for disabled levels | Early return before any object construction; benchmark pattern documented |
| CORE-03 | Object-only API: `log.info({ message: 'text', ...data })` | Destructure `message` from data at entry-construction time |
| CORE-04 | Consistent log entry schema: level, timestamp, message, context, data | Schema locked in decisions; Transport type defined here for Phase 2 |
| CORE-05 | `withContext()` creates child logger with merged immutable context | Shallow copy + Object.freeze prevents parent mutation leaking to child |
| CORE-06 | Logger factory with configurable minimum level and defaults | `createLogger(config?)` with sensible defaults documented below |
| CORE-07 | Zero-config startup: `createLogger()` works with no arguments | All config fields optional with defaults |
| PLUG-01 | Middleware pipeline for transforming/filtering log entries | Sync for-loop over `plugin.transform(entry)` calls; FIFO order |
| PLUG-02 | Plugins can modify entries, filter (return null to drop), or enrich | `null` check after each plugin invocation; pass original on error |
| PLUG-03 | Built-in error serialization plugin | Checks `data.error` and `data.err` keys; handles `instanceof Error` and plain objects |
| PLUG-04 | Built-in redaction plugin | Pattern array (string or RegExp); replaces matching top-level `data` keys with `'[REDACTED]'` |
| PLUG-05 | Built-in level filter plugin | Returns null when `entry.level` numeric value < threshold |
| PLUG-06 | Built-in field enrichment plugin | Spreads static fields into `entry.data` |
</phase_requirements>

## Summary

Phase 1 establishes the entire data contract that all subsequent phases depend on. The reference implementation (`wlog/index.ts`) proves the design in ~180 lines: numeric level map, destructured entry construction, sync plugin loop, `withContext()` via constructor re-use. slog's version diverges in two meaningful ways: (1) the plugin shape changes from a bare function to a named object `{ name, transform }` — enabling error reporting with plugin identity, and (2) six levels instead of four (adds `trace` and `fatal`).

The key insight for zero-cost disabled levels is that the level numeric comparison must happen before any object is constructed. `Date.now()`, spread operators, and context copies all allocate — they must live after the gate. The wlog reference violates this by extracting `message` and `error` before the gate; slog must not repeat this.

Built-in plugins are separate named exports, not bundled into the logger constructor. This keeps the core logger small and makes the plugin contract self-documenting. The error serializer in particular is critical infrastructure: `JSON.stringify(new Error())` silently produces `{}` — this must be solved at the plugin layer before any transport work begins.

**Primary recommendation:** Define all TypeScript interfaces first (`LogEntry`, `Plugin`, `Logger`, `Transport`), then implement the logger body, then implement the four built-in plugins as independent pure functions. The interface layer is the deliverable the rest of the project depends on.

## Standard Stack

### Core

No runtime dependencies. This phase is pure TypeScript with zero imports.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9.3 | Source language | `verbatimModuleSyntax`, strict ESM output, JSR compatibility |
| Vitest | 4.1.0 | Test runner | Node >= 20 required; fastest iteration for pure TS unit tests |

### Supporting (build tooling — not runtime deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsup | 8.5.1 | Build/bundle via esbuild | ESM output + `.d.ts` generation; needed when Phase 4 packaging begins |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain array buffer | Ring buffer | Ring buffer prevents unbounded growth but adds complexity; plain array is correct for Phase 1 (no production I/O yet) |
| Numeric level map | String comparison | Numeric comparison is O(1), branching on strings is slower and less readable |
| Named plugin object `{ name, transform }` | Bare function | Named object enables error messages with plugin identity: "plugin 'redact' threw: ..." |

**Installation (Phase 1 only — test runner + TypeScript):**
```bash
npm init -y
npm install --save-dev typescript vitest @types/node
npx tsc --init
```

**Version verification:** Versions confirmed from npm registry (2026-03-20):
- `typescript@5.9.3` (latest as of research date)
- `vitest@4.1.0` (latest stable; requires Node >= 20)

## Architecture Patterns

### Recommended Project Structure

```
src/
├── types.ts         # LogEntry, Plugin, Logger, Transport interfaces (pure types)
├── levels.ts        # LOG_LEVELS map, LogLevel type, numeric comparisons
├── logger.ts        # createLogger(), LoggerImpl, withContext()
└── plugins/
    ├── index.ts     # Re-exports all built-in plugins
    ├── errorSerializer.ts   # PLUG-03
    ├── redact.ts            # PLUG-04
    ├── levelFilter.ts       # PLUG-05
    └── fieldEnrich.ts       # PLUG-06
tests/
├── logger.test.ts   # CORE-01 through CORE-07
└── plugins/
    ├── errorSerializer.test.ts
    ├── redact.test.ts
    ├── levelFilter.test.ts
    └── fieldEnrich.test.ts
```

### Pattern 1: Zero-Allocation Level Gate

**What:** Numeric comparison before any object construction
**When to use:** Always — this is the single most important performance property

```typescript
// Source: wlog reference + CORE-02 requirement
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

private log(level: LogLevel, data: object): void {
  // GATE FIRST — nothing above this line allocates
  if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;

  // All allocation happens after the gate
  const { message, ...rest } = data as { message?: string };
  const entry: LogEntry = {
    level,
    timestamp: Date.now(),
    message,
    context: this.context,
    data: rest,
  };

  this.runPipeline(entry);
}
```

### Pattern 2: Named Plugin Object with Error Isolation

**What:** Plugin is `{ name: string, transform: (entry: LogEntry) => LogEntry | null }`; pipeline catches errors and passes original entry to next plugin
**When to use:** All plugin implementations

```typescript
// Source: CONTEXT.md plugin contract decisions
private runPipeline(entry: LogEntry): void {
  let current: LogEntry | null = entry;

  for (const plugin of this.plugins) {
    if (current === null) return; // dropped upstream

    let next: LogEntry | null;
    try {
      next = plugin.transform(current);
    } catch (err) {
      console.warn(`[slog] plugin "${plugin.name}" threw:`, err);
      next = current; // pass original, not undefined
    }
    current = next;
  }

  if (current !== null) {
    this.buffer.push(current);
  }
}
```

### Pattern 3: Immutable Child Logger Context

**What:** `withContext()` shallow-copies parent context then freezes it; child gets a new `LoggerImpl` instance sharing same plugins/transports references
**When to use:** Every `withContext()` call

```typescript
// Source: CONTEXT.md + CORE-05 requirement
withContext(extraContext: Record<string, unknown>): Logger {
  const frozenContext = Object.freeze(
    Object.assign({}, this.context, extraContext)
  );
  return new LoggerImpl({
    minLevel: this.minLevel,
    plugins: this.plugins,     // same array reference — intentional
    transports: this.transports, // same array reference — intentional
    context: frozenContext,
  });
}
```

**Why freeze:** Prevents parent mutation from affecting child. The CONTEXT.md success criterion explicitly tests this: "mutating the parent's context object after child creation does not affect the child."

Note: plugins and transports arrays are shared by reference (not copied). This is intentional — all children of a logger share the same pipeline. If a plugin is added to the parent after child creation, the child will also see it. This is the expected behavior for a context-propagation API.

### Pattern 4: Transport Interface (type only in Phase 1)

**What:** Define the `Transport` type in Phase 1 so the logger can accept transports in config even though no concrete transports ship until Phase 2
**When to use:** Define in `types.ts`; `LoggerImpl` accepts `transports?: Transport[]` and stores them in buffer flush logic

```typescript
// Source: REQUIREMENTS.md TRAN-01
export interface Transport {
  write(entry: LogEntry): void;
  flush(): Promise<void>;
}
```

Note: wlog used `Transport = (entries: LogEntry[]) => Promise<void>` (batch function). The slog design uses a stateful interface `{ write, flush }` where the transport manages its own buffer. This is the locked design from the requirements (`TRAN-01`: "Transport interface with `flush(): Promise<void>` contract").

### Anti-Patterns to Avoid

- **Allocating before the level gate:** Any `Object.assign`, spread, or `Date.now()` before the level check defeats CORE-02. Keep the gate as the absolute first statement.
- **Mutable context object in child logger:** Not using `Object.freeze` allows code like `logger.context.userId = 123` to silently mutate a child's context. Use freeze.
- **Async plugin pipeline in the hot path:** wlog used `async processPipeline` with `await plugin(current)`. The slog design is sync — no async in the pipeline. If a plugin needs async, it must use the post-process hook (out of Phase 1 scope). Do not introduce async in `runPipeline`.
- **Error field in core schema:** wlog had `error?` as a top-level `LogEntry` field. slog removes it — errors live in `data.error` or `data.err` and are normalized by the error serializer plugin. Do not add `error` back to the schema.
- **Logging errors with `console.error` in plugin catch:** Use `console.warn` per the decisions. `console.error` in a logger's internal path is surprising noise.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error object extraction | Custom `instanceof` tree | `errorSerializer` built-in plugin pattern | Non-enumerable properties, circular refs, subclass names all need explicit handling |
| Sensitive field masking | Ad-hoc key checks | `redact` built-in plugin with pattern array | String + RegExp pattern matching is non-trivial to get right safely |
| Timestamp formatting | Inline `new Date().toISOString()` | Timestamp ISO plugin (built-in) | Timestamp format is transport-specific; core stores ms int, transport converts |

**Key insight:** The plugin pipeline exists precisely so these cross-cutting concerns don't contaminate the core logger. Each built-in plugin is a standalone pure function — it can be tested in complete isolation.

## Common Pitfalls

### Pitfall 1: `JSON.stringify(new Error())` returns `{}`

**What goes wrong:** Error objects have non-enumerable properties (`message`, `stack`, `name`). Standard JSON serialization produces an empty object. A logger that does not handle this will silently drop all error information.
**Why it happens:** JavaScript's `JSON.stringify` only serializes enumerable own properties.
**How to avoid:** The `errorSerializer` plugin explicitly reads `error.message`, `error.name`, `error.stack` — bypassing JSON serialization entirely.
**Warning signs:** Test `log.error({ error: new Error('test') })` and verify `error.message` appears in the buffered entry. If the entry shows `error: {}`, the serializer is not running.

```typescript
// Correct error serialization
function serializeError(val: unknown): { name: string; message: string; stack?: string } {
  if (val instanceof Error) {
    return { name: val.name, message: val.message, stack: val.stack };
  }
  if (typeof val === 'object' && val !== null) {
    return { name: 'Error', message: JSON.stringify(val) };
  }
  return { name: 'Error', message: String(val) };
}
```

### Pitfall 2: Parent context mutation corrupts child loggers

**What goes wrong:** `withContext()` returns a child, then the parent's context object is mutated externally. If the child holds a reference to the same object, it sees the mutation.
**Why it happens:** JavaScript objects are passed by reference. A naive spread (`{ ...this.context, ...extra }`) creates a new object but doesn't prevent the new object from being mutated afterward.
**How to avoid:** `Object.freeze(merged)` before storing as `this.context`. Vitest test: create child, mutate parent context variable, assert child entry has original values.
**Warning signs:** Success criterion 3 in phase description explicitly tests this. It is a regression test, not a "nice to have."

### Pitfall 3: Plugin pipeline mutates entry in place

**What goes wrong:** A plugin that does `entry.data.userId = 'redacted'` mutates the entry object. If a subsequent plugin runs on the same reference, the mutation is visible and order-dependent.
**Why it happens:** JavaScript objects are mutable by default.
**How to avoid:** Plugins should return new objects: `return { ...entry, data: { ...entry.data, [key]: '[REDACTED]' } }`. Document this in the plugin contract.
**Warning signs:** A test that adds two plugins where the second reads a field the first modified will fail non-deterministically if mutation semantics are relied upon.

### Pitfall 4: Six-level numeric map off-by-one

**What goes wrong:** Adding `trace` (0) and `fatal` (5) to the four wlog levels means any code ported from wlog with hardcoded numeric comparisons will be wrong.
**Why it happens:** wlog uses `debug=0, info=1, warn=2, error=3`. slog adds `trace=0` which shifts everything up by one, or adds `fatal=5` at the top.
**How to avoid:** Use the string level names everywhere in code. Only the `LOG_LEVELS` map itself uses numbers. Never compare against `1`, `2`, etc. in application code.
**Warning signs:** A test filtering at `info` that accidentally passes `debug` entries.

### Pitfall 5: Shared plugin/transport array mutation

**What goes wrong:** Because `withContext()` shares the plugins array by reference, code that calls `this.plugins.push(newPlugin)` on a child logger will also affect the parent and all siblings.
**Why it happens:** Intentional sharing of the array reference (avoids copying the pipeline on every child).
**How to avoid:** The `Logger` interface must not expose a `addPlugin()` method that mutates the shared array. All plugin configuration is done at construction time via `createLogger({ plugins: [...] })`. Document this as a design constraint.
**Warning signs:** Any method on `Logger` that modifies `this.plugins` directly.

## Code Examples

### Complete Type Definitions

```typescript
// Source: CONTEXT.md decisions + REQUIREMENTS.md

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export interface LogEntry {
  level: LogLevel;
  timestamp: number;        // Unix ms — Date.now()
  message?: string;         // optional; extracted from data if present
  context: Record<string, unknown>;  // frozen shallow copy
  data: Record<string, unknown>;     // remaining fields after message extraction
}

export interface Plugin {
  name: string;
  transform(entry: LogEntry): LogEntry | null;
}

export interface Transport {
  write(entry: LogEntry): void;
  flush(): Promise<void>;
}

export interface Logger {
  trace(data: object): void;
  debug(data: object): void;
  info(data: object): void;
  warn(data: object): void;
  error(data: object): void;
  fatal(data: object): void;
  withContext(context: Record<string, unknown>): Logger;
  flush(): Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel;
  plugins?: Plugin[];
  transports?: Transport[];
  context?: Record<string, unknown>;
}
```

### Built-in Plugin: Error Serializer (PLUG-03)

```typescript
// Checks data.error and data.err — convention-based per CONTEXT.md
export const errorSerializer: Plugin = {
  name: 'errorSerializer',
  transform(entry: LogEntry): LogEntry {
    const data = { ...entry.data };
    let mutated = false;

    for (const key of ['error', 'err'] as const) {
      if (key in data && data[key] != null) {
        data[key] = serializeError(data[key]);
        mutated = true;
      }
    }

    return mutated ? { ...entry, data } : entry;
  },
};
```

### Built-in Plugin: Redaction (PLUG-04)

```typescript
// Patterns: string (exact key match) or RegExp (test against key name)
export function createRedactPlugin(
  patterns: Array<string | RegExp>
): Plugin {
  return {
    name: 'redact',
    transform(entry: LogEntry): LogEntry {
      const data = { ...entry.data };
      let mutated = false;

      for (const key of Object.keys(data)) {
        const shouldRedact = patterns.some((p) =>
          typeof p === 'string' ? p === key : p.test(key)
        );
        if (shouldRedact) {
          data[key] = '[REDACTED]';
          mutated = true;
        }
      }

      return mutated ? { ...entry, data } : entry;
    },
  };
}
```

### Built-in Plugin: Level Filter (PLUG-05)

```typescript
export function createLevelFilterPlugin(minLevel: LogLevel): Plugin {
  const threshold = LOG_LEVELS[minLevel];
  return {
    name: 'levelFilter',
    transform(entry: LogEntry): LogEntry | null {
      return LOG_LEVELS[entry.level] >= threshold ? entry : null;
    },
  };
}
```

### Built-in Plugin: Field Enrichment (PLUG-06)

```typescript
export function createFieldEnrichPlugin(
  fields: Record<string, unknown>
): Plugin {
  const frozenFields = Object.freeze({ ...fields });
  return {
    name: 'fieldEnrich',
    transform(entry: LogEntry): LogEntry {
      return { ...entry, data: { ...entry.data, ...frozenFields } };
    },
  };
}
```

### Default Level Decision (Claude's Discretion)

**Recommendation:** Default to `info`.

Rationale: `debug` produces high-volume output including internal subsystem traces. In production (the primary deployment target — Cloudflare Workers), `debug` would produce noise that overwhelms the signal. Users who want verbose output opt in explicitly. This matches pino's default (`info`) and wlog's default (`info`). A zero-config logger should be production-safe by default.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wlog: async plugin pipeline (`await plugin(entry)`) | slog: sync pipeline, async only in post-process hook | Phase 1 decision | Hot path is synchronous; no microtask overhead per entry |
| wlog: bare function plugin `(entry) => entry\|null` | slog: named object `{ name, transform }` | Phase 1 decision | Error messages include plugin identity |
| wlog: 4 levels (debug/info/warn/error) | slog: 6 levels (trace/debug/info/warn/error/fatal) | Phase 1 design | Aligns with pino/winston conventions; `trace` for verbose debugging, `fatal` for process-killing errors |
| wlog: error field in core schema | slog: error lives in `data.error`/`data.err`, normalized by plugin | Phase 1 decision | Core schema is stable; error representation is transport-specific |
| wlog: `flush()` on logger with buffer | slog: buffer on logger, `flush()` delegates to transports | Same pattern | Phase 1 defines `Transport.flush()` contract even though no transports ship yet |

**Deprecated/outdated (from wlog, do not port):**
- `addTimestamp()` plugin: wlog had this as a no-op placeholder; slog stores timestamp as `Date.now()` in core, no plugin needed
- `levelFilterTransport()`: wlog had this as a transport wrapper; slog has `createLevelFilterPlugin()` in the plugin pipeline instead
- `honoLogger()`: lives in `slog/hono` subpath, not in core

## Open Questions

1. **Plugin pipeline: does `withContext()` share the plugins array or copy it?**
   - What we know: CONTEXT.md says `withContext()` does shallow merge of context only
   - What's unclear: If a user does `const child = logger.withContext({x:1}); child.plugins.push(...)` — should that affect the parent?
   - Recommendation: Share by reference (same as wlog). Never expose a `plugins` property on the `Logger` interface — plugins are configuration-time only. This eliminates the ambiguity.

2. **Default level: `info` vs `debug`?**
   - What we know: Claude's discretion; wlog defaults to `info`; production-safe default is `info`
   - Recommendation: `info`. Document in JSDoc.

3. **Should `createLogger()` buffer entries when no transports are configured?**
   - What we know: Phase 1 is "no I/O" — entries are buffered in memory only
   - What's unclear: Should the buffer grow unbounded if `flush()` is never called?
   - Recommendation: Yes, buffer normally. The buffer is a plain array. The caller is responsible for calling `flush()` (or using a transport that does). Document the unbounded growth behavior — it is expected in Phase 1 and addressed by transports in Phase 2.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` — Wave 0 creates this |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | Logger has trace/debug/info/warn/error/fatal methods | unit | `npx vitest run tests/logger.test.ts -t "log levels"` | Wave 0 |
| CORE-02 | Disabled level produces zero side effects / no buffer entry | unit | `npx vitest run tests/logger.test.ts -t "level gate"` | Wave 0 |
| CORE-03 | `log.info({ message: 'text', userId: 1 })` accepted; message extracted | unit | `npx vitest run tests/logger.test.ts -t "object-only api"` | Wave 0 |
| CORE-04 | Buffered entry has shape `{ level, timestamp, message?, context, data }` | unit | `npx vitest run tests/logger.test.ts -t "entry schema"` | Wave 0 |
| CORE-05 | Child logger merges context; parent mutation after creation has no effect | unit | `npx vitest run tests/logger.test.ts -t "withContext"` | Wave 0 |
| CORE-06 | `createLogger({ level: 'warn' })` filters out debug/info | unit | `npx vitest run tests/logger.test.ts -t "configurable level"` | Wave 0 |
| CORE-07 | `createLogger()` with no args produces working logger | unit | `npx vitest run tests/logger.test.ts -t "zero-config"` | Wave 0 |
| PLUG-01 | Plugin array is executed in FIFO order | unit | `npx vitest run tests/plugins/pipeline.test.ts` | Wave 0 |
| PLUG-02 | Plugin returning null drops entry; plugin modifying entry reflects downstream | unit | `npx vitest run tests/plugins/pipeline.test.ts -t "null drops"` | Wave 0 |
| PLUG-03 | `data.error: new Error('x')` becomes `{ name, message, stack }` in buffered entry | unit | `npx vitest run tests/plugins/errorSerializer.test.ts` | Wave 0 |
| PLUG-04 | `data.password` becomes `'[REDACTED]'`; RegExp patterns match | unit | `npx vitest run tests/plugins/redact.test.ts` | Wave 0 |
| PLUG-05 | Level filter plugin drops entries below threshold | unit | `npx vitest run tests/plugins/levelFilter.test.ts` | Wave 0 |
| PLUG-06 | Field enrichment adds static fields to all entries | unit | `npx vitest run tests/plugins/fieldEnrich.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/logger.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `package.json` — npm init with TypeScript + Vitest dev dependencies
- [ ] `tsconfig.json` — TypeScript config with `verbatimModuleSyntax`, `strict`, `ESNext` target
- [ ] `vitest.config.ts` — minimal Vitest config pointing at `tests/`
- [ ] `tests/logger.test.ts` — covers CORE-01 through CORE-07
- [ ] `tests/plugins/pipeline.test.ts` — covers PLUG-01, PLUG-02
- [ ] `tests/plugins/errorSerializer.test.ts` — covers PLUG-03
- [ ] `tests/plugins/redact.test.ts` — covers PLUG-04
- [ ] `tests/plugins/levelFilter.test.ts` — covers PLUG-05
- [ ] `tests/plugins/fieldEnrich.test.ts` — covers PLUG-06
- [ ] Framework install: `npm install --save-dev typescript vitest @types/node`

## Sources

### Primary (HIGH confidence)

- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — Reference implementation; direct inspection of production-proven patterns
- `.planning/phases/01-core-foundation/01-CONTEXT.md` — Locked decisions from user discussion; authoritative
- `.planning/REQUIREMENTS.md` — Requirement IDs and descriptions; authoritative
- `.planning/research/SUMMARY.md` — Domain research with HIGH confidence findings; tsup 8.5.1, Vitest 4.1.0, TypeScript 5.9.3 versions verified from npm registry

### Secondary (MEDIUM confidence)

- pino API docs (referenced in SUMMARY.md) — Level numeric map pattern; child logger design
- LogTape comparison page (referenced in SUMMARY.md) — Plugin-as-middleware pattern; cross-runtime patterns

### Tertiary (LOW confidence)

None for this phase — all findings are grounded in the reference implementation and locked decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified from npm registry in project-level research (2026-03-20)
- Architecture: HIGH — directly derived from reference implementation + locked decisions in CONTEXT.md; no speculation
- Pitfalls: HIGH — Pitfall 1 (`{}` error serialization) verified from MDN + multiple sources in project research; others derived from direct code inspection of wlog
- Test plan: HIGH — all tests map 1:1 to requirement IDs with runnable commands

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (stable TypeScript library patterns; stack versions may drift but architecture is not version-sensitive)
