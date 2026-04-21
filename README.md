# Connect — Frontend

## Quick start

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` → `.env.local` and set:
```
VITE_BACKEND_HOST=192.168.31.130:8080
```

If left unset, defaults to `192.168.31.130:8080`.

## Project structure

```
src/
  pages/
    LandingPage/     # Home — create or join a room
    MeetingPage/     # Lobby preview + full meeting UI
  components/
    ControlBar/      # Mic, camera, participants, leave
    VideoTile/       # Remote participant tile
    LocalVideo/      # PiP self-view with audio visualizer
    ParticipantsPanel/ # Slide-in participants list
    Toast/           # Join/leave notifications
  context/
    UserContext.tsx  # Persists user name across pages
  lib/               # Unchanged — all E2EE / mediasoup logic
  styles/
    globals.css      # Design tokens + reset
```

## Routes

| Path | Page |
|------|------|
| `/` | Landing — create or join |
| `/room/:roomId` | Meeting — lobby then call |

Sharing a `/room/ABCDE` link takes the recipient directly to the lobby for that room.
