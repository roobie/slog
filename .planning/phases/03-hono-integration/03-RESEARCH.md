# Phase 3: Hono Integration - Research

**Researched:** 2026-03-21
**Domain:** Hono middleware, Cloudflare Workers executionCtx, TypeScript subpath exports
**Confidence:** HIGH

## Summary

Phase 3 adds a `slog/hono` subpath export that ships a `slogMiddleware` factory. The middleware creates a per-request child logger with auto-populated request context (`requestId`, `method`, `path`, `userAgent`), measures request duration, writes a completion log entry, and registers `flush()` with `executionCtx.waitUntil()` on Cloudflare Workers so buffered HTTP transport entries are not dropped after the response is sent.

The reference implementation is already proven in production as `honoLogger` in `/home/jani/devel/entitle-edge/packages/wlog/index.ts`. The primary work is (a) adapting it to call slog's `createLogger` / `withContext` API rather than wlog's internal logger, (b) hardening the `executionCtx` guard for non-Workers runtimes, and (c) wiring the TypeScript types so `c.get('logger')` returns `Logger` without consumers having to re-declare Variables generics.

The single heaviest design decision is how to expose the middleware's Variables type so downstream route handlers get typed access to `c.get('logger')`. Hono's `createMiddleware<{ Variables: { logger: Logger } }>` is the correct mechanism — it propagates the type into the app's Env when the middleware is applied.

**Primary recommendation:** Implement `src/hono.ts` as a single file; export `slogMiddleware` and re-export `Logger` / `createLogger` for consumers who need them. Keep `hono` as a `peerDependency` only. Use `getRuntimeKey() === 'workerd'` (from `hono/adapter`) to guard `executionCtx.waitUntil()` — accessing `c.executionCtx` throws on non-Workers runtimes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HONO-01 | Hono middleware available via `slog/hono` subpath export | Package.json `exports` field with `./hono` key pointing to `dist/hono.js` and `dist/hono.d.ts` |
| HONO-02 | Per-request logger with auto-populated context (requestId, method, path, userAgent) | `c.req.header('cf-ray') \|\| crypto.randomUUID()` for requestId; `c.req.method`, `c.req.path`, `c.req.header('user-agent')` from HonoRequest |
| HONO-03 | Request duration measurement and completion logging | `performance.now()` before `await next()`; `Math.round(duration)` ms in completion log entry in `finally` block |
| HONO-04 | Flush via `executionCtx.waitUntil()` for Cloudflare Workers | `getRuntimeKey() === 'workerd'` guard from `hono/adapter`; fallback to `await log.flush()` on other runtimes |
| HONO-05 | Logger accessible via Hono context (`c.get('logger')`) | `createMiddleware<{ Variables: { logger: Logger } }>` sets type; `c.set('logger', childLogger)` stores it |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | 4.12.8 (latest) | Framework peer — provides `Context`, `Next`, `MiddlewareHandler`, `createMiddleware`, `getRuntimeKey` | Only framework targeted; consumers already have it installed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hono/factory | bundled with hono | `createMiddleware<Env>()` for typed middleware | Use to carry `Variables: { logger: Logger }` through TypeScript |
| hono/adapter | bundled with hono | `getRuntimeKey()` for runtime detection | Use to guard `c.executionCtx.waitUntil()` call |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getRuntimeKey() === 'workerd'` | `try { c.executionCtx } catch {}` | try/catch works but is fragile and silently hides other errors; getRuntimeKey is the official recommended pattern |
| `getRuntimeKey() === 'workerd'` | `c.executionCtx?.waitUntil(p)` | Optional chaining does NOT work — `c.executionCtx` getter throws rather than returning undefined on non-Workers runtimes (confirmed in issue #2649) |
| Single `createMiddleware` | Factory function returning middleware | Factory pattern (`slogMiddleware(logger)`) is correct — the middleware needs the parent logger injected |

**Installation (consumer side):**
```bash
# hono is already a dep in consumer's project
# slog is what they're installing:
npm install slog
```

**Installation (dev, for this project):**
```bash
npm install --save-dev hono
```

Hono must be `peerDependencies` in `package.json`, not `dependencies`. This keeps slog at zero runtime dependencies (PACK-01).

---

## Architecture Patterns

### Recommended File Structure

```
src/
├── hono.ts          # Single file: slogMiddleware export (HONO-01 through HONO-05)
├── index.ts         # Existing core barrel — untouched
├── types.ts         # Existing — Logger type imported by hono.ts
└── logger.ts        # Existing — createLogger imported by hono.ts
tests/
└── hono/
    └── middleware.test.ts   # All HONO-0x tests
```

`src/hono.ts` is a standalone entrypoint. It imports from `./types.ts` and `./logger.ts` but NOT from `./index.ts` to avoid circular risk. It imports `createMiddleware` and `getRuntimeKey` from `hono` (peer).

### Pattern 1: Middleware Factory

**What:** `slogMiddleware(parentLogger)` returns a `MiddlewareHandler` that creates a per-request child logger.
**When to use:** Always — the parent logger (with transports configured) must be provided by the consumer.

```typescript
// Source: adapted from hono.dev/docs/helpers/factory + wlog reference impl
import { createMiddleware } from 'hono/factory';
import { getRuntimeKey } from 'hono/adapter';
import type { Logger } from './types.ts';

export function slogMiddleware(logger: Logger) {
  return createMiddleware<{ Variables: { logger: Logger } }>(async (c, next) => {
    const requestLogger = logger.withContext({
      requestId: c.req.header('cf-ray') ?? crypto.randomUUID(),
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header('user-agent'),
    });

    c.set('logger', requestLogger);

    const start = performance.now();

    try {
      await next();
    } finally {
      const duration = Math.round(performance.now() - start);
      requestLogger.info({ message: 'request completed', status: c.res.status, duration });

      const flushPromise = requestLogger.flush();
      if (getRuntimeKey() === 'workerd') {
        c.executionCtx.waitUntil(flushPromise);
      } else {
        await flushPromise;
      }
    }
  });
}
```

### Pattern 2: Package.json Subpath Export

**What:** `package.json` `exports` field maps `./hono` to the compiled output.
**When to use:** Phase 4 (Packaging) will finalize this, but the research informs what the field must contain.

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./hono": {
      "import": "./dist/hono.js",
      "types": "./dist/hono.d.ts"
    }
  },
  "peerDependencies": {
    "hono": ">=4.0.0"
  }
}
```

Note: `tsconfig.json` currently sets `rootDir: "src"` and `outDir: "dist"` — TypeScript will emit `dist/hono.js` and `dist/hono.d.ts` automatically when `src/hono.ts` is included. The `include: ["src"]` already covers it.

### Pattern 3: Consumer Usage

**What:** How an app author wires the middleware.

```typescript
import { Hono } from 'hono';
import { createLogger, createHttpBatchTransport } from 'slog';
import { slogMiddleware } from 'slog/hono';

const logger = createLogger({
  transports: [createHttpBatchTransport({ url: 'https://logs.example.com' })],
});

const app = new Hono();
app.use('*', slogMiddleware(logger));

app.get('/', (c) => {
  const log = c.get('logger');
  log.info({ message: 'handling request', userId: 42 });
  return c.json({ ok: true });
});
```

### Anti-Patterns to Avoid

- **Creating `createLogger()` inside the middleware per-request:** Instantiates new transports for every request. Use the factory pattern — pass parent logger in, call `withContext()` per request.
- **`c.executionCtx?.waitUntil(p)` optional chaining:** The `executionCtx` getter throws on non-Workers runtimes — optional chaining does not catch thrown exceptions. Use `getRuntimeKey()` guard instead.
- **Importing from `slog` (core barrel) inside `src/hono.ts`:** Creates a dependency on the core entrypoint from the hono entrypoint. Import directly from `./types.ts` and `./logger.ts` to keep entrypoints independent.
- **Awaiting flush before sending response:** Defeats the purpose of `waitUntil`. The `finally` block must not `await flushPromise` on Workers — only on other runtimes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation | Custom UUID impl | `crypto.randomUUID()` | Web-standard, available in all target runtimes (Workers, Node 18+, Bun, Deno) |
| Runtime detection | `typeof globalThis.WorkerGlobalScope !== 'undefined'` | `getRuntimeKey()` from `hono/adapter` | Official Hono API; handles edge cases across all supported runtimes |
| Duration measurement | `Date.now()` subtraction | `performance.now()` | Sub-millisecond precision; available in all target runtimes |
| Middleware type plumbing | Manual `MiddlewareHandler<Env>` type annotations everywhere | `createMiddleware<{ Variables: { logger: Logger } }>` | Propagates Variables type correctly through Hono's type system |

**Key insight:** The `executionCtx` access problem is the main pitfall unique to this integration — any "check if property exists" approach will fail because Hono throws rather than returning undefined. The `getRuntimeKey()` guard is the only reliable solution.

---

## Common Pitfalls

### Pitfall 1: Optional Chaining on executionCtx

**What goes wrong:** `c.executionCtx?.waitUntil(flushPromise)` compiles and looks safe, but throws at runtime on Bun/Node with "This context has no ExecutionContext".
**Why it happens:** Hono's `executionCtx` is a getter that throws — it is not `undefined`, so `?.` does not short-circuit.
**How to avoid:** Use `getRuntimeKey() === 'workerd'` from `hono/adapter` to branch.
**Warning signs:** Tests passing in Vitest (non-workerd) but failing in production or integration tests on Cloudflare.

### Pitfall 2: flush() called before response is returned

**What goes wrong:** `await requestLogger.flush()` inside `finally` before `waitUntil` — this blocks the response on Workers, negating the performance benefit.
**Why it happens:** Developer treats Workers the same as Node (where awaiting is fine).
**How to avoid:** Only `await` on non-workerd runtimes. On workerd, `waitUntil` runs flush after response is sent.

### Pitfall 3: Child Logger Shares Parent Buffer

**What goes wrong:** Flushing the child logger in `finally` does not flush entries from the parent logger (different buffer instances).
**Why it happens:** `withContext()` creates a new `LoggerImpl` with its own `buffer: LogEntry[]` — entries logged before `withContext()` remain in the parent buffer.
**How to avoid:** Consumers who log before the first request should flush the parent logger separately (e.g., on process exit). The middleware only needs to flush the child logger.

### Pitfall 4: c.res.status Requires await next() to be Called First

**What goes wrong:** Reading `c.res.status` in the `try` block before `await next()` returns `undefined` or a default.
**Why it happens:** The response is not set until after route handlers run.
**How to avoid:** Always read `c.res.status` in the `finally` block (after `await next()` has returned).

### Pitfall 5: hono as a Direct Dependency Instead of peerDependency

**What goes wrong:** `npm install slog` pulls in a second copy of Hono, potentially mismatching the consumer's version. TypeScript type errors if two versions of `Context` are in scope.
**Why it happens:** Developer adds `hono` to `dependencies` for convenience.
**How to avoid:** `hono` must be `peerDependencies: { "hono": ">=4.0.0" }` only. Add to `devDependencies` for testing.

### Pitfall 6: tsconfig rootDir Mismatch for Hono-Specific Types

**What goes wrong:** TypeScript fails to emit `dist/hono.d.ts` if the file is outside `rootDir`.
**Why it happens:** `src/hono.ts` is inside `rootDir: "src"` — this is fine. No action needed. But if a `hono.ts` is accidentally placed at project root, it breaks the emit.
**How to avoid:** Keep `src/hono.ts` consistent with all other source files.

---

## Code Examples

Verified patterns from official sources and reference implementation:

### createMiddleware with Variables type

```typescript
// Source: hono.dev/docs/helpers/factory
import { createMiddleware } from 'hono/factory';

const myMiddleware = createMiddleware<{
  Variables: {
    logger: Logger;
  };
}>(async (c, next) => {
  c.set('logger', someLogger);
  await next();
});
```

### getRuntimeKey guard for executionCtx

```typescript
// Source: hono.dev/docs/helpers/adapter + honojs/hono issue #2649
import { getRuntimeKey } from 'hono/adapter';

const flushPromise = logger.flush();
if (getRuntimeKey() === 'workerd') {
  c.executionCtx.waitUntil(flushPromise);
} else {
  await flushPromise;
}
```

### Request context extraction

```typescript
// Source: reference impl /home/jani/devel/entitle-edge/packages/wlog/index.ts lines 303-308
const requestLogger = logger.withContext({
  requestId: c.req.header('cf-ray') ?? crypto.randomUUID(),
  method: c.req.method,
  path: c.req.path,
  userAgent: c.req.header('user-agent'),
});
```

### Vitest testing pattern for middleware

```typescript
// Source: hono.dev/docs/guides/testing — app.request pattern
import { Hono } from 'hono';
import { describe, it, expect, vi } from 'vitest';
import { slogMiddleware } from '../../src/hono.ts';
import { createLogger } from '../../src/logger.ts';
import type { LogEntry, Transport } from '../../src/types.ts';

function collectTransport() {
  const entries: LogEntry[] = [];
  let flushCount = 0;
  return {
    entries,
    get flushCount() { return flushCount; },
    transport: {
      write(entry: LogEntry) { entries.push(entry); },
      async flush() { flushCount++; },
    } satisfies Transport,
  };
}

describe('slogMiddleware', () => {
  it('sets logger on context', async () => {
    const col = collectTransport();
    const logger = createLogger({ transports: [col.transport] });
    const app = new Hono();
    app.use('*', slogMiddleware(logger));
    app.get('/test', (c) => {
      const log = c.get('logger');
      log.info({ message: 'handler ran' });
      return c.json({ ok: true });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    // flush was called (non-workerd runtime in Vitest)
    expect(col.flushCount).toBeGreaterThan(0);
  });
});
```

The `executionCtx.waitUntil` path is exercised in Vitest by mocking `getRuntimeKey` — or by simply verifying the `else` (await) branch works, and trusting the Workers path through the `getRuntimeKey() === 'workerd'` guard. Full Workers-environment testing requires `@cloudflare/vitest-pool-workers` and `wrangler.toml` — this is out of scope for Phase 3 (Phase 4 / packaging phase handles deployment concerns). Plain Vitest tests are sufficient for HONO-01 through HONO-05 validation.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `c.executionCtx?.waitUntil()` optional chain | `getRuntimeKey() === 'workerd'` guard | hono >= ~3.x (getter-throws design) | Optional chain silently fails; must use runtime key |
| Custom middleware handler typing | `createMiddleware<{ Variables: {} }>()` | hono 4.x | Propagates variables type through app Env automatically |
| `c.req.raw.headers.get()` | `c.req.header('name')` | hono 3+ | Official HonoRequest helper; same in all adapters |

**Deprecated/outdated:**
- wlog's pattern of `c.executionCtx?.waitUntil()`: wlog predates the documented throwing behavior; slog must use `getRuntimeKey()`.
- wlog's pattern of spreading `config` over the `createLogger()` call: slog uses `withContext()` instead, keeping the parent logger's transports and creating a child, not a sibling.

---

## Open Questions

1. **Should `slogMiddleware` accept a `LoggerOptions` override or just a `Logger` instance?**
   - What we know: wlog's `honoLogger(config?)` accepted optional config and created a fresh logger internally — but that is the old pattern where the logger was self-contained.
   - What's unclear: Is it useful to allow partial config overrides per-middleware registration (e.g., a different log level for the Hono integration)?
   - Recommendation: Accept only `Logger` (pre-configured by the consumer). This keeps the middleware simple and consistent with the factory-then-inject pattern. Consumers who need different levels per environment create the logger with their desired config before passing it in.

2. **Should `requestId` prefer `x-request-id` over `cf-ray`?**
   - What we know: `cf-ray` is Cloudflare-specific; `x-request-id` is the de-facto standard header used by most proxies/load-balancers.
   - What's unclear: Project targets Cloudflare Workers primarily but also general Hono usage.
   - Recommendation: Check `cf-ray` first, then `x-request-id`, then generate with `crypto.randomUUID()`. This is more broadly useful without adding complexity.

3. **Does the middleware need error-path logging?**
   - What we know: wlog's `honoLogger` had a `catch (err)` block that called `log.error()` before rethrowing.
   - What's unclear: Whether HONO-03 ("completion log entry") implies error entries too.
   - Recommendation: Include error logging in catch block (rethrows after logging), consistent with wlog reference. The completion log in `finally` still runs and includes the status code, which will be 500 for unhandled errors.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists from Phase 1) |
| Quick run command | `npx vitest run tests/hono/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HONO-01 | `import { slogMiddleware } from '../../src/hono.ts'` succeeds without importing core | unit (import) | `npx vitest run tests/hono/middleware.test.ts` | Wave 0 |
| HONO-02 | Child logger context contains requestId, method, path, userAgent | unit | `npx vitest run tests/hono/middleware.test.ts` | Wave 0 |
| HONO-03 | Completion log entry written with duration in ms after response | unit | `npx vitest run tests/hono/middleware.test.ts` | Wave 0 |
| HONO-04 | `flush()` called via `await` on non-workerd runtime (Vitest) | unit | `npx vitest run tests/hono/middleware.test.ts` | Wave 0 |
| HONO-05 | `c.get('logger')` returns Logger instance from within handler | unit | `npx vitest run tests/hono/middleware.test.ts` | Wave 0 |

Note: HONO-04's `waitUntil` branch (workerd) is not testable with plain Vitest — the `getRuntimeKey() === 'workerd'` path can be tested by mocking `getRuntimeKey` with `vi.mock('hono/adapter', ...)`. This is LOW priority; the `await` fallback path covers correctness and the `waitUntil` path is a thin conditional.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/hono/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/hono/middleware.test.ts` — covers HONO-01 through HONO-05
- [ ] Install hono as devDependency: `npm install --save-dev hono`

---

## Sources

### Primary (HIGH confidence)

- hono.dev/docs/api/context — `c.set`, `c.get`, `c.executionCtx`, `c.req.header`, `c.req.method`, `c.req.path`
- hono.dev/docs/helpers/factory — `createMiddleware<{ Variables: { ... } }>` signature
- hono.dev/docs/helpers/adapter — `getRuntimeKey()` return values and import path
- honojs/hono issue #2649 — confirmed `c.executionCtx` throws on non-Workers runtimes; `getRuntimeKey()` is the recommended workaround
- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — reference `honoLogger` implementation (directly readable)

### Secondary (MEDIUM confidence)

- hono.dev/docs/guides/testing — `app.request(url, init, env)` pattern for Vitest testing
- npm view hono — confirmed version 4.12.8 as latest (verified 2026-03-21)

### Tertiary (LOW confidence)

- orgs/honojs/discussions/3257 — type-safety for middleware Variables; corroborates `createMiddleware<Env>` pattern (consistent with official docs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — version verified via `npm view hono version`; API verified against official docs
- Architecture: HIGH — `createMiddleware`, `getRuntimeKey`, `withContext` all verified; executionCtx throwing behavior confirmed via GitHub issue
- Pitfalls: HIGH — executionCtx pitfall is documented in official issue tracker with maintainer confirmation; others derived from code reading

**Research date:** 2026-03-21
**Valid until:** 2026-06-21 (Hono 4.x is stable; breaking changes would come in 5.x)
