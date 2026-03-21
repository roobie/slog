# Quick Task 260321-prs: fix jsr score - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Task Boundary

Fix all missing JSR score items to maximize the score from 52% to as close to 100% as possible.

</domain>

<decisions>
## Implementation Decisions

### JSDoc Documentation
- Add JSDoc with brief description + @param + @returns on all exported symbols
- Add `/** @module */` doc comment at top of both entrypoints (src/index.ts, src/hono.ts)
- Not full @example blocks — descriptions + params is sufficient

### JSR Configuration
- Add `description` field to jsr.json
- Mark all four runtimes as compatible: Node.js, Deno, Bun, Cloudflare Workers

### CI Runtime Validation
- Add Bun and Deno test runners to CI workflow to validate runtime compatibility claims
- Try `bun test` (runs Vitest natively) and Deno equivalent
- These are test matrix entries, not publish steps

### Claude's Discretion
- Exact JSDoc wording
- Whether to use a CI matrix or separate jobs for runtime testing

</decisions>

<specifics>
## Specific Ideas

- `bun test` likely works out of the box since Bun supports Vitest
- Deno can run tests via `deno run npm:vitest run` or `deno test`

</specifics>

<canonical_refs>
## Canonical References

- `jsr.json` — Current JSR config (needs description field)
- `src/index.ts` — Main barrel (needs module doc + symbol docs)
- `src/hono.ts` — Hono entrypoint (needs module doc + symbol docs)
- `.github/workflows/publish.yml` — CI workflow (add runtime test matrix)

</canonical_refs>
