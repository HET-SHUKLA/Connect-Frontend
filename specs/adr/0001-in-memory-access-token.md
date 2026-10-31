# ADR-0001 — Keep the access token in memory, refresh via HttpOnly cookie

- **Status:** Accepted
- **Date:** 2026-11-01 (records a decision from the project report §4.6)

## Context

Tokens in `localStorage` are readable by any script (XSS). Authentication-Service sets the refresh token as an HttpOnly cookie for web clients and returns a short-lived access JWT in the response body.

## Options considered

1. `localStorage` / `sessionStorage` — simple, survives reloads, XSS-exposed.
2. Access token in memory + refresh cookie — limits exposure; needs a silent refresh on page load.

## Decision

Option 2. The access token lives in a module/React state only; on load and on 401 the app calls `POST /auth/refresh` with `credentials: "include"` once, then redirects to login.

## Consequences

Requires CORS with credentials on the auth service and the correct cookie path/SameSite settings; logout must also clear in-memory state. Not implemented yet (no auth UI).
