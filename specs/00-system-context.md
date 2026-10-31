# 00 — System Context

Connect is made of three independent repositories. **This file is deliberately duplicated in each repo** so that any one of them can be cloned and worked on alone; it summarises the project report ("Online End-to-End Encrypted (E2EE) Video Conferencing Application", MCA Major Project, SRM IST, Oct 2026). If you change shared facts, mirror the change in the sibling repos' `specs/00-system-context.md` when you next touch them.

## This repo

**Connect-Frontend** — React SPA: UI, WebRTC client (mediasoup-client), client-side E2EE (frame encryption + room-key exchange). It consumes Connect-Backend's REST/WebSocket contract (mirrored in `src/types.ts`, see [04-backend-contract.md](./04-backend-contract.md)) and, once integrated, Authentication-Service's REST API (see [05-auth-integration.md](./05-auth-integration.md)).

## Vision and problem

A self-hostable, Google-Meet-style video conferencing app where **media is end-to-end encrypted** — not even the operator's servers can read it — yet scales to multi-party rooms via a Selective Forwarding Unit (SFU).

- Mainstream platforms decrypt media server-side (cf. the FTC action against Zoom's "end-to-end" claims).
- P2P mesh gives E2EE but upload grows O(N). An SFU scales but terminates DTLS-SRTP, so it can read media unless an extra frame-level encryption layer is added (Jitsi / SFrame approach).
- Few compact, open, containerised reference systems combine SFU scale + authenticated access + queues + observability. Connect targets that gap.

Target users: privacy-sensitive groups (legal, healthcare, journalism, small organisations) that want to self-host.

## Repositories and contracts

| Repo | Role | Stack | Owns |
|---|---|---|---|
| `Authentication-Service` | Identity: register/login/Google, JWT, refresh sessions, email verification | Fastify 5, Prisma 7, PostgreSQL 16, Redis, BullMQ, AWS SES | REST `/api/v1/auth`, `/user`, JWT format, `users/sessions/verification_tokens` schema |
| `Connect-Backend` | Rooms, WebSocket signaling, mediasoup SFU, TURN credentials | Node 20+, Express 5, `ws`, mediasoup 3, Zod | REST `/api` (rooms, keys, ICE servers), WebSocket message vocabulary |
| `Connect-Frontend` | React SPA: UI, WebRTC, E2EE | React 19, Vite 8, TypeScript, mediasoup-client | UI, client-side E2EE (frame encryption, key exchange) |

Planned runtime wiring: Browser → (Nginx) → Authentication-Service for login/refresh; Browser → Connect-Backend with the access token for room create/join; Connect-Backend validates the JWT; media goes browser ⇄ mediasoup over SRTP/UDP (frame-encrypted) with Coturn for NAT traversal.

```
Browser (React) ──HTTPS──▶ Nginx ──▶ Authentication-Service ──▶ PostgreSQL / Redis ─▶ BullMQ ─▶ AWS SES
      │                      └─WSS─▶ Connect-Backend (signaling + mediasoup workers)
      └──────── SRTP/UDP (frame-encrypted) ───────▶ mediasoup ◀──▶ Coturn (TURN/STUN)
```

**Current wiring (as built):** the three repos are not yet connected — the frontend talks only to Connect-Backend (no login), and Connect-Backend does not validate tokens.

## Actors and use cases

Host (authenticated; creates room, manages participants, ends call) · Participant (authenticated; joins with code/password) · System (token validation, media routing) · Administrator (monitoring, containers).

UC-01 Register/Login · UC-02 Create room · UC-03 Share room link · UC-04 Manage participants · UC-05 End call · UC-06 Join room · UC-07 Toggle audio/video · UC-08 Screen share · UC-09 Text chat · UC-10 Leave room · UC-11 Authenticate token · UC-12 Route media · UC-13 Monitor system · UC-14 Manage containers.

## Target end-to-end flow (report §2.3.2)

1. Client signs up/logs in at Authentication-Service → access JWT (+ refresh token; refresh when expired).
2. Client calls Connect-Backend with the JWT → backend validates it → room info.
3. Client opens the WebSocket; backend creates/gets the mediasoup Router and returns RTP capabilities.
4. Client requests send/recv transports, performs the DTLS handshake with mediasoup.
5. Client produces audio/video; the backend creates Producers; other clients consume via Consumers (encrypted RTP).

## Key design decisions (report §4.6)

SFU over full mesh (constant upload per client) · Fastify for auth · access token in memory, refresh token in HttpOnly cookie · Prisma ORM · BullMQ for email (non-blocking, retries) · Redis shared rate limiting · self-hosted Coturn · host networking for the mediasoup container in production (contiguous UDP range). Details live in each repo's `adr/`.

## Delivery phases

1 Requirements & design → 2 Core implementation (signaling, SFU, WebRTC, auth) → 3 Feature completion (React UI, PostgreSQL, JWT, rooms) → 4 Observability & security → 5 Testing & deployment. Future work (report §8.5): multi-node SFU, lobby/co-host/spotlight, scheduling, email reminders, persistent + E2EE chat, React Native app, AI transcription.

## Glossary

SFU – Selective Forwarding Unit · Producer/Consumer – a track sent to / received from the SFU · Transport – mediasoup WebRTC transport (DTLS endpoint) · DTLS-SRTP – hop-by-hop WebRTC media encryption, terminated at the SFU · Insertable Streams / `RTCRtpScriptTransform` – browser API to encrypt encoded frames before SRTP · TURN – relay for clients behind strict NAT · Room key – AES-GCM key shared by participants of one room.
