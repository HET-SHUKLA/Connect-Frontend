---
description: "Use when editing Connect-Frontend code: React components, pages, hooks, mediasoup-client, Socket.IO client, WebCrypto E2EE, the e2ee worker, Vite config"
applyTo: ["src/**", "public/**"]
---
# Connect-Frontend code rules

- Read [specs/02-frontend.md](../../specs/02-frontend.md) and [specs/04-backend-contract.md](../../specs/04-backend-contract.md) first (E2EE work: [specs/03-e2ee.md](../../specs/03-e2ee.md); auth work: [specs/05-auth-integration.md](../../specs/05-auth-integration.md)).
- React 19 function components with hooks; TypeScript strict, no new `any`. Put media/socket logic in `src/lib` or custom hooks, not inline in JSX.
- `src/types.ts` mirrors the backend's signaling types. Don't change message shapes here on your own; a contract change needs the backend owner and an update to `specs/04-backend-contract.md`.
- Register socket handlers before sending `join-room`; create `waitFor()` promises before the request they wait on.
- On leave/unmount stop all media tracks and close transports, consumers and the socket.
- Never log, persist, or send to the server any room key or private key. The UI may only show "encrypted" when the worker holds a key. `public/e2eeWorker.js` is plain JS loaded as a classic worker: no imports, no TypeScript.
- Keep access tokens in memory only; never `localStorage`/`sessionStorage`.
- Backend location comes from `VITE_BACKEND_HOST` (`host:port`, no scheme). Add new `VITE_*` vars to `.env.example` and the README; they are public, never put secrets in them.
- Verify with `npm run build` and `npm run lint`; there are no automated tests yet.
