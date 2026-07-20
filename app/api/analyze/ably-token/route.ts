// app/api/ably-token/route.ts
import Ably from "ably";
import { NextRequest, NextResponse } from "next/server";

// ABLY_API_KEY must be set in Vercel project env vars (server-side only —
// never prefix it with NEXT_PUBLIC_ or it'll be exposed to the client).
export async function GET(req: NextRequest) {
  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: "ABLY_API_KEY is not configured" }, { status: 500 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId query param is required" }, { status: 400 });
  }

  const client = new Ably.Rest(process.env.ABLY_API_KEY);
  const tokenRequestData = await client.auth.createTokenRequest({ clientId });
  return NextResponse.json(tokenRequestData);
}