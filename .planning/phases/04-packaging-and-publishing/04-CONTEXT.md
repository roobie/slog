# Phase 4: Packaging and Publishing - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Correct exports map, TypeScript declarations, explicit return types for JSR slow types compliance, dual publish to npm and JSR via GitHub Actions, and `attw` type-checking in CI. No new features — this phase makes the existing code publishable.

</domain>

<decisions>
## Implementation Decisions

### Build Tooling
- **No JS build step** — ship TypeScript source directly, no compiled JS artifacts
- Consumers use their own bundler/transpiler (modern tooling assumed)
- Package exports point directly to `.ts` files: `"exports": { ".": "./src/index.ts", "./hono": "./src/hono.ts" }`
- Remove `dist/` references from package.json, remove `outDir` from tsconfig
- No tsup, no build script needed
- JSR natively ships TS source — this aligns perfectly

### CI Publish Workflow
- GitHub Actions for CI
- Tag-triggered publish: push `v1.0.0` tag → CI publishes to both npm and JSR
- Single workflow file: `.github/workflows/publish.yml`
- Atomic: if either registry rejects, the workflow fails
- Manual version bump: edit package.json version, tag, push
- CI also runs tests + `tsc --noEmit` + `attw` before publishing

### Package Identity
- npm name: `@bjro/slog`
- JSR name: `@bjro/slog` (consistent across both registries)
- License: Apache 2.0 (explicit patent grant, superior to MIT)
- Add LICENSE file with Apache 2.0 text
- Update package.json: name, license, author fields

### JSR Compliance
- Create `jsr.json` with name `@bjro/slog`, exports map matching package.json
- Audit all public API functions and add explicit return type annotations where missing
- Run `jsr publish --dry-run` to verify no slow types errors
- `hono` listed as JSR `peerDependency` equivalent

### Type Checking CI
- `attw` (Are The Types Wrong?) in CI to verify exports resolve correctly
- Test under both `node16` and `bundler` moduleResolution
- `npx @arethetypeswrong/cli --pack` as CI step

### Claude's Discretion
- Exact GitHub Actions workflow syntax
- Which `attw` flags to use
- Whether to add a `prepublishOnly` script
- README content and structure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current package config
- `package.json` — Current exports map, dependencies, scripts
- `tsconfig.json` — Current TypeScript config (needs `allowImportingTsExtensions` + `dist/` adjustments)

### Source entrypoints
- `src/index.ts` — Main barrel export
- `src/hono.ts` — Hono middleware subpath export

### Requirements
- `.planning/REQUIREMENTS.md` — PACK-01 through PACK-07

### Reference implementation
- `/home/jani/devel/entitle-edge/packages/wlog/index.ts` — wlog's package.json for comparison

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` already has subpath exports configured (pointing to `dist/` — needs updating to `src/`)
- `tsconfig.json` has `declaration: true` and `strict: true` already
- All source files use `.ts` extension imports (`import from './types.ts'`)

### Established Patterns
- ESM-only (`"type": "module"`)
- `peerDependencies` for hono (already set)
- Zero runtime dependencies (no `dependencies` field)

### Integration Points
- All public API is exported from `src/index.ts` and `src/hono.ts`
- 114 tests across 12 test files provide regression safety
- `attw` needs the package to be packable — `npm pack` must produce a valid tarball

</code_context>

<specifics>
## Specific Ideas

- Since we ship TS source directly, the `types` condition in exports should point to the same `.ts` file — consumers get types from the source itself
- JSR's `jsr.json` exports format mirrors package.json exports but uses `.` notation
- The `attw` check may need special handling for TS-source-only packages — verify it works without compiled JS

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-packaging-and-publishing*
*Context gathered: 2026-03-21*
