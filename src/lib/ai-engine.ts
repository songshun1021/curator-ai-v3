import { db } from "@/lib/db";
import { useAppStore } from "@/store/app-store";
import { LlmUsageRecord } from "@/types";

type UsagePayload = {
  available: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export interface SendMessageArgs {
  baseURL: string;
  model: string;
  apiKey: string;
  provider?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  onChunk?: (chunk: string) => void;
  onUsage?: (usage: UsagePayload) => void;
  signal?: AbortSignal;
  usageContext?: string;
  usageLabel?: string;
}

type StreamFrame =
  | { type: "chunk"; content: string }
  | { type: "usage"; usage: UsagePayload };

async function persistUsageRecord(args: SendMessageArgs, output: string, usage: UsagePayload) {
  const record: LlmUsageRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    provider: args.provider ?? "",
    model: args.model,
    context: args.usageContext ?? "general",
    label: args.usageLabel ?? "通用请求",
    messageCount: args.messages.length,
    inputChars: args.messages.reduce((sum, message) => sum + message.content.length, 0),
    outputChars: output.length,
    usageSource: usage.available ? "provider" : "unavailable",
    promptTokens: usage.available ? usage.promptTokens ?? null : null,
    completionTokens: usage.available ? usage.completionTokens ?? null : null,
    totalTokens: usage.available ? usage.totalTokens ?? null : null,
  };

  await db.llm_usage.add(record);
  await useAppStore.getState().loadLlmUsageRecords();
}

export async function sendMessage(args: SendMessageArgs): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: args.messages,
      model: args.model,
      baseURL: args.baseURL,
      apiKey: args.apiKey,
      provider: args.provider ?? "",
    }),
    signal: args.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Chat request failed");
  }

  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  let usage: UsagePayload = { available: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let frame: StreamFrame | null = null;
      try {
        frame = JSON.parse(trimmed) as StreamFrame;
      } catch {
        continue;
      }

      if (frame.type === "chunk") {
        full += frame.content;
        args.onChunk?.(frame.content);
      }

      if (frame.type === "usage") {
        usage = frame.usage;
        args.onUsage?.(usage);
      }
    }
  }

  if (buffer.trim()) {
    try {
      const frame = JSON.parse(buffer.trim()) as StreamFrame;
      if (frame.type === "chunk") {
        full += frame.content;
        args.onChunk?.(frame.content);
      }
      if (frame.type === "usage") {
        usage = frame.usage;
        args.onUsage?.(usage);
      }
    } catch {
      // ignore trailing malformed frame
    }
  }

  await persistUsageRecord(args, full, usage);
  return full;
}
