import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createId } from "@/lib/id";
import { FEEDBACK_SUPPORT_PATH } from "@/lib/feedback";

export const runtime = "nodejs";

const FEEDBACK_TYPES = new Set(["bug", "idea", "experience", "other"]);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_SUBMISSIONS = 5;

type FeedbackRecord = {
  id: string;
  createdAt: string;
  type: string;
  title: string;
  content: string;
  contact: string;
  sourcePath: string;
  host: string;
  ipHash: string;
  userAgent: string;
};

function getFeedbackFilePath() {
  return process.env.FEEDBACK_SUBMISSIONS_PATH?.trim() || path.join(process.cwd(), "data", "feedback-submissions.jsonl");
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex");
}

async function readFeedbackRecords(filePath: string) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as FeedbackRecord];
        } catch {
          return [];
        }
      });
  } catch {
    return [] as FeedbackRecord[];
  }
}

function trimToLength(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<{
      type: string;
      title: string;
      content: string;
      contact: string;
      sourcePath: string;
    }>;

    const type = trimToLength(body.type, 20);
    const title = trimToLength(body.title, 80);
    const content = trimToLength(body.content, 4000);
    const contact = trimToLength(body.contact, 200);
    const sourcePath = trimToLength(body.sourcePath, 200) || FEEDBACK_SUPPORT_PATH;

    if (!FEEDBACK_TYPES.has(type)) {
      return Response.json({ message: "反馈类型无效，请重新选择。" }, { status: 400 });
    }

    if (!title || title.length < 2) {
      return Response.json({ message: "请填写一个简短明确的反馈标题。" }, { status: 400 });
    }

    if (!content || content.length < 5) {
      return Response.json({ message: "反馈内容太短了，至少写 5 个字。" }, { status: 400 });
    }

    const filePath = getFeedbackFilePath();
    await ensureParentDir(filePath);

    const ipHash = hashIp(getClientIp(req.headers));
    const existingRecords = await readFeedbackRecords(filePath);
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const recentCount = existingRecords.filter((record) => record.ipHash === ipHash && Date.parse(record.createdAt) >= cutoff).length;

    if (recentCount >= RATE_LIMIT_MAX_SUBMISSIONS) {
      return Response.json(
        { message: "提交有点太快了，请过 15 分钟后再试，或者直接通过邮箱联系我。" },
        { status: 429 },
      );
    }

    const record: FeedbackRecord = {
      id: createId(),
      createdAt: new Date().toISOString(),
      type,
      title,
      content,
      contact,
      sourcePath,
      host: req.headers.get("host") || "",
      ipHash,
      userAgent: req.headers.get("user-agent") || "",
    };

    await fs.appendFile(filePath, `${JSON.stringify(record, null, 0)}\n`, "utf8");

    return Response.json({ ok: true, message: "已收到，会优先查看。谢谢你的反馈。" });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "反馈提交失败，请稍后再试。" },
      { status: 500 },
    );
  }
}
