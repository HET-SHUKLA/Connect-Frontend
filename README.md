# Connect — Frontend

React single-page app for **Connect**, an end-to-end encrypted (E2EE) video conferencing application. Media is encrypted in the browser before it leaves your device, so the SFU that routes it cannot read it.

Part of the Connect system:

| Repo | Role |
|---|---|
| [Connect-Frontend](https://github.com/HET-SHUKLA/Connect-Frontend) (this repo) | Web client: UI, WebRTC, E2EE |
| [Connect-Backend](https://github.com/HET-SHUKLA/Connect-Backend) | Signaling + mediasoup SFU + TURN credentials |
| [authentication-service](https://github.com/HET-SHUKLA/authentication-service) | Accounts, JWT, sessions (not yet wired into the UI) |

## Features

- Create a meeting or join with a 6-character code; share `/room/ABCDEF` links.
- Lobby with camera/microphone preview and device selection.
- Multi-party video grid, self-view picture-in-picture with audio visualiser, mic/camera toggles, participants panel, join/leave toasts.
- Per-room E2EE of audio/video frames (AES-GCM via WebRTC Encoded Transform) with ECDH-based room-key exchange.

**Not built yet:** login/registration, room passwords, host controls, text chat, screen sharing. See the roadmap in [specs/gap-analysis.md](./specs/gap-analysis.md).

## Tech stack

React 19 · TypeScript · Vite 8 · react-router-dom 6 · mediasoup-client 3 · Web Crypto API · lucide-react

## Quick start

Prerequisites: Node.js 20+, a running [Connect-Backend](https://github.com/HET-SHUKLA/Connect-Backend).

```bash
git clone https://github.com/HET-SHUKLA/Connect-Frontend.git
cd Connect-Frontend
npm install
cp .env.example .env     # set VITE_BACKEND_HOST
npm run dev
```

The dev server runs over HTTPS (self-signed, `@vitejs/plugin-basic-ssl`) and listens on the LAN, because browsers only expose camera/microphone on secure origins. Accept the certificate warning, then open the printed URL in two tabs to test a call.

## Environment

| Variable | Description |
|---|---|
| `VITE_BACKEND_HOST` | Connect-Backend `host:port` **without** scheme, e.g. `localhost:8080`. The app calls `http://<host>/api` and `ws://<host>/ws`. Defaults to `192.168.31.130:8080` if unset |

`.env` is gitignored; only `.env.example` is committed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build |

There is no automated test suite yet.

## Project structure

```
src/
  pages/
    LandingPage/        # Home — create or join a room
    MeetingPage/        # Lobby preview + full meeting UI (join/produce/consume flow)
  components/
    ControlBar/         # Mic, camera, participants, leave
    DeviceSelector/     # Camera / microphone pickers
    VideoTile/          # Remote participant tile
    LocalVideo/         # Self-view PiP with audio visualiser
    ParticipantsPanel/  # Slide-in participants list
    Toast/              # Join/leave notifications
  context/
    UserContext.tsx     # Persists the display name across pages
  lib/
    socket.ts           # WebSocket singleton (connect / on / send / disconnect)
    mediasoupClient.ts  # mediasoup Device, transports, produce/consume, E2EE wiring
    crypto.ts           # AES-GCM helpers
    keyExchange.ts      # ECDH P-256 key pair + room-key wrapping
  styles/globals.css    # Design tokens + reset
  types.ts              # Signaling message types (mirror of Connect-Backend/src/types.ts)
public/
  e2eeWorker.js         # Worker that encrypts/decrypts encoded frames
```

## Routes

| Path | Page |
|---|---|
| `/` | Landing — create or join |
| `/room/:roomId` | Meeting — lobby, then call |

Opening a `/room/ABCDEF` link takes the recipient straight to the lobby for that room.

## How E2EE works (short version)

1. Each client generates an ECDH P-256 key pair and publishes its public key via the backend.
2. The first participant creates a random AES-GCM-256 room key; later joiners request it and receive it wrapped with an ECDH-derived key, relayed opaquely by the server.
3. A worker attached through `RTCRtpScriptTransform` encrypts every outgoing encoded frame and decrypts incoming ones, so the SFU only forwards ciphertext.

**Current limitations** (tracked in [specs/03-e2ee.md](./specs/03-e2ee.md)): public keys are served by the backend without authentication, the worker forwards frames unencrypted if no key is available, and the room key is not rotated when participants leave. Browsers without `RTCRtpScriptTransform` support are not handled. Treat this as a work in progress, not an audited E2EE implementation.

## For contributors and AI agents

See [AGENTS.md](./AGENTS.md) for conventions, commands and known gaps. The project is developed spec-first; this repo is self-contained, with specs, ADRs and agent prompts in [specs/](./specs/README.md) and `.github/`.
