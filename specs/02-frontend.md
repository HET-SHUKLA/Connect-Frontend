# 02 — Connect-Frontend

Repo: Connect-Frontend · React 19 + Vite 8 + TypeScript, `react-router-dom` 6, `lucide-react`, `mediasoup-client`. Dev server uses `@vitejs/plugin-basic-ssl` (HTTPS is required for `getUserMedia` and insertable streams on non-localhost hosts). The backend contract it consumes is in [04-backend-contract.md](./04-backend-contract.md); E2EE design in [03-e2ee.md](./03-e2ee.md).

## Routes

| Path | Page | Behaviour |
|---|---|---|
| `/` | `LandingPage` | Ask display name (stored in `localStorage` key `connect_user_name`), then **New Meeting** (`POST /api/rooms`) or **Join with Code** (6-char code, validated by `GET /api/rooms/:id`) |
| `/room/:roomId` | `MeetingPage` | Phases `lobby → connecting → connected / error`; lobby previews camera/mic with `DeviceSelector` |
| `*` | redirect to `/` | |

Target additions (not built): login/register/verify-email pages, protected routes, room password prompt, chat panel, screen-share button, host controls (mute/remove/end).

## Structure (`src/`)

| Path | Role |
|---|---|
| `pages/LandingPage`, `pages/MeetingPage` | Screens. **MeetingPage is a ~480-line monolith** holding the whole join/produce/consume/key-exchange flow |
| `components/ControlBar` | Mic, camera, participants, leave, room-code copy, E2EE badge |
| `components/VideoTile`, `LocalVideo` | Remote tile; self-view PiP with audio visualiser |
| `components/ParticipantsPanel`, `Toast`, `DeviceSelector` | Side panel, join/leave toasts, camera/mic pickers |
| `context/UserContext.tsx` | Display name only (no auth state yet) |
| `lib/socket.ts` | Singleton `WebSocket` wrapper: `connect`, `on`, `send`, `disconnect` (**must** be called on leave to clear handlers) |
| `lib/mediasoupClient.ts` | mediasoup `Device`, transports, produce/consume, `waitFor(type)` one-shot promises, mic/camera toggle, `replaceTrack`, E2EE worker wiring |
| `lib/crypto.ts` | AES-GCM helpers (room key, packet encrypt/decrypt) |
| `lib/keyExchange.ts` | ECDH P-256 key pair, shared key derivation (AES-GCM 256), room-key wrap/unwrap |
| `public/e2eeWorker.js` | Worker run by `RTCRtpScriptTransform`; encrypts/decrypts encoded frames |
| `types.ts` | Signaling message types — **manual mirror of Connect-Backend's `src/types.ts`** (see `04-backend-contract.md`) |
| `styles/globals.css` | Design tokens/reset; each component has its own co-located `.css` |

## Join flow (current)

1. Generate ECDH key pair → open WS → register persistent handlers (`new-producer`, `peer-left`, `key-requested`) **before** `join-room` (race-avoidance; keep this ordering).
2. `join-room` → `joined-room` (peerId) → publish public key via `POST /api/keys/:peerId` → `router-rtp-capabilities` → `Device.load`.
3. Create send + receive transports.
4. If no producers exist: generate room key; else `request-key` and unwrap the first `key-exchange-received`.
5. `initE2eeWorker(roomKey)` → `getUserMedia` → produce audio/video → consume existing producers; on each `new-producer`, send the room key to that peer, then consume.

## Config

`VITE_BACKEND_HOST` = `host:port` without scheme (code builds `http://…/api` and `ws://…/ws`; falls back to `192.168.31.130:8080`). `.env` is gitignored; `.env.example` is committed (the `.gitignore` has a `!.env.example` exception). Production must use `https://`/`wss://` behind Nginx.

## Design intent from the report not reflected in code

`useMediasoup()` facade hook (extract from MeetingPage), Axios client with in-memory access token + silent refresh, Socket.IO client, typed API layer, protected routes. Prefer extracting the facade hook and an `api/` module over adding more logic to `MeetingPage`.
