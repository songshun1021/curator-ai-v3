import { NextRequest, NextResponse } from "next/server";
import {
  createOpsSessionToken,
  getOpsDashboardConfigState,
  getOpsSessionCookieOptions,
  verifyOpsPassword,
} from "@/lib/ops-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const config = getOpsDashboardConfigState();
  if (!config.enabled) {
    return NextResponse.json({ message: "后台入口已关闭。" }, { status: 404 });
  }
  if (!config.configured) {
    return NextResponse.json({ message: "后台尚未配置口令或会话密钥。" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as Partial<{ password: string }>;
    const password = String(body.password ?? "").trim();
    if (!password) {
      return NextResponse.json({ message: "请输入后台口令。" }, { status: 400 });
    }
    if (!verifyOpsPassword(password)) {
      return NextResponse.json({ message: "口令不正确，请重试。" }, { status: 401 });
    }

    const token = createOpsSessionToken();
    if (!token) {
      return NextResponse.json({ message: "后台会话初始化失败，请检查服务端配置。" }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      ...getOpsSessionCookieOptions(),
      value: token,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "后台登录失败，请稍后再试。" },
      { status: 500 },
    );
  }
}

