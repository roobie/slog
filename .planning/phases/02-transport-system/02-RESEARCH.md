# Phase 2: Transport System - Research

**Researched:** 2026-03-21
**Domain:** TypeScript transport implementations — NDJSON, ANSI terminal formatting, HTTP batch with retry
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Console Transport (JSON)
- Console method mapping: trace→log, debug→log, info→info, warn→warn, error→error, fatal→error
- Output format: single-line NDJSON — one `JSON.stringify(entry)` per line
- Keep LogEntry schema as-is — separate `context` and `data` objects (no flattening)
- Timestamp stays as Unix ms in JSON output (aggregators parse this natively)
- Undefined/optional fields omitted (JSON.stringify naturally drops undefined — no `message` field if not set)

#### Pretty Console Transport
- Timestamp format: ISO 8601 (`2026-03-21T10:23:45.123Z`)
- Level display: ANSI colored text (no emojis) — e.g. green INFO, yellow WARN, red ERROR
- Data display: inline key=value format (logfmt-style) — `userId=123 action="login"`
- All output via console methods matching the same level mapping as JSON transport

#### HTTP Batch Transport
- Request body format: NDJSON (newline-delimited JSON) — streamable, matches Loki/Datadog ingest
- Flush behavior: configurable — default flush-only (passive, caller controls timing), opt-in auto-timer for long-lived processes
- Failure handling: retry once after POST failure, then log error and drop entries — logging must not block the app
- Config: `{ url: string, headers?: Record<string, string>, flushInterval?: number }`
- Uses `fetch()` — available in all target runtimes (Node 18+, Bun, Deno, Workers)

#### Level-Routed Transport
- Routing via predicate function: `(entry: LogEntry) => boolean` per transport — most composable, users can build threshold/map routing from this primitive
- Unmatched entries dropped silently — routing is opt-in per transport
- Shape: `createRoutedTransport(routes: Array<{ predicate: (entry) => boolean, transport: Transport }>)`
- An entry can match multiple routes (sent to all matching transports)

### Claude's Discretion
- ANSI color codes for each level in pretty transport
- Whether pretty transport truncates long data values
- HTTP batch transport: exact retry delay
- Auto-timer cleanup on process exit for long-lived processes

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRAN-01 | Transport interface with `flush(): Promise<void>` contract | Already defined in `src/types.ts` — `write(entry): void` + `flush(): Promise<void>` |
| TRAN-02 | Console transport (JSON.stringify each entry to appropriate console method) | Factory function pattern, level-mapped console methods, NDJSON output |
| TRAN-03 | Pretty console transport (human-readable with colors, timestamps, formatted data) | ANSI escape codes, ISO 8601 timestamps, logfmt-style key=value serialization |
| TRAN-04 | HTTP batch transport (POST entries to configurable endpoint with headers and batch size) | `fetch()` API, NDJSON body, retry-once pattern, optional auto-timer |
| TRAN-05 | Built-in level-routed transport wrapper (route levels to different transports) | Predicate-based routing, `createRoutedTransport()` factory, multi-match semantics |
| TRAN-06 | Buffer-then-flush pattern: entries buffered in memory, sent to transports on flush() | Already implemented in `logger.ts` — transports receive entries via `write()` then `flush()` |
| TRAN-07 | Transport errors caught and logged to console — one transport failure does not block others | `Promise.allSettled` already used in `logger.ts:flush()` for `flush()` calls; `write()` errors need try/catch in transport implementations |
</phase_requirements>

## Summary

Phase 2 implements the three concrete transports and one combinator that give slog its output capabilities. The interface contract is already defined in `src/types.ts` and the buffer-then-flush orchestration is already in `src/logger.ts`. This phase is purely additive: new files under `src/transports/`, exported from `src/index.ts`.

The key architectural insight from reading the existing code: `logger.ts:flush()` calls `transport.write(entry)` synchronously in a plain for-loop with no error isolation, then calls `transport.flush()` wrapped in `Promise.allSettled`. This means `write()` errors thrown synchronously WILL propagate up and break the flush loop. Transport implementations that buffer internally (HttpBatch) keep `write()` as a simple array push (infallible), deferring all I/O — and failure risk — to `flush()` where `Promise.allSettled` catches it. ConsoleTransport and PrettyTransport call console methods in `write()` which are effectively infallible. This is correct as-is, but the planner should note it explicitly.

The reference wlog implementation uses a different transport signature (`(entries: LogEntry[]) => Promise<void>`) — slog's interface is split (`write` + `flush`) which is a deliberate improvement for the buffer-then-flush pattern. Do not copy wlog's transport shape.

**Primary recommendation:** Three factory files in `src/transports/` (console.ts, pretty.ts, http.ts) plus a combinator (routed.ts), all exported via `src/transports/index.ts`, then re-exported from `src/index.ts`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `console` | built-in | ConsoleTransport and PrettyTransport output | Universal across all target runtimes |
| Native `fetch` | built-in | HttpBatchTransport HTTP POST | Available Node 18+, Bun, Deno, Workers — matches project constraint |
| ANSI escape codes | built-in string literals | PrettyTransport coloring | Zero deps, well-understood, universally supported in target runtimes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `LOG_LEVELS` from `src/levels.ts` | existing | Numeric level comparison in routing predicates | Use in `atOrAboveLevel()` helper predicate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw ANSI escape codes | `chalk` / `kleur` | Both require a dependency — PACK-01 forbids runtime deps |
| `fetch()` | `node:http` / `axios` | `fetch()` is universal; `node:http` is Node-only; axios is a dependency |
| NDJSON body | JSON array body | NDJSON is streamable, matches Loki/Datadog/Elasticsearch bulk — locked decision |

**Installation:** No new packages needed. All functionality uses built-in platform APIs.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── transports/
│   ├── console.ts       # createConsoleTransport()
│   ├── pretty.ts        # createPrettyTransport()
│   ├── http.ts          # createHttpBatchTransport()
│   ├── routed.ts        # createRoutedTransport() + atOrAboveLevel() helper
│   └── index.ts         # barrel re-export
├── types.ts             # Transport interface (already exists)
├── logger.ts            # Buffer-then-flush (already exists)
├── levels.ts            # LOG_LEVELS map (already exists)
├── plugins/             # (already exists)
└── index.ts             # add transports/* to exports
```

### Pattern 1: Factory Function Returns Transport Object

Every transport is a factory function that closes over config and returns a `Transport`-satisfying object literal. This matches the plugin pattern already established in Phase 1.

```typescript
// Source: existing plugin pattern in src/plugins/errorSerializer.ts
export function createConsoleTransport(): Transport {
  return {
    write(entry: LogEntry): void {
      const method = CONSOLE_METHOD[entry.level];
      console[method](JSON.stringify(entry));
    },
    async flush(): Promise<void> {
      // console is synchronous — nothing to flush
    },
  };
}
```

### Pattern 2: HTTP Transport Buffers in `write()`, Sends in `flush()`

`write()` must be synchronous per the interface. HttpBatchTransport does a simple array push in `write()` and performs all I/O (fetch, retry) in `flush()`. This aligns with how `logger.ts` uses the interface and ensures all async work is inside `flush()` where `Promise.allSettled` can catch failures.

```typescript
export function createHttpBatchTransport(config: HttpBatchTransportConfig): Transport {
  const buffer: LogEntry[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;

  if (config.flushInterval) {
    // timer setup — see Pitfall 3 for cleanup
  }

  return {
    write(entry: LogEntry): void {
      buffer.push(entry);   // infallible — no I/O here
    },
    async flush(): Promise<void> {
      if (buffer.length === 0) return;
      const entries = buffer.splice(0, buffer.length);
      const body = entries.map(e => JSON.stringify(e)).join('\n');
      // attempt + one retry — see retry pattern below
    },
  };
}
```

### Pattern 3: Pretty Transport — logfmt-style Key=Value Serialization

The locked decision specifies `userId=123 action="login"` inline format. Values containing spaces or special characters need quoting; simple scalars can be bare. Objects should be JSON-stringified inline.

```typescript
function formatValue(val: unknown): string {
  if (typeof val === 'string') {
    return /[\s"=]/.test(val) ? JSON.stringify(val) : val;
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

function formatFields(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(' ');
}
```

### Pattern 4: Predicate-Based Routing

`createRoutedTransport` collects entries during `write()` and fans them out to all matching transports during `flush()`. The combinator itself is a `Transport`.

```typescript
export interface TransportRoute {
  predicate: (entry: LogEntry) => boolean;
  transport: Transport;
}

export function createRoutedTransport(routes: TransportRoute[]): Transport {
  return {
    write(entry: LogEntry): void {
      for (const { predicate, transport } of routes) {
        if (predicate(entry)) {
          transport.write(entry);
        }
      }
    },
    async flush(): Promise<void> {
      // Flush only transports that may have received entries
      await Promise.allSettled(routes.map(r => r.transport.flush()));
    },
  };
}
```

**Convenience predicates** (ship alongside `createRoutedTransport`):

```typescript
import { LOG_LEVELS } from '../levels.ts';
import type { LogLevel, LogEntry } from '../types.ts';

export function atOrAboveLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const min = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] >= min;
}

export function exactLevel(level: LogLevel): (entry: LogEntry) => boolean {
  return (entry) => entry.level === level;
}
```

### Pattern 5: Level-to-Console-Method Mapping

Used by both ConsoleTransport and PrettyTransport. Define once, import from a shared location or duplicate within the transport file (both are fine given the small size).

```typescript
const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  trace: 'log',
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};
```

### Pattern 6: ANSI Color Codes (Claude's Discretion)

Recommended color assignments for level text (foreground colors, reset after level label only):

```typescript
const LEVEL_COLOR: Record<LogLevel, string> = {
  trace: '\x1b[2m',    // dim
  debug: '\x1b[36m',   // cyan
  info: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  fatal: '\x1b[35m',   // magenta
};
const RESET = '\x1b[0m';
```

Pretty output line format:
```
2026-03-21T10:23:45.123Z [INFO]  Request completed userId=123 duration=45
```

Full line construction:
```typescript
const ts = new Date(entry.timestamp).toISOString();
const coloredLevel = `${LEVEL_COLOR[entry.level]}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
const msg = entry.message ?? '';
const fields = [
  ...Object.entries(entry.context),
  ...Object.entries(entry.data),
].map(([k, v]) => `${k}=${formatValue(v)}`).join(' ');
const line = `${ts} [${coloredLevel}] ${msg}${fields ? ' ' + fields : ''}`;
console[method](line);
```

### Anti-Patterns to Avoid

- **Copying wlog's transport signature**: wlog uses `(entries: LogEntry[]) => Promise<void>`. slog's interface is `{ write(entry): void; flush(): Promise<void> }`. These are fundamentally different — do not mix.
- **Doing I/O in `write()`**: `write()` is synchronous and called in a for-loop in `logger.ts`. Throwing or doing async work here breaks the contract.
- **Modifying the entries array in `flush()`**: Always splice the internal buffer before sending — avoids double-send if flush is called concurrently.
- **Awaiting retry delay with `setTimeout` + Promise**: Use a tiny inline sleep helper for retry delay rather than importing a utility.
- **Using `process` APIs unconditionally**: `process.stdout.isTTY` and `process.on('exit')` are not available in Cloudflare Workers. See Pitfall 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NDJSON serialization | Custom serializer | `entries.map(e => JSON.stringify(e)).join('\n')` | JSON.stringify handles all edge cases; NDJSON is just newline-joined |
| Level color lookup | Switch statement | Lookup table (`Record<LogLevel, string>`) | Exhaustive at type-check time, no runtime branching |
| Retry logic | Exponential backoff library | Inline: try, catch, await delay, try again, catch, log+drop | One retry is trivially inlinable — a library is overkill |
| Value quoting in logfmt | Parser library | Simple regex test `/[\s"=]/` | Only need write-side formatting, not a full logfmt parser |

**Key insight:** Everything in this phase is glue code over built-in platform APIs. The complexity ceiling is low — resist adding dependencies.

## Common Pitfalls

### Pitfall 1: `flush()` in RoutedTransport Flushes All Routes, Not Just Matched Ones

**What goes wrong:** If you only flush routes that received entries (requiring tracking), you need a Set per flush cycle. The simpler approach is to flush all route transports unconditionally — their own `flush()` implementations guard with `if (buffer.length === 0) return`.

**Why it happens:** Over-optimization — trying to avoid flushing transports that got no entries.

**How to avoid:** Flush all route transports unconditionally. Each transport's `flush()` is a no-op when empty — this is the correct design.

**Warning signs:** Stateful tracking of "which routes matched" in `write()` to conditionally flush in `flush()`.

### Pitfall 2: Double-Flush on HttpBatchTransport with Auto-Timer

**What goes wrong:** The auto-timer fires and flushes. Then the caller also calls `flush()` explicitly (e.g. on request end). Both flush simultaneously, and the buffer splice races.

**Why it happens:** `buffer.splice(0, buffer.length)` is synchronous, so two concurrent callers both get the same entries (whichever runs second gets an already-drained array). Actually the splice is safe — second caller gets empty array — but the timer's flush might overlap with the caller's, causing the timer's fetch to run while caller's fetch is in-flight.

**How to avoid:** The splice-before-send pattern (`const entries = buffer.splice(...)`) is correct — the second call gets an empty array and returns early. This is already the right pattern. No lock needed.

**Warning signs:** Using `buffer.length` check + iteration without splicing first.

### Pitfall 3: `setInterval` / `process.on('exit')` in Cloudflare Workers

**What goes wrong:** `setInterval` exists in Workers but `clearInterval` on process exit via `process.on('exit')` does not. `process` is not available in Workers.

**Why it happens:** Node.js patterns applied to Workers runtime.

**How to avoid:** For auto-timer cleanup, use `process?.on?.('exit', ...)` with optional chaining, or expose a `destroy()` method on the transport object (returned alongside the `Transport` interface) that callers can call on teardown. Given Workers are request-scoped and short-lived, auto-timer is mainly useful for long-lived Node/Bun processes — document this clearly.

**Recommendation (Claude's discretion):** Expose `{ transport, destroy }` from `createHttpBatchTransport` when `flushInterval` is set, or return a plain `Transport` and let callers manage the timer externally. The simpler option is to start the timer inside the factory and use `process?.on?.('exit', () => clearInterval(timer))` with the optional chaining guard.

**Warning signs:** Unconditional `process.on('exit', ...)` call in transport factory.

### Pitfall 4: Retry Delay Must Not Block the Event Loop

**What goes wrong:** Using a synchronous spin-wait for retry delay.

**Why it happens:** Wanting a simple retry without async complexity.

**How to avoid:** Inline async sleep: `await new Promise(resolve => setTimeout(resolve, delay))`. A delay of 500ms–1000ms is reasonable for a single retry. Keep it a small hardcoded constant (Claude's discretion: 500ms).

**Warning signs:** `while (Date.now() < deadline) {}` — this is never correct in async code.

### Pitfall 5: Pretty Transport Truncation (Claude's Discretion)

**What goes wrong:** Long data values (e.g. full SQL queries, large JSON blobs) make pretty output unreadable.

**Why it happens:** No truncation applied to string values before logfmt formatting.

**How to avoid:** Optionally truncate string values over N characters (e.g. 120 chars) in pretty transport, appending `...`. This is Claude's discretion — recommended to add with a default of 120 chars and allow override via config option `{ maxValueLength?: number }`.

**Warning signs:** Terminal output wrapping across many lines for a single log entry.

### Pitfall 6: `JSON.stringify` and `message: undefined`

**What goes wrong:** Developer expects `message` field to be absent when not provided, but some code paths add `message: undefined` explicitly.

**Why it happens:** Object spread or explicit undefined assignment before stringify.

**How to avoid:** `JSON.stringify` naturally drops `undefined` values. The existing `logger.ts:log()` extracts `message` via destructuring and puts it directly on the entry object — if it was not in `data`, `message` will be `undefined` and `JSON.stringify` will omit it from the ConsoleTransport output. This is correct behavior — no action needed. Verify with a test.

## Code Examples

Verified patterns from the existing codebase and reference implementation:

### ConsoleTransport — Complete Implementation
```typescript
// Pattern derived from logger.ts and types.ts in slog codebase
import type { LogEntry, LogLevel, Transport } from '../types.ts';

const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  trace: 'log',
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

export function createConsoleTransport(): Transport {
  return {
    write(entry: LogEntry): void {
      const method = CONSOLE_METHOD[entry.level];
      console[method](JSON.stringify(entry));
    },
    async flush(): Promise<void> {},
  };
}
```

### HttpBatchTransport — Retry Pattern
```typescript
// Retry-once pattern with NDJSON body
async function postWithRetry(url: string, body: string, headers: Record<string, string>): Promise<void> {
  const init = { method: 'POST', headers, body };
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // Retry once after brief delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // If second attempt throws, it propagates to flush() caller (logger.ts uses Promise.allSettled)
  }
}
```

### PrettyTransport — Line Assembly
```typescript
// logfmt-style field formatting
function formatValue(val: unknown): string {
  if (typeof val === 'string') {
    return /[\s"=]/.test(val) ? JSON.stringify(val) : val;
  }
  if (typeof val === 'object' && val !== null) {
    return JSON.stringify(val);
  }
  return String(val);
}

// Single log line
const ts = new Date(entry.timestamp).toISOString();
const coloredLevel = `${LEVEL_COLOR[entry.level]}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
const fields = Object.entries({ ...entry.context, ...entry.data })
  .map(([k, v]) => `${k}=${formatValue(v)}`)
  .join(' ');
const line = `${ts} [${coloredLevel}] ${entry.message ?? ''}${fields ? ' ' + fields : ''}`;
```

### RoutedTransport — Complete Implementation
```typescript
import type { LogEntry, Transport } from '../types.ts';

export interface TransportRoute {
  predicate: (entry: LogEntry) => boolean;
  transport: Transport;
}

export function createRoutedTransport(routes: TransportRoute[]): Transport {
  return {
    write(entry: LogEntry): void {
      for (const { predicate, transport } of routes) {
        if (predicate(entry)) {
          transport.write(entry);
        }
      }
    },
    async flush(): Promise<void> {
      await Promise.allSettled(routes.map(r => r.transport.flush()));
    },
  };
}
```

### Convenience Predicates
```typescript
import { LOG_LEVELS } from '../levels.ts';
import type { LogLevel, LogEntry } from '../types.ts';

export function atOrAboveLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const min = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] >= min;
}

export function exactLevel(level: LogLevel): (entry: LogEntry) => boolean {
  return (entry) => entry.level === level;
}

export function belowLevel(level: LogLevel): (entry: LogEntry) => boolean {
  const threshold = LOG_LEVELS[level];
  return (entry) => LOG_LEVELS[entry.level] < threshold;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wlog: `Transport = (entries) => Promise<void>` | slog: `Transport = { write(entry): void; flush(): Promise<void> }` | Phase 2 design | Enables true buffer-then-flush; transports don't need to manage their own batching |
| wlog: emoji badges in pretty transport | slog: ANSI colored level text | Locked in CONTEXT.md | Cleaner in CI/terminal environments; emoji rendering is inconsistent |
| wlog: JSON array body for HTTP transport | slog: NDJSON body | Locked in CONTEXT.md | Streamable; compatible with Loki, Datadog, Elasticsearch bulk ingest |

**Note on wlog reference:** The wlog implementation is useful for understanding the domain but should NOT be copied directly. Its transport interface, pretty format (emojis), and HTTP body format (JSON array) all differ from locked decisions.

## Open Questions

1. **Pretty transport: context vs data field ordering**
   - What we know: both `context` and `data` are `Record<string, unknown>`. The line assembly example merges them: `{ ...entry.context, ...entry.data }`.
   - What's unclear: if a key appears in both context and data (shouldn't happen in practice), data wins. Is this the right priority?
   - Recommendation: data wins (later spread wins). Document this behavior. In practice, context keys (requestId, userId) and data keys (action, duration) rarely overlap.

2. **HttpBatchTransport: what HTTP status codes count as failure?**
   - What we know: non-2xx should trigger retry. `res.ok` covers 200-299.
   - What's unclear: should 429 (rate limited) also respect Retry-After header?
   - Recommendation: For simplicity, treat all non-2xx as failure, retry once with fixed 500ms delay, then drop. No Retry-After handling — this is a v1 transport.

3. **Auto-timer transport interface: return `Transport` or `{ transport, destroy }`?**
   - What we know: `createHttpBatchTransport` returns `Transport`. If it starts a timer internally, callers need a way to stop it.
   - What's unclear: does changing the return type break the `Transport` interface contract for callers who assign it to `transports: Transport[]`?
   - Recommendation: Return `Transport` always. Attach a `destroy()` method directly on the returned object (TypeScript structural typing allows this). Callers who need cleanup can call `(transport as any).destroy()` or the type can be widened to `Transport & { destroy?: () => void }`. Simpler alternative: just use `process?.on?.('exit', cleanup)` with optional chaining — no API change needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/transports/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAN-01 | `Transport` interface satisfied by all transport objects | unit | `npx vitest run tests/transports/` | ❌ Wave 0 |
| TRAN-02 | ConsoleTransport calls correct console method per level, outputs valid JSON | unit | `npx vitest run tests/transports/console.test.ts` | ❌ Wave 0 |
| TRAN-03 | PrettyTransport outputs ISO timestamp, ANSI colors, key=value data | unit | `npx vitest run tests/transports/pretty.test.ts` | ❌ Wave 0 |
| TRAN-04 | HttpBatchTransport buffers in write(), POSTs NDJSON on flush(), retries once on failure | unit | `npx vitest run tests/transports/http.test.ts` | ❌ Wave 0 |
| TRAN-05 | RoutedTransport routes entries to matching transports only; multi-match works | unit | `npx vitest run tests/transports/routed.test.ts` | ❌ Wave 0 |
| TRAN-06 | Logger with transport: flush() delivers all buffered entries to transport | integration | `npx vitest run tests/transports/` | ❌ Wave 0 |
| TRAN-07 | One transport flush() throwing does not prevent other transports from receiving entries | integration | `npx vitest run tests/transports/` | ❌ Wave 0 |

### Key Testing Patterns

**Console method spy pattern** (Vitest, no external mocks needed):
```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
```

**fetch mock pattern** (Vitest global mock):
```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
// Or for failure testing:
vi.stubGlobal('fetch', vi.fn()
  .mockRejectedValueOnce(new Error('network error'))
  .mockResolvedValueOnce({ ok: true })
);
```

**Existing test helper to reuse** (from `tests/logger.test.ts`):
```typescript
function collectTransport() {
  const entries: LogEntry[] = [];
  return {
    entries,
    transport: {
      write(entry: LogEntry) { entries.push(entry); },
      async flush() {},
    } satisfies Transport,
  };
}
```
This helper already exists and TRAN-06/TRAN-07 integration tests can import and use it.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/transports/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/transports/console.test.ts` — covers TRAN-02
- [ ] `tests/transports/pretty.test.ts` — covers TRAN-03
- [ ] `tests/transports/http.test.ts` — covers TRAN-04
- [ ] `tests/transports/routed.test.ts` — covers TRAN-05
- [ ] `tests/transports/integration.test.ts` — covers TRAN-06, TRAN-07

## Sources

### Primary (HIGH confidence)
- `src/types.ts` in slog — Transport interface, LogEntry schema (verified by direct read)
- `src/logger.ts` in slog — flush() implementation, Promise.allSettled pattern, write() loop (verified by direct read)
- `src/levels.ts` in slog — LOG_LEVELS numeric map (verified by direct read)
- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — reference implementation patterns (verified by direct read)
- MDN: `JSON.stringify` — undefined field omission behavior (established language behavior)
- MDN: `fetch()` API — available Node 18+, Bun, Deno, Workers (established platform behavior)

### Secondary (MEDIUM confidence)
- ANSI escape code reference — color codes `\x1b[31m` etc. are ECMA-48 standard, universally supported in target terminals
- NDJSON format — `ndjson.org` specification: one JSON value per line, `\n` terminated

### Tertiary (LOW confidence)
- None — all findings are verifiable from first-principles or existing code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all built-in APIs
- Architecture: HIGH — interface already defined, patterns derived from existing codebase
- Pitfalls: HIGH — derived from code analysis and reference implementation comparison
- Test patterns: HIGH — Vitest already installed, spy/mock APIs are well-established

**Research date:** 2026-03-21
**Valid until:** 2026-09-21 (stable domain — ANSI codes, fetch API, and console API are not changing)
