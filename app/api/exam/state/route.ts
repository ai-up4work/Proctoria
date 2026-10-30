// app/api/exam/state/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ID_PATTERN, SESSION_COOKIE, verifySession } from "@/lib/session";
import { MAX_STRIKES } from "@/lib/gaze";
import { getState, listStates, putState } from "@/lib/examState";

export const dynamic = "force-dynamic";
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

// GET  -> student: own state.  proctor + ?all=1: every student's state.
export async function GET(req: NextRequest) {
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    if (session.role === "proctor" && req.nextUrl.searchParams.get("all")) {
      return NextResponse.json({ states: await listStates() }, NO_STORE);
    }
    return NextResponse.json(await getState(session.id), NO_STORE);
  } catch (e) {
    console.error("exam state GET failed:", e);
    return NextResponse.json({ error: "State store unavailable" }, { status: 503 });
  }
}

// POST -> student: { action: "report", strikes, locked }  (can only make things stricter)
//         proctor: { action: "lock" | "unlock", studentId, strikes? }
export async function POST(req: NextRequest) {
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  try {
    if (session.role === "student") {
      if (body.action !== "report") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const cur = await getState(session.id);
      const strikes = Math.max(cur.strikes, clampInt(body.strikes, 0, MAX_STRIKES, 0));
      const locked = cur.locked || body.locked === true || strikes >= MAX_STRIKES;
      return NextResponse.json(await putState(session.id, { locked, strikes }));
    }

    const studentId = body.studentId;
    if (typeof studentId !== "string" || !ID_PATTERN.test(studentId)) {
      return NextResponse.json({ error: "Invalid studentId" }, { status: 400 });
    }
    const cur = await getState(studentId);

    if (body.action === "lock") {
      const strikes = Math.max(cur.strikes, clampInt(body.strikes, 0, MAX_STRIKES, cur.strikes));
      return NextResponse.json(await putState(studentId, { locked: true, strikes }));
    }
    if (body.action === "unlock") {
      // The proctor chooses the strike count the student resumes with (never MAX).
      const strikes = clampInt(body.strikes, 0, MAX_STRIKES - 1, 0);
      return NextResponse.json(await putState(studentId, { locked: false, strikes }));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("exam state POST failed:", e);
    return NextResponse.json({ error: "State store unavailable" }, { status: 503 });
  }
}
