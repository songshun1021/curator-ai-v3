import { sendMessage } from "@/lib/ai-engine";
import { canUseAnyLlm } from "@/lib/llm-access";
import { LlmConfig, TrialStatus, VirtualFile } from "@/types";

export type NextActionCandidate = {
  id: string;
  title: string;
  description: string;
  source: "resume" | "job" | "prep" | "review";
};

export type GeneratedNextActionSuggestion = {
  title: string;
  note?: string;
};

function clipText(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function stripMarkdownNoise(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function takeRelevantSection(content: string, maxChars = 280) {
  const cleaned = stripMarkdownNoise(content);
  return clipText(cleaned.replace(/\n/g, " "), maxChars);
}

function buildRecentContext(fileCache: Record<string, VirtualFile>) {
  const candidates = Object.values(fileCache)
    .filter((file) => file.type === "file")
    .filter(
      (file) =>
        file.path.endsWith("/复盘报告.md") ||
        file.path.endsWith("/准备包.md") ||
        file.path.endsWith("/匹配度分析.md") ||
        (file.path.startsWith("/简历/定制简历/") && file.path.endsWith(".json")),
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  return candidates
    .map((file) => `- ${file.path}\n  摘要：${takeRelevantSection(file.content)}`)
    .join("\n");
}

function extractJsonPayload(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1] ?? "";
  return trimmed;
}

function isMeaninglessSuggestion(value: string) {
  const text = value.trim();
  if (!text) return true;
  return /继续优化|结合岗位调整|进一步完善|可以考虑|建议如下|下一步行动|行动建议/.test(text);
}

function parseSuggestions(text: string): GeneratedNextActionSuggestion[] {
  try {
    const parsed = JSON.parse(extractJsonPayload(text)) as Array<{ title?: string; note?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        title: clipText(String(item.title ?? ""), 30),
        note: item.note ? clipText(String(item.note), 18) : "",
      }))
      .filter((item) => item.title && !isMeaninglessSuggestion(item.title))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function generateNextActionSuggestions(args: {
  llmConfig: LlmConfig;
  trialStatus: TrialStatus | null;
  candidates: NextActionCandidate[];
  fileCache: Record<string, VirtualFile>;
}) {
  if (!canUseAnyLlm(args.llmConfig, args.trialStatus)) {
    return null;
  }

  if (args.candidates.length === 0) {
    return [];
  }

  const candidateText = args.candidates
    .slice(0, 3)
    .map((candidate, index) => {
      return `${index + 1}. 来源：${candidate.source}\n标题：${candidate.title}\n说明：${candidate.description}`;
    })
    .join("\n\n");

  const recentContext = buildRecentContext(args.fileCache);
  const response = await sendMessage({
    provider: args.llmConfig.provider,
    model: args.llmConfig.model,
    baseURL: args.llmConfig.baseURL,
    apiKey: args.llmConfig.apiKey,
    usageContext: "next-action-suggestions",
    usageLabel: "右栏行动建议",
    messages: [
      {
        role: "system",
        content:
          "你是行动建议压缩助手。请基于候选动作和最近上下文，输出最多 3 条行动建议。必须只输出合法 JSON 数组，每项形如 {\"title\":\"...\",\"note\":\"...\"}。title 必须具体、可执行、30 个中文字符以内；note 可为空，若填写则控制在 18 个中文字符以内。不要出现“建议如下”“继续优化简历”“下一步行动”等空泛话术。",
      },
      {
        role: "user",
        content: `候选动作：\n${candidateText}\n\n最近上下文：\n${recentContext || "暂无"}\n\n请把候选动作压缩成更短、更具体的行动建议。`,
      },
    ],
  });

  return parseSuggestions(response);
}
