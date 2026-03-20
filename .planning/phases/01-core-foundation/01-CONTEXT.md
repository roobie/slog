# Phase 1: Core Foundation - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Fully functional in-memory structured logger with 6-level filtering, child loggers via `withContext()`, and a sync plugin pipeline with built-in plugins (error serializer, redaction, level filter, field enrichment). No I/O, no transports — entries are buffered in memory only.

</domain>

<decisions>
## Implementation Decisions

### Entry Schema
- Timestamp stored as Unix milliseconds (`Date.now()`) — fast, compact, machine-friendly
- Ship a built-in plugin to convert timestamps to ISO 8601 for transports that want it
- `message` is an optional top-level field — pulled out of `data` if present, omitted if not
- Core entry shape: `{ level, timestamp, message?, context, data }`
- No `error` field in core schema — error serializer plugin owns error representation

### Plugin Contract
- Plugins are sync — pipeline runs synchronously in the hot path
- Separate async post-process hook available for rare async needs (outside the sync pipeline)
- Plugin errors are caught: `console.warn` with error details, original entry passed to next plugin — logging must never crash
- Plugin shape is a named object: `{ name: string, transform: (entry) => entry | null }`
- Returning `null` drops the entry from all downstream processing

### API Surface
- `createLogger()` accepts a single options object: `{ level?, plugins?, transports?, context? }`
- `withContext()` does shallow merge only (`Object.assign` semantics) — child overrides parent keys, no deep nesting
- Log methods (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) return `void` — fire-and-forget

### Built-in Plugins
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above and in `.planning/REQUIREMENTS.md` (CORE-01 through CORE-07, PLUG-01 through PLUG-06).

### Reference implementation
- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — Original wlog implementation (~335 lines). Same core design patterns (object-only API, plugin pipeline, buffer-then-flush, withContext child loggers). slog generalizes this into a runtime-agnostic package.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the foundational patterns

### Integration Points
- Transport interface must be defined in Phase 1 (as a type) even though transports ship in Phase 2 — the logger needs to know where to buffer entries

</code_context>

<specifics>
## Specific Ideas

- wlog's design proved out in production on Cloudflare Workers — keep the same core patterns (numeric level mapping for fast comparison, lazy serialization, `Promise.allSettled` for transport isolation)
- "Data dominates" — get the entry schema and plugin contract right, and the rest follows naturally

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-core-foundation*
*Context gathered: 2026-03-20*
