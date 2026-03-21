---
phase: 04-packaging-and-publishing
plan: 02
subsystem: infra
tags: [github-actions, ci, npm, jsr, attw, provenance, oidc]

# Dependency graph
requires:
  - phase: 04-packaging-and-publishing
    provides: "package.json with @bjro/slog exports, jsr.json, src/*.ts explicit return types"
provides:
  - "Tag-triggered GitHub Actions publish workflow (.github/workflows/publish.yml)"
  - "Dual-registry publish: npm (NPM_TOKEN) and JSR (OIDC) on v* tag push"
  - "Sequential CI gates: tsc --noEmit, npm test, attw before any publish step"
affects: [publishing, release-workflow]

# Tech tracking
tech-stack:
  added: [github-actions, @arethetypeswrong/cli, jsr-cli]
  patterns: [tag-triggered-dual-publish, sequential-ci-gates, oidc-provenance]

key-files:
  created:
    - .github/workflows/publish.yml
  modified: []

key-decisions:
  - "npm publish uses NPM_TOKEN secret (not OIDC trusted publishing) — OIDC requires npmjs.com package to exist first"
  - "JSR publish uses OIDC via id-token: write permission — no token needed after repo is linked in JSR settings"
  - "attw --ignore-rules cjs-resolves-to-esm accepted — ESM-only package; node10 resolution failure is expected and documented"
  - "node10 attw failure is known limitation of TS-source-only packages without top-level main field"

patterns-established:
  - "Pattern: attw check gates publish — type resolution verified before either registry receives package"
  - "Pattern: Sequential jobs — if npm publish fails, JSR publish never runs"

requirements-completed: [PACK-05, PACK-06]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 4 Plan 02: Publish Workflow Summary

**Tag-triggered GitHub Actions workflow publishing @bjro/slog to npm and JSR with OIDC provenance, gated by tsc, vitest, and attw checks**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-21T16:52:52Z
- **Completed:** 2026-03-21T16:57:00Z
- **Tasks:** 1 of 2 completed (Task 2 is checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- GitHub Actions publish workflow created at `.github/workflows/publish.yml`
- Sequential CI gates ensure tests, typecheck, and attw all pass before any publish step
- JSR dry-run confirmed passing cleanly with no slow types (18 source files, 21ms)
- attw passes under node16 and bundler profiles; node10 failure documented as expected limitation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHub Actions publish workflow and run local verification** - `901b597` (feat)

**Plan metadata:** (pending — awaiting human-verify checkpoint)

## Files Created/Modified
- `.github/workflows/publish.yml` - Tag-triggered dual-registry publish with sequential CI gates

## Decisions Made
- npm publish uses NPM_TOKEN secret (not OIDC trusted publishing) — OIDC requires package to exist on npm first; NPM_TOKEN is the correct approach for first publish
- JSR publish uses OIDC with id-token: write — no token needed once repo is linked in JSR settings
- attw `--ignore-rules cjs-resolves-to-esm` accepted — ESM-only package, node16 and bundler profiles both green
- node10 attw failure ("Resolution failed") is a known limitation: TS-source exports without a top-level `main` field cannot resolve under node10 resolution; this matches the project's "modern tooling assumed" stance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- JSR dry-run initially failed with "Aborting due to uncommitted changes" — resolved by committing `.github/workflows/publish.yml` first, then re-running dry-run
- attw node10 profile shows "Resolution failed" for both entrypoints — this is expected (documented in research) for TS-source-only packages without a `main` field; node16 and bundler profiles pass

## attw Output Summary

```
@bjro/slog v1.0.0 (ignoring rules: cjs-resolves-to-esm)

           "@bjro/slog"        "@bjro/slog/hono"
node10     Resolution failed   Resolution failed   <- EXPECTED (no main field)
node16/CJS (ESM)               (ESM)               <- PASS
node16/ESM (ESM)               (ESM)               <- PASS
bundler    green               green               <- PASS
```

## JSR Dry-Run Output

```
Simulating publish of @bjro/slog@1.0.0 with 18 files
No slow types found
Success - Dry run complete (21ms)
```

## User Setup Required

Before first publish, the following external services require manual configuration:

**npm:**
1. Create `@bjro` organization/scope on npmjs.com (Add Organization)
2. Generate NPM_TOKEN: npmjs.com -> Access Tokens -> Generate New Token (Classic, Automation)
3. Add NPM_TOKEN as repository secret: GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret

**JSR:**
1. Create `@bjro` scope on jsr.io (Account -> Create Scope)
2. Link GitHub repo to JSR package for OIDC publishing: jsr.io -> @bjro/slog -> Settings -> GitHub Repository

## Next Phase Readiness
- Publish workflow complete — ready to trigger on first v1.0.0 tag push after external service setup
- All pre-publish checks (tsc, vitest 114 tests, attw, jsr dry-run) pass locally
- Package is ready for first publish pending user setup of npm scope and JSR scope

---
*Phase: 04-packaging-and-publishing*
*Completed: 2026-03-21*
