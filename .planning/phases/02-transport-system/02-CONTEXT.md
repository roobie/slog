# Phase 2: Transport System - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Console, pretty, and HTTP batch transports implementing the `Transport` interface (`write(entry): void` + `flush(): Promise<void>`). Level-routed transport wrapper for directing entries to different backends. Buffer-then-flush pattern already implemented in core logger.

</domain>

<decisions>
## Implementation Decisions

### Console Transport (JSON)
- Console method mapping: trace→log, debug→log, info→info, warn→warn, error→error, fatal→error
- Output format: single-line NDJSON — one `JSON.stringify(entry)` per line
- Keep LogEntry schema as-is — separate `context` and `data` objects (no flattening)
- Timestamp stays as Unix ms in JSON output (aggregators parse this natively)
- Undefined/optional fields omitted (JSON.stringify naturally drops undefined — no `message` field if not set)

### Pretty Console Transport
- Timestamp format: ISO 8601 (`2026-03-21T10:23:45.123Z`)
- Level display: ANSI colored text (no emojis) — e.g. green INFO, yellow WARN, red ERROR
- Data display: inline key=value format (logfmt-style) — `userId=123 action="login"`
- All output via console methods matching the same level mapping as JSON transport

### HTTP Batch Transport
- Request body format: NDJSON (newline-delimited JSON) — streamable, matches Loki/Datadog ingest
- Flush behavior: configurable — default flush-only (passive, caller controls timing), opt-in auto-timer for long-lived processes
- Failure handling: retry once after POST failure, then log error and drop entries — logging must not block the app
- Config: `{ url: string, headers?: Record<string, string>, flushInterval?: number }`
- Uses `fetch()` — available in all target runtimes (Node 18+, Bun, Deno, Workers)

### Level-Routed Transport
- Routing via predicate function: `(entry: LogEntry) => boolean` per transport — most composable, users can build threshold/map routing from this primitive
- Unmatched entries dropped silently — routing is opt-in per transport
- Shape: `createRoutedTransport(routes: Array<{ predicate: (entry) => boolean, transport: Transport }>)`
- An entry can match multiple routes (sent to all matching transports)

### Claude's Discretion
- ANSI color codes for each level in pretty transport
- Whether pretty transport truncates long data values
- HTTP batch transport: exact retry delay
- Auto-timer cleanup on process exit for long-lived processes

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core types and patterns
- `src/types.ts` — Transport interface definition (`write` + `flush`), LogEntry schema
- `src/logger.ts` — Buffer-then-flush implementation, `Promise.allSettled` transport isolation pattern

### Reference implementation
- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — wlog's consoleTransport, prettyConsoleTransport, and httpBatchTransport implementations

### Requirements
- `.planning/REQUIREMENTS.md` — TRAN-01 through TRAN-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Transport` interface in `src/types.ts` — already defined with `write(entry: LogEntry): void` and `flush(): Promise<void>`
- `LogEntry` type — the schema transports will serialize
- `LOG_LEVELS` map in `src/levels.ts` — useful if level routing needs numeric comparison

### Established Patterns
- Plugin pattern: named objects with a single method — transports should follow a similar factory function pattern (e.g. `createConsoleTransport()`)
- Error isolation: `Promise.allSettled` in `logger.ts:flush()` ensures transport failures don't cascade
- `console.warn` for internal errors (established in plugin pipeline)

### Integration Points
- `logger.ts:flush()` calls `transport.write(entry)` for each buffered entry, then `transport.flush()` — transports must implement both
- `src/index.ts` barrel — needs transport exports added

</code_context>

<specifics>
## Specific Ideas

- wlog's pretty transport uses emoji badges — slog uses ANSI colored text instead (cleaner in terminals)
- NDJSON for HTTP transport matches common log aggregator ingest formats (Loki, Datadog, Elasticsearch bulk API)
- Predicate-based routing is the most composable approach — ship helpers like `aboveLevel('warn')` as convenience predicates

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-transport-system*
*Context gathered: 2026-03-21*
