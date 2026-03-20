---
phase: 01-core-foundation
plan: 02
subsystem: plugins
tags: [typescript, vitest, tdd, error-serialization, redaction, level-filter, field-enrichment]

# Dependency graph
requires:
  - phase: 01-core-foundation/01-01
    provides: LogEntry, Plugin, Transport, Logger types; createLogger; LOG_LEVELS; logger pipeline

provides:
  - errorSerializer plugin — converts Error instances (and plain objects/primitives) on data.error/data.err to serializable objects
  - createRedactPlugin factory — masks data fields matching string or RegExp patterns with '[REDACTED]'
  - createLevelFilterPlugin factory — filters log entries below a numeric level threshold
  - createFieldEnrichPlugin factory — adds/overrides static fields on every entry's data
  - src/plugins/index.ts barrel export of all 4 built-in plugins
  - Full public API from src/index.ts including all plugin exports

affects: [02-transports, 03-edge-runtimes, 04-dx-and-release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: write failing tests first, implement to green, no refactor needed"
    - "Plugin immutability: spread { ...entry, data } pattern — never mutate input"
    - "Same-reference optimization: return original entry when no transformation needed"
    - "Object.freeze snapshot: freeze a copy of fields at factory-call time, not the input"

key-files:
  created:
    - src/plugins/errorSerializer.ts
    - src/plugins/redact.ts
    - src/plugins/levelFilter.ts
    - src/plugins/fieldEnrich.ts
    - src/plugins/index.ts
    - tests/plugins/errorSerializer.test.ts
    - tests/plugins/redact.test.ts
    - tests/plugins/levelFilter.test.ts
    - tests/plugins/fieldEnrich.test.ts
  modified:
    - src/index.ts

key-decisions:
  - "Same-reference return when no transformation applied — avoids unnecessary object allocation and makes identity checks easy in tests"
  - "Object.freeze({ ...fields }) in fieldEnrich — snapshot at creation time prevents caller mutation bugs"
  - "errorSerializer checks data.error AND data.err keys in one loop pass — both serialized if present"

patterns-established:
  - "Plugin return: return entry (same ref) if no mutation, return { ...entry, data } if mutated"
  - "Plugin factory pattern: createXxxPlugin(config) => Plugin — config captured in closure, frozen if object"
  - "Test helper makeEntry(data): LogEntry — minimal LogEntry factory used across all plugin test files"

requirements-completed: [PLUG-03, PLUG-04, PLUG-05, PLUG-06]

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 01 Plan 02: Built-in Plugins Summary

**Four batteries-included plugins: error serializer (fixes JSON.stringify({}) bug), field redaction with string/regex patterns, level threshold filter, and static field enrichment — all TDD green across 50 total tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T23:50:57Z
- **Completed:** 2026-03-20T23:54:40Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- errorSerializer correctly handles Error instances (preserving subclass name/stack), plain objects (JSON stringified), and primitives — critical fix for `JSON.stringify(new Error())` returning `{}`
- createRedactPlugin supports both string exact-match and RegExp patterns, returns same entry reference when no keys match
- createLevelFilterPlugin uses LOG_LEVELS numeric comparison for threshold filtering, returns null (not undefined) for filtered entries
- createFieldEnrichPlugin snapshots fields with Object.freeze at creation time — mutation-proof
- All 4 plugins re-exported from src/index.ts; full Phase 1 test suite green (50 tests, 6 files)

## Task Commits

Each task was committed atomically:

1. **Task 1: Error serializer and redaction plugins with tests** - `448b34a` (feat)
2. **Task 2: Level filter, field enrichment, barrel exports, full suite** - `c69cc99` (feat)

_Note: TDD tasks — tests written before implementation in each task_

## Files Created/Modified
- `src/plugins/errorSerializer.ts` - Plugin constant: serializes Error/object/primitive on data.error and data.err
- `src/plugins/redact.ts` - Factory: masks data keys matching string or RegExp patterns with '[REDACTED]'
- `src/plugins/levelFilter.ts` - Factory: filters entries below numeric LOG_LEVELS threshold
- `src/plugins/fieldEnrich.ts` - Factory: adds frozen static fields to every entry's data
- `src/plugins/index.ts` - Barrel re-export of all 4 built-in plugins
- `src/index.ts` - Added plugin re-exports to public API
- `tests/plugins/errorSerializer.test.ts` - 7 tests covering Error/TypeError/object/primitive/no-op/both-keys cases
- `tests/plugins/redact.test.ts` - 6 tests covering string match/regex/mixed/no-mutate/same-ref/name
- `tests/plugins/levelFilter.test.ts` - 5 tests covering threshold drop/pass/trace-all/fatal-only/name
- `tests/plugins/fieldEnrich.test.ts` - 5 tests covering add/override/no-mutate/freeze-safety/name

## Decisions Made
- Same-reference return optimization: when no data keys need transformation, return original entry instead of a spread copy — avoids allocation and enables identity equality in tests
- Object.freeze snapshot in fieldEnrich: `Object.freeze({ ...fields })` captures a copy at factory call time so caller mutations don't affect enrichment behavior
- errorSerializer checks both `error` and `err` keys in one loop, serializes both if present

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 13 requirement IDs (CORE-01 through CORE-07, PLUG-01 through PLUG-06) have passing tests
- Zero runtime dependencies — only devDependencies
- Full public API importable from src/index.ts: createLogger, errorSerializer, createRedactPlugin, createLevelFilterPlugin, createFieldEnrichPlugin, LOG_LEVELS, and all type exports
- TypeScript compiles with strict mode and verbatimModuleSyntax — zero errors
- Phase 1 (core-foundation) is complete. Phase 2 (transports) can begin.

---
*Phase: 01-core-foundation*
*Completed: 2026-03-20*
