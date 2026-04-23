import { NextResponse } from "next/server";
import { getOpsSessionCookieOptions } from "@/lib/ops-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    ...getOpsSessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return response;
}

