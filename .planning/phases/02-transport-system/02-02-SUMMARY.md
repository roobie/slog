---
phase: 02-transport-system
plan: "02"
subsystem: transport
tags: [http, ndjson, retry, routing, predicates, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-transport-system
    provides: Transport interface, LogEntry types, LOG_LEVELS map from Phase 01

provides:
  - HttpBatchTransport: buffered NDJSON POST with retry-once and auto-flush timer
  - RoutedTransport: predicate-based fan-out to multiple transports
  - Predicate helpers: atOrAboveLevel, exactLevel, belowLevel
  - Full barrel export from src/index.ts for all transport factories and types

affects:
  - 03-edge-runtime
  - 04-dx-hardening

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Splice-before-send: buffer.splice(0) before fetch to prevent duplicate sends on concurrent flush"
    - "Retry-once pattern: 500ms sleep then retry, console.warn on second failure (no throw)"
    - "Promise.allSettled for flush fan-out: one failing transport never blocks others"
    - "Predicate-based routing: pure functions over LogEntry enable composable level-based dispatch"

key-files:
  created:
    - src/transports/http.ts
    - src/transports/routed.ts
    - tests/transports/http.test.ts
    - tests/transports/routed.test.ts
  modified:
    - src/transports/index.ts
    - src/index.ts

key-decisions:
  - "Buffer spliced before POST (not after) to ensure concurrent flush safety and drop-on-failure semantics"
  - "process?.on?.('exit') with optional chaining for portability across runtimes that lack process"
  - "Promise.allSettled in RoutedTransport.flush() — one transport failure never blocks others"
  - "atOrAboveLevel/exactLevel/belowLevel use LOG_LEVELS numeric map for O(1) comparisons"

patterns-established:
  - "TDD: RED commit (test file), then GREEN commit (implementation) per task"
  - "vi.stubGlobal('fetch') for HTTP transport testing without network"
  - "vi.useFakeTimers() / vi.runAllTimersAsync() for timer-based behavior testing"

requirements-completed:
  - TRAN-04
  - TRAN-05

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 02 Plan 02: HttpBatchTransport and RoutedTransport Summary

**NDJSON HTTP batch transport with retry-once semantics and predicate-based fan-out routing with level helper functions**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-21T02:00:27Z
- **Completed:** 2026-03-21T02:02:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- HttpBatchTransport buffers entries synchronously, POSTs NDJSON on flush with retry-once and console.warn drop semantics
- RoutedTransport fans out writes to all matching predicates, flushes all transports unconditionally via Promise.allSettled
- Three predicate helpers (atOrAboveLevel, exactLevel, belowLevel) cover all practical level-routing scenarios
- All transport factories and types exported from barrel src/index.ts

## Task Commits

Each task was committed atomically using TDD (RED then GREEN):

1. **Task 1 RED: HttpBatchTransport failing tests** - `2334e64` (test)
2. **Task 1 GREEN: HttpBatchTransport implementation** - `4c958c4` (feat)
3. **Task 2 RED: RoutedTransport failing tests** - `e7d5f95` (test)
4. **Task 2 GREEN: RoutedTransport + barrel exports** - `52ed6a1` (feat)

_Note: TDD tasks have two commits each (test → feat)_

## Files Created/Modified

- `src/transports/http.ts` - HttpBatchTransport factory with postWithRetry, auto-flush timer, process exit cleanup
- `src/transports/routed.ts` - RoutedTransport factory and atOrAboveLevel/exactLevel/belowLevel predicates
- `tests/transports/http.test.ts` - 8 tests: buffer, NDJSON body, retry, warning, auto-timer
- `tests/transports/routed.test.ts` - 9 tests: routing, fan-out, allSettled, all three predicates
- `src/transports/index.ts` - Added http and routed exports with types
- `src/index.ts` - Added all transport factories and types to package barrel

## Decisions Made

- Buffer is spliced before sending (not after) — ensures entries are dropped on failure rather than re-sent, preventing duplicate delivery
- `process?.on?.('exit', ...)` uses optional chaining for runtime portability (Workers lack `process`)
- `Promise.allSettled` in RoutedTransport.flush() — one transport failure never blocks others from flushing
- Predicate helpers use LOG_LEVELS numeric map for consistent, fast comparisons across all 6 levels

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All transport primitives complete: ConsoleTransport, PrettyTransport, HttpBatchTransport, RoutedTransport
- Full barrel exports ready for consumer use
- Phase 03 (edge-runtime) can use these transports as-is
- Phase 04 (dx-hardening) has all factories available for integration testing

---
*Phase: 02-transport-system*
*Completed: 2026-03-21*
