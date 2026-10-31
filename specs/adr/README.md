# Architecture Decision Records (Connect-Frontend)

One file per significant decision: `NNNN-kebab-title.md`, from [`../templates/adr.md`](../templates/adr.md). Accepted ADRs are immutable — supersede with a new one.

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-in-memory-access-token.md) | Keep the access token in memory, refresh via HttpOnly cookie | Accepted |
| [0002](./0002-client-side-frame-e2ee.md) | Encrypt frames in the browser (Encoded Transform) with a per-room key | Accepted |
| [0003](./0003-shared-signaling-types.md) | How to keep `types.ts` in sync with the backend | **Proposed — decision needed** |
