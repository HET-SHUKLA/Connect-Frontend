# 05 — Auth Integration (consumer side)

Authentication-Service is a separate repo you may not have; this file is the **consumer-side contract** for what the frontend must do. The provider's spec is `specs/02-auth-service.md` in that repo. Status: **Planned** — no auth UI exists. Verified against the service's code on 2026-11-01.

## Provider API (base `/api/v1`, default dev port 3000)

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Email + password; **requires header `X-Client-Type: web`**; response envelope `{ status, success, message, data }`; sends a verification email |
| POST | `/auth/login` | Same header; `data` contains `accessToken`; the refresh token arrives as an HttpOnly cookie `refreshToken` (path `/api/v1/auth`, `SameSite=Lax`, `Secure` in prod) |
| POST | `/auth/google` | Body carries a Google ID token |
| POST | `/auth/refresh` | Cookie-based; returns a new access token (**provider bug open: refresh token returned as hash, see provider gap analysis — don't rely on rotation yet**) |
| GET | `/auth/me` | `Authorization: Bearer <access>`; profile `{ id, email, isEmailVerified, accountType }` |
| GET | `/auth/verify/:item/:token` | Email verification link target |
| DELETE | `/auth/logout`, `/auth/logout/all`, `/auth/logout/:sessionId` | Revoke sessions |

Rate limit: 10 requests/min/IP in production (HTTP 429).

## Frontend requirements

1. **Token storage**: access token only in memory (React state/module variable); never `localStorage`/`sessionStorage`. Refresh with the HttpOnly cookie (`fetch(..., { credentials: "include" })`) on app load and on 401, once per failure, then send the user to login.
2. **CORS/cookies**: the auth service currently registers **no CORS plugin** (provider gap G4), so cross-origin calls with credentials fail until it is added; coordinate before building.
3. **Protected routes**: `/room/:id` and room creation require a valid session; unauthenticated users are redirected to login and returned afterwards.
4. **Send the access token** to Connect-Backend (header on REST; join message/handshake on WS) once the backend supports it (see `04-backend-contract.md`).
5. **Display name** comes from the profile once logged in; `UserContext` currently stores a free-text name in `localStorage` — keep as fallback for guests only if guests are allowed (**Decision needed**: are guests allowed? report says only authenticated users create/join).
6. **Error UX**: surface envelope `message`; handle 401/403/409/429 distinctly.

## Open questions

Guest access? Email verification required before joining? Where is the auth base URL configured (`VITE_AUTH_HOST`)? Who owns the claim names (`sub` vs `userId`) — provider.
