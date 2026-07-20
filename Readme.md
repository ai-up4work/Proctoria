# Proctoria — single-deployment (Vercel + Ably)

## Why Ably instead of raw `ws`
Vercel doesn't run a persistent Node process, so a self-hosted WebSocket
server (`ws-server.js`) can't live inside a Vercel deployment — it needs a
separate always-on host. Ably is a managed realtime service that Next.js
talks to over regular HTTP/serverless functions, so the *whole* app —
pages, API routes, and realtime — deploys as one Vercel project.

## What changed
- Removed `server/ws-server.js` entirely.
- Added `app/api/ably-token/route.ts` — a serverless route that mints a
  short-lived Ably token per client. This keeps your Ably API key server-side
  only; the browser never sees it.
- Rewrote `hooks/useProctorSocket.ts` to use the `ably` SDK:
  - One shared channel `proctoring-room` carries `status` and `flag`
    messages from every student, and Ably **Presence** on that channel is
    used to build the live roster (who's connected) — no manual
    connect/disconnect bookkeeping needed.
  - Per-student channels `alert-{studentId}` carry proctor → student
    alerts. Because each student only ever subscribes to their *own*
    alert channel, "only this student sees this alert" is enforced by
    Ably's channel model — no server-side routing code required.

## Setup
1. `npm install ably`
2. Create an Ably account (free tier is enough for this), grab an API key.
3. In Vercel project settings (and `.env.local` for dev), set:
   ```
   ABLY_API_KEY=your-key-here
   ```
   Do **not** prefix it with `NEXT_PUBLIC_` — it must stay server-side,
   only `app/api/ably-token/route.ts` reads it.
4. `next dev` (or deploy to Vercel as usual) — no second process to run.

## Pages (unchanged from before)
| Route | Who | Camera shown? | Purpose |
|---|---|---|---|
| `/login` | everyone | no | mock ID-number sign-in, picks role |
| `/exam/[examId]/sit` | student | **no** | questions only; monitoring runs headlessly; only this student's alerts appear |
| `/monitor/[studentId]` | student (own link) | yes | reference view of their own camera + flags |
| `/proctor/dashboard` | proctor | no | roster of all students, combined event feed, send a targeted alert to any one student |

## Notes / gaps worth knowing about
- `useProctorSocket(clientId)` now takes the logged-in user's id up front —
  the Ably client and its auth token are bound to that id, so it can't be
  constructed until a session exists.
- Detection is still 100% client-side — a modified client could fake
  "Verified" indefinitely. Worth naming explicitly as a limitation if this
  maps back into your MSc report.
- Ably's free tier has message/connection limits — fine for a class demo,
  check their pricing page before using this for a real cohort.