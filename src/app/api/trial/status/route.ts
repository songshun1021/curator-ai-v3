import { NextRequest } from "next/server";
import { createId } from "@/lib/id";
import { buildTrialCookie, getTrialStatus, TRIAL_COOKIE_NAME } from "@/lib/trial-ledger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const existing = req.cookies.get(TRIAL_COOKIE_NAME)?.value;
  const trialId = existing || createId();
  const status = await getTrialStatus(trialId);

  const response = Response.json(status);
  if (!existing) {
    response.headers.set("Set-Cookie", buildTrialCookie(trialId));
  }
  return response;
}
