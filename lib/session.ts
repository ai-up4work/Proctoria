// lib/session.ts
// Server-only helpers for a signed session cookie. The server decides who
// someone is and what role they have; the client never gets to claim a role.
import crypto from "crypto";

export type Role = "student" | "proctor";
export interface SessionPayload {
  id: string;
  role: Role;
  exp: number; // unix seconds
}

export const SESSION_COOKIE = "proctoria_session";
export const ID_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not configured");
  return s;
};

const sign = (data: string) =>
  crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function createSession(id: string, role: Role, ttlSeconds = 4 * 3600) {
  const payload: SessionPayload = { id, role, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (payload.exp < Date.now() / 1000) return null;
    if (!ID_PATTERN.test(payload.id)) return null;
    if (payload.role !== "student" && payload.role !== "proctor") return null;
    return payload;
  } catch {
    return null;
  }
}