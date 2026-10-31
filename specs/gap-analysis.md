# Gap Analysis and Roadmap (Connect-Frontend)

Differences between the project report (target) and this repo's code, plus known defects. Update when a gap closes or a new one appears. Last verified 2026-11-01.

## A. Report vs code

| # | Area | Report says | Code today | Action |
|---|---|---|---|---|
| G1 | Auth UI | Login/register forms, in-memory JWT, session management, protected routes | Display name only (`localStorage`) | FR-AUTH-*; see `05-auth-integration.md` |
| G2 | HTTP client | Axios | `fetch` | Keep `fetch` (no need for Axios) — fix the report wording, or add a thin `api/` module |
| G3 | Realtime client | Socket.IO client | Socket.IO client (`lib/socket.ts`) — done | Rename events to colon style together with the backend |
| G4 | Architecture | `useMediasoup()` facade hook | Logic inline in `MeetingPage` (~480 lines) + `lib/mediasoupClient.ts` | Refactor feature |
| G5 | Chat | In-call chat panel | Not present | FR-CHAT-01 |
| G6 | Screen share | UC-08 | Not present | FR-MEDIA-04 |
| G7 | Host controls | Mute/remove/end | Not present | FR-ROOM-04/05 |
| G8 | Room password | Password-protected rooms | Not present | FR-ROOM-02 |
| G9 | Versions | React 18, Vite 5, TS 5 | React 19, Vite 8, TS 6 | Docs only |
| G10 | Testing | Jest + Playwright E2E | No tests, no test script | NFR-QA-01 |
| G11 | Quality gates | ESLint + Prettier + pre-commit hooks | ESLint script only | Add Prettier + hook |
| G12 | Deployment | Static build behind Nginx/TLS in Docker | Manual `scp dist/` (note in local `.env`), plain `http://` URLs | Deployment feature; make scheme configurable (`https`/`wss`) |

## B. Known defects (not yet fixed)

| # | Where | Defect |
|---|---|---|
| D1 | `public/e2eeWorker.js` | **Fails open**: no key ⇒ frames pass through unencrypted; any encrypt/decrypt error ⇒ frame passes through |
| D2 | `lib/mediasoupClient.ts` `initE2eeWorker` | Key is posted to the worker asynchronously after `exportKey()`; frames produced before it arrives are sent unencrypted (race with D1) |
| D3 | `pages/MeetingPage` | E2EE badge (`e2eeActive`) is set right after `initE2eeWorker` regardless of key delivery |
| D4 | `pages/MeetingPage` | Possible split keys when two peers join an empty room concurrently (each generates a key); joiner trusts the first `key-exchange-received` |
| D5 | `pages/MeetingPage` | `remotePeerNames` is never populated → remote tiles show peer-id prefixes; display names are not exchanged (needs a backend message) |
| D6 | `lib/socket.ts` | no reconnect/rejoin logic (auto-reconnect deliberately off); only `join-error` exists as a server error message |
| D7 | `pages/*` | Backend URL scheme hard-coded to `http://`; default host `192.168.31.130:8080` is a personal LAN IP |
| D8 | `src/types.ts` | Manual mirror of backend types; no check that it stays in sync |
| D9 | `types`, handlers | `any` used for socket handler messages and consumers |

## C. Suggested roadmap (each becomes a feature spec)

1. **001 E2EE fail-closed** — D1–D3, feature-detect `RTCRtpScriptTransform` (see `03-e2ee.md`).
2. **002 Auth UI** — login/register/verify, in-memory token, silent refresh, protected routes (G1) — depends on provider readiness.
3. **003 Meeting refactor** — `useMediasoup` hook, `api/` module, remove `any` (G4, D9).
4. **004 Connection robustness** — configurable scheme, timeouts, reconnect (D6, D7).
5. **005 Host controls + room password UI** (G7, G8) — needs backend support.
6. **006 Chat** and **007 Screen share** (G5, G6).
7. **008 Tests** — component tests + Playwright journeys (G10).
8. **009 Deployment** — Dockerfile + Nginx, env-driven URLs (G12).
