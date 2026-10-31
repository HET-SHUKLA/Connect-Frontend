# 01 — Requirements (Connect-Frontend)

Status as of 2026-11-01, verified against the code. Source: project report §2.4–2.5, §3.5. Only requirements this repo implements or enables are listed.

## Functional

### Auth (consumer of Authentication-Service)

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-AUTH-01 | Register UI: email + password with client-side validation | Planned | No login/register pages exist |
| FR-AUTH-02 | Login UI; store access token **in memory** | Planned | |
| FR-AUTH-04 | Silent refresh using the HttpOnly refresh cookie | Planned | |
| FR-AUTH-06 | Email-verification landing and password-reset UI | Planned | |
| FR-AUTH-07 | Google sign-in button | Planned | |
| FR-AUTH-09 | Protected routes (redirect unauthenticated users to login) | Planned | Currently only a display name is required |

### Rooms

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-ROOM-01 | Create a room | Implemented | `POST /api/rooms`; no auth |
| FR-ROOM-02/03 | Join by code, enter password if the room is protected | Partial | Join by code works; no password prompt |
| FR-ROOM-04 | Host UI to mute/unmute/remove participants | Planned | |
| FR-ROOM-05 | Host UI to end the session | Planned | |
| FR-ROOM-08 | Shareable room link `/room/:id` opening the lobby | Implemented | |

### Media / Chat / E2EE

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-MEDIA-01 | Real-time audio/video grid | Implemented | |
| FR-MEDIA-03 | Independent mic/camera toggles | Implemented | |
| FR-MEDIA-04 | Screen sharing | Planned | UC-08 |
| FR-MEDIA-07 | Audio/video device selection | Implemented | `DeviceSelector` |
| FR-CHAT-01 | In-call text chat panel | Planned | |
| FR-E2EE-01 | Frames encrypted before leaving the browser | Implemented | AES-GCM via `RTCRtpScriptTransform` — fail-open weaknesses, see `03-e2ee.md` |
| FR-E2EE-02 | Room key exchanged without the server seeing it | Partial | ECDH P-256; public keys unauthenticated |

## Non-functional

| ID | Requirement | Status |
|---|---|---|
| NFR-USE-01 | Works in modern browsers without plugins | Partial (needs `RTCRtpScriptTransform`; Safari/Firefox differ) |
| NFR-SEC-04 | Access token in memory, never `localStorage` | Planned (no token yet) |
| NFR-SEC-05 | UI never claims "encrypted" when frames could be sent unencrypted | Not met (badge shows after worker init regardless of key delivery) |
| NFR-PERF-01 | Same-region glass-to-glass latency < 150 ms | Not measured |
| NFR-QA-01 | Component tests (Jest/Vitest) and Playwright journeys (register → verify → login → create → join → leave) | Planned (none exist) |
| NFR-QUAL-01 | ESLint + Prettier via pre-commit hook | Partial (ESLint script only) |
| NFR-PORT-01 | Static build served by Nginx in Docker | Planned |
