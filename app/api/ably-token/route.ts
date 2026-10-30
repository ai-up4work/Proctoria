// app/api/ably-token/route.ts
import Ably from "ably";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// ABLY_API_KEY must be set in .env.local (dev) / Vercel project env vars (prod),
// server-side only — never prefix it with NEXT_PUBLIC_ or it'll be exposed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: "ABLY_API_KEY is not configured" }, { status: 500 });
  }

  // Identity and role come from the signed cookie, never from the query string.
  const session = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const capability =
    session.role === "student"
      ? {
          // Publish status/flags and announce presence. Deliberately NO
          // subscribe, so a student can't read other students' flags.
          "proctoring-room": ["publish", "presence"],
          // Only their own alert/control channel, and only to receive.
          [`alert-${session.id}`]: ["subscribe"],
        }
      : {
          "proctoring-room": ["subscribe", "presence"],
          "alert-*": ["publish"],
        };

  try {
    const client = new Ably.Rest(process.env.ABLY_API_KEY);
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: session.id,
      capability: JSON.stringify(capability),
      ttl: 60 * 60 * 1000,
    });
    return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Usually a malformed/invalid ABLY_API_KEY or a key that can't grant this capability.
    console.error("ably-token: createTokenRequest failed:", e);
    return NextResponse.json({ error: "Could not create realtime token" }, { status: 502 });
  }
}
