# ADR-0002 — Encrypt frames in the browser (Encoded Transform) with a per-room key

- **Status:** Accepted
- **Date:** 2026-11-01 (records implemented design)

## Context

The SFU terminates DTLS-SRTP; true E2EE needs encryption before SRTP with a key the server never learns (see `03-e2ee.md`).

## Options considered

1. DTLS-SRTP only — not E2EE.
2. `RTCRtpScriptTransform` + AES-GCM-256 room key, ECDH P-256 key wrapping over signaling (chosen).
3. SFrame / MLS — standards-based; browser/library maturity insufficient today.

## Decision

Option 2, implemented in `public/e2eeWorker.js`, `lib/crypto.ts`, `lib/keyExchange.ts` and wired in `lib/mediasoupClient.ts`.

## Consequences

Known weaknesses E1–E8 in `03-e2ee.md` (notably fail-open worker, unauthenticated public keys, no rotation). Requires `RTCRtpScriptTransform` support. A future ADR should supersede this one when moving to SFrame/MLS or when rotation/authenticated keys are added.
