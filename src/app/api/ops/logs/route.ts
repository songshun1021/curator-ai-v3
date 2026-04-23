import { NextRequest, NextResponse } from "next/server";
import { getOpsPageState } from "@/lib/ops-auth";
import { getOpsLogContent } from "@/lib/ops-dashboard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const state = getOpsPageState(req.cookies);
  if (!state.enabled) {
    return NextResponse.json({ message: "后台入口已关闭。" }, { status: 404 });
  }
  if (!state.configured) {
    return NextResponse.json({ message: "后台尚未配置。" }, { status: 503 });
  }
  if (!state.authenticated) {
    return NextResponse.json({ message: "未登录或会话已失效。" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const payload = await getOpsLogContent(type);
  if (!payload) {
    return NextResponse.json({ message: "日志类型无效。" }, { status: 400 });
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

