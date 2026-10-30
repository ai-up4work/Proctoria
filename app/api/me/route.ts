// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Who does the server think I am? The cookie is the only source of truth.
export async function GET(req: NextRequest) {
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = session
    ? NextResponse.json({ id: session.id, role: session.role, exp: session.exp })
    : NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
