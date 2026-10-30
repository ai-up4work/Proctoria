// app/api/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, ID_PATTERN } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { id, role, passcode } = body ?? {};

  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  if (role !== "student" && role !== "proctor") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  // Students are still a mock ID sign-in; proctors must know the passcode.
  if (role === "proctor" && (!process.env.PROCTOR_CODE || passcode !== process.env.PROCTOR_CODE)) {
    return NextResponse.json({ error: "Invalid proctor passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, id, role });
  res.cookies.set(SESSION_COOKIE, createSession(id, role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 4 * 3600,
  });
  return res;
}