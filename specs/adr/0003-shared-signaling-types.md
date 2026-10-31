# ADR-0003 — How to keep `types.ts` in sync with the backend

- **Status:** Proposed — **decision needed from the project owner**
- **Date:** 2026-11-01

## Context

`src/types.ts` is a hand-maintained copy of Connect-Backend's signaling types. The repos are independent, so a shared workspace/monorepo package is not available.

## Options considered

1. **Manual mirror + documented contract** (current): `04-backend-contract.md` is the readable contract; owners announce breaking changes. Cheap; drift is only caught at runtime.
2. **Published npm package** (e.g. `@connect/signaling-types`, from the backend repo or a tiny third repo): single source, versioned. Adds publishing overhead.
3. **Git dependency / submodule** on the backend repo's `types.ts`: no registry, but couples repos' checkouts and pulls server-only imports (`mediasoup/types`, `ws`).
4. **Schema-first** (JSON Schema/Zod schemas exported from the backend): validates at runtime on both sides; larger refactor.

## Decision

_Pending._ Recommendation: stay with option 1 until the signaling transport decision (backend ADR-0003) is settled, then revisit option 2 with the final vocabulary.

## Consequences

If a shared package is adopted, `types.ts` becomes a re-export and `04-backend-contract.md` is generated or trimmed.
