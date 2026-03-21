---
phase: 04-packaging-and-publishing
plan: 01
subsystem: infra
tags: [npm, jsr, typescript, package-publishing, dual-registry]

# Dependency graph
requires:
  - phase: 03-hono-integration
    provides: src/hono.ts with slogMiddleware — needed for JSR slow types fix
provides:
  - package.json with @bjro/slog name, source-first exports, files whitelist, Apache-2.0 license
  - tsconfig.json with noEmit (no build artifacts)
  - jsr.json for JSR dual-registry publishing
  - MiddlewareHandler return type on slogMiddleware (JSR slow types compliance)
  - README.md with install, usage, API reference for both entrypoints
affects:
  - 04-02 (publishing credentials/CI/CD — uses package config established here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Source-first exports: package.json exports point directly to src/*.ts, no build step required
    - Dual-registry config: package.json for npm, jsr.json for JSR, identical version/name/@bjro/slog
    - JSR slow types: all public API functions have explicit return types (MiddlewareHandler pattern)

key-files:
  created:
    - jsr.json
  modified:
    - package.json
    - tsconfig.json
    - src/hono.ts
    - README.md

key-decisions:
  - "Source-first exports: package.json exports point to src/*.ts not dist/ — consumers use bundler or tsx/Deno directly"
  - "Apache-2.0 license replacing ISC — matches project intent for open-source contribution"
  - "MiddlewareHandler imported from hono (not hono/factory) — canonical export path"
  - "jsr.json excludes *.test.ts files from publish — keeps registry package clean"

patterns-established:
  - "Source-first npm publish: export src/*.ts directly, consumers handle TS compilation"
  - "JSR slow types compliance: annotate all public function return types explicitly"

requirements-completed: [PACK-01, PACK-02, PACK-03, PACK-04, PACK-07]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 04 Plan 01: Packaging Configuration Summary

**Dual-registry npm+JSR config with source-first exports, MiddlewareHandler return type for JSR slow types, and complete API README**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T16:49:13Z
- **Completed:** 2026-03-21T16:50:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Renamed package to @bjro/slog, updated exports from dist/ to src/*.ts, added files whitelist and Apache-2.0 license
- Created jsr.json for JSR dual-registry publishing with matching exports and test exclusion
- Simplified tsconfig.json to noEmit (removed outDir, declaration, declarationMap, sourceMap)
- Fixed JSR slow types violation in slogMiddleware by importing and annotating MiddlewareHandler return type
- Replaced stub README with complete documentation: install, quick start, transport/plugin/hono examples, full API reference table

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix package.json, tsconfig.json, create jsr.json** - `d039dd5` (chore)
2. **Task 2: Add explicit return type to slogMiddleware and update README** - `9f2abee` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `package.json` - Renamed to @bjro/slog, source-first exports, files whitelist, Apache-2.0, no dependencies field
- `tsconfig.json` - noEmit: true, removed outDir/declaration/declarationMap/sourceMap/rootDir
- `jsr.json` - New file: JSR package config with matching exports and test file exclusion
- `src/hono.ts` - Added `import type { MiddlewareHandler } from 'hono'` and annotated slogMiddleware return type
- `README.md` - Complete documentation replacing 2-line stub

## Decisions Made

- Source-first exports: export src/*.ts directly rather than building to dist/ — eliminates build step, consumers use bundler or tsx/Deno
- MiddlewareHandler imported from `hono` (top-level) not `hono/factory` — canonical package export path
- Apache-2.0 license replacing ISC — better fit for open-source contribution goals
- jsr.json excludes `**/*.test.ts` — keeps published registry package clean of test files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — tsc --noEmit passed immediately, all 114 tests continued to pass after changes.

## User Setup Required

None - no external service configuration required. Publishing credentials/CI will be addressed in plan 04-02.

## Next Phase Readiness

- package.json, tsconfig.json, jsr.json fully configured for publishing
- `tsc --noEmit` passes, `npm test` passes (114 tests)
- `npm pack --dry-run` shows clean tarball: src/, LICENSE, README.md only
- Ready for 04-02: publishing credentials, CI/CD pipeline, actual registry publish

---
*Phase: 04-packaging-and-publishing*
*Completed: 2026-03-21*
