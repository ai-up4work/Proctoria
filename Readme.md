# Proctoria — multi-page structure

## What changed vs. the single-page version
- Detection math + constants → `lib/gaze.ts` (pure, testable)
- Monitoring logic → `hooks/useGazeMonitor.ts` (headless-capable: video element
  can be hidden, canvas overlay is optional via `drawOverlay`)
- Real-time transport → `hooks/useProctorSocket.ts` + `server/ws-server.js`
- Mock ID login + session → `context/SessionContext.tsx`, `app/login/page.tsx`

## Pages
| Route | Who | Camera shown? | Purpose |
|---|---|---|---|
| `/login` | everyone | no | mock ID-number sign-in, picks role |
| `/exam/[examId]/sit` | student | **no** (hidden `<video>`, monitoring still runs) | the actual exam, questions only, only this student's alerts appear |
| `/monitor/[studentId]` | student (own link) | yes | reference view of their own camera + flags, shareable link |
| `/proctor/dashboard` | proctor | no (links out to each student's feed) | roster of all students, live cross-student event feed, send a targeted alert to any one student |

## Running it
1. `npm install ws` (server) and make sure `@mediapipe/tasks-vision`, `lucide-react`
   are already in your app's `package.json`.
2. Start the WebSocket hub as its own process:
   ```
   node server/ws-server.js
   ```
   (Next.js's default server can't host a raw `ws` connection without a custom
   server, so this stays separate — point `NEXT_PUBLIC_WS_URL` at wherever you
   deploy it, e.g. a small Fly.io/Render process, in production.)
3. Run your Next.js app as usual. Set `NEXT_PUBLIC_WS_URL=ws://localhost:8080`
   in `.env.local` for local dev.

## Fixes folded in from the review
- Multi-face branch now sets a real `reason` string instead of silently
  logging "no face" (bug in the original).
- Tab-switch / window-blur detection added on the exam page via
  `visibilitychange`, flagged the same way as gaze events.
- Global styles (`html, body` background) should move to `app/globals.css`
  instead of `<style jsx global>` inside a single page — otherwise they'll
  leak onto `/login`, `/proctor/dashboard`, etc. once you have more than one
  route.

## Known gaps worth calling out (also good material for your dissertation's
## limitations section, since detection is 100% client-side)
- No server-side verification of flags — a modified client could fake
  "Verified" forever. Fine for a demo; call it out explicitly if this maps to
  your MSc write-up.
- `ws-server.js` keeps roster/state in memory only — fine for a class demo,
  not for production (add persistence + auth on the socket itself before any
  real deployment).
- No fullscreen enforcement yet — logical next addition alongside the
  tab-switch detection.