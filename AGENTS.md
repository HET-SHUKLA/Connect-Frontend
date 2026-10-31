# Connect-Frontend — Agent Guide

React single-page client for **Connect**, an end-to-end encrypted (E2EE) video conferencing app: landing page, lobby, meeting room with mediasoup-client, and frame-level E2EE in a Web Worker. This repo is **self-contained**: everything an agent needs is here, including the specs. It is one of three sibling repos (`Connect-Backend`, `Authentication-Service`) that you do **not** need cloned; the contracts you consume are documented in [specs/](./specs/README.md).

## Spec-driven workflow

Read the relevant spec **before** changing code; update it in the same change.

1. **Specify** — find/create the spec in `specs/` (`/spec-new` creates `specs/features/NNN-slug.md` from [the template](./specs/templates/feature-spec.md)). Requirements have IDs (`FR-MEDIA-04`) in [specs/01-requirements.md](./specs/01-requirements.md).
2. **Decide** — significant choices become an ADR in `specs/adr/` ([template](./specs/templates/adr.md)).
3. **Plan** — affected files/components, contract needs (REST/WS/auth), ordered tasks, in the feature spec.
4. **Implement** — types and lib first, then components/pages, then docs. Small vertical slices (`/spec-implement`).
5. **Verify** — `npm run build` and `npm run lint`; exercise the flow in a browser (two tabs for a meeting).
6. **Sync** — update spec status, requirement table, gap analysis, README (`/spec-sync`).

Source priority when sources disagree: user instruction > `specs/` > README/AGENTS.md > code comments. `specs/00-system-context.md` summarises the project report (target design); the code is the *current* state; [specs/gap-analysis.md](./specs/gap-analysis.md) lists every known difference. If something is undecided, ask the user.

## Spec map

| File | Contents |
|---|---|
| [00-system-context.md](./specs/00-system-context.md) | Vision, actors, whole-system architecture, sibling repos and contract ownership |
| [01-requirements.md](./specs/01-requirements.md) | Requirements relevant to this repo, with status |
| [02-frontend.md](./specs/02-frontend.md) | Routes, components, meeting flow, mediasoup client, state, config |
| [03-e2ee.md](./specs/03-e2ee.md) | Encryption design, threat model, weaknesses, rules (implemented in this repo) |
| [04-backend-contract.md](./specs/04-backend-contract.md) | REST + WebSocket contract you consume (owned by Connect-Backend) |
| [05-auth-integration.md](./specs/05-auth-integration.md) | Auth endpoints and token handling you consume (owned by Authentication-Service) |
| [gap-analysis.md](./specs/gap-analysis.md) | Report-vs-code gaps, known defects, roadmap |
| [adr/](./specs/adr) · [features/](./specs/features) · [templates/](./specs/templates) | Decisions, per-feature specs, templates |

Prompts: `/spec-new`, `/spec-implement`, `/spec-sync` in [.github/prompts](./.github/prompts). Path rules: [.github/instructions](./.github/instructions).

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build → dist/
npm run lint      # eslint .
npm run preview
```
No test suite exists yet. Don't claim tests passed; state exactly what you ran. Config: `.env` (gitignored; copy `.env.example`) with `VITE_BACKEND_HOST=host:port` — no scheme.

## Layout

| Path | Role |
|---|---|
| `src/main.tsx`, `App.tsx` | Bootstrap and routes (`/`, `/room/:roomId`) |
| `src/pages/LandingPage` | Create/join room entry |
| `src/pages/MeetingPage` | Lobby + meeting orchestration (large; refactor planned) |
| `src/components/` | `ControlBar`, `DeviceSelector`, `LocalVideo`, `ParticipantsPanel`, `Toast`, `VideoTile` |
| `src/context/UserContext.tsx` | Display name (localStorage) |
| `src/lib/socket.ts` | WebSocket wrapper (`waitFor`, handlers) |
| `src/lib/mediasoupClient.ts` | Device, transports, produce/consume, E2EE worker setup |
| `src/lib/crypto.ts`, `keyExchange.ts` | WebCrypto: AES-GCM room key, ECDH P-256 key wrapping |
| `src/types.ts` | Mirror of Connect-Backend's signaling types — **not owned here** |
| `public/e2eeWorker.js` | Encoded-transform worker that encrypts/decrypts frames |

## Contracts

- You **consume** the backend REST/WS contract ([04](./specs/04-backend-contract.md)) and, once built, the auth API ([05](./specs/05-auth-integration.md)). Don't invent messages or endpoints; if a feature needs one, put it in the feature spec's cross-repo impact section and ask the owner.
- `src/types.ts` must stay equivalent to the backend's `src/types.ts` ([ADR-0003](./specs/adr/0003-shared-signaling-types.md)).

## Rules for every change

- Strict TypeScript, no new `any`. Function components + hooks; keep media/WebSocket logic in `src/lib` or hooks, not in JSX.
- Register WebSocket handlers before sending `join-room`; create `waitFor()` promises before the request they wait on.
- Stop media tracks and close transports/consumers/sockets on leave and unmount.
- Never log, persist (`localStorage`, URLs) or send to the server room keys or private keys. Never claim "encrypted" in the UI unless the worker holds a key. Changes near E2EE need a note in [03-e2ee.md](./specs/03-e2ee.md).
- Access tokens: memory only ([ADR-0001](./specs/adr/0001-in-memory-access-token.md)).
- New env var ⇒ `.env.example` **and** README. Only `VITE_*` vars reach the client — never put secrets in them. Never commit `.env`.
- No features beyond the active spec; unrelated defects go to `specs/gap-analysis.md`, not into the diff.
- Git: feature branches (`feat/<slug>`); never push, force-push or rewrite history unless asked.
- Keep the README truthful when setup or behaviour changes.

## Known gaps (don't assume these exist)

No auth UI; no chat; no screen share; no host controls or room password; E2EE worker fails open and public keys are unauthenticated; no tests; no Docker/Nginx. See [gap-analysis.md](./specs/gap-analysis.md).
