import { NextRequest, NextResponse } from "next/server";
import { getOpsPageState } from "@/lib/ops-auth";
import { getOpsDashboardData } from "@/lib/ops-dashboard";

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

  try {
    const range = req.nextUrl.searchParams.get("range");
    const payload = await getOpsDashboardData(range);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "后台数据加载失败。" },
      { status: 500 },
    );
  }
}

