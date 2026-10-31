# 04 — Backend Contract (consumed by Connect-Frontend)

Connect-Backend **owns** this contract; this file is the frontend's mirror so you can work without the backend repo. The TypeScript copy is `src/types.ts` — keep it identical in meaning to the backend's `src/types.ts`. If you see drift between the two, the backend is the source of truth: ask the owner before "fixing" it on one side. Last verified 2026-11-01.

## Base URL

`VITE_BACKEND_HOST` = `host:port` (no scheme). REST: `http://<host>/api`. Socket.IO: `http://<host>` (default path `/socket.io`). (Production must be `https`.)

## REST

| Method | Path | Response | Notes |
|---|---|---|---|
| POST | `/api/rooms` | `{ roomId }` | 6-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; no auth yet |
| GET | `/api/rooms/:roomId` | `{ roomId }` or `404 { error }` | Used to validate a code before navigating |
| GET | `/api/turn-credentials` | `{ iceServers }` | ICE servers (static env today) |
| POST | `/api/keys/:peerId` | `{ ok: true }` | Body `{ publicKey }` (base64 ECDH P-256); in-memory registry |
| GET | `/api/keys/:peerId` | `{ publicKey }` or `404` | Public key of a peer |

Planned changes (not yet in backend): `/api/v1` prefix, `Authorization: Bearer <jwt>` on room endpoints, room password, host controls.

## Socket.IO — each message is an event named after its `type`, payload is the JSON message (`socket.emit(msg.type, msg)`)

| Dir | `type` | Payload | Notes |
|---|---|---|---|
| C→S | `join-room` | `roomId` | Unknown room ⇒ `join-error`, then the server disconnects |
| S→C | `joined-room` | `peerId` | |
| S→C | `router-rtp-capabilities` | `rtpCapabilities` | Load mediasoup `Device` |
| C→S | `create-transport` | `roomId, direction: "send"\|"receive"` | |
| S→C | `transport-created` | `id, iceParameters, iceCandidates, dtlsParameters, direction, iceServers` | |
| C→S | `connect-transport` | `transportId, dtlsParameters` | |
| C→S | `produce` | `roomId, kind, rtpParameters` | Needs send transport |
| S→C | `produce-created` | `producerId` | |
| S→C | `new-producer` | `producerId, peerId` | Also replayed for existing producers on join |
| C→S | `consume` | `roomId, producerId, rtpCapabilities` | |
| S→C | `consumer-created` | `consumerId, producerId, kind, rtpParameters` | |
| C→S | `request-key` | — | Ask existing peers for the room key |
| S→C | `key-requested` | `peerId` | Someone wants the key — respond with `key-exchange` |
| C→S | `key-exchange` | `targetPeerId, encryptedRoomKey` | Relayed opaquely |
| S→C | `key-exchange-received` | `fromPeerId, encryptedRoomKey` | |
| S→C | `peer-left` | `peerId` | |
| S→C | `join-error` | `reason` | Unknown room; the server then disconnects the socket |

Heartbeat is handled by Socket.IO. Auto-reconnect is disabled in the client (a reconnect would be a new peer without room state); the only error message is `join-error`.

## Frontend obligations

- Register persistent handlers before `join-room`; create `waitFor()` promises before sending the request they wait on.
- Treat unknown server message types as ignorable (forward compatibility).
- On a breaking contract change announced by the backend: update `src/types.ts`, this file, and the code in one change.

## Target contract (report §5.4, not implemented; backend ADR-0003: Socket.IO adopted, event renaming pending)

`room:join {roomId, token, password?}`, `room:joined`, `transport:create|created|connect`, `producer:create|new`, `consumer:create|created`, `room:leave`, `room:end`, chat events. **Whether this replaces the current vocabulary is an open decision owned by the backend**; don't pre-implement it.
