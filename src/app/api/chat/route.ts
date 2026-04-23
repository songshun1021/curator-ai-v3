import { NextRequest } from "next/server";
import { createId } from "@/lib/id";
import { getInvalidUserApiConfigReason } from "@/lib/llm-access";
import {
  buildTrialCookie,
  getClientIp,
  getPlatformTrialConfig,
  reserveTrialRequest,
  recordTrialUsage,
  TRIAL_COOKIE_NAME,
} from "@/lib/trial-ledger";

export const runtime = "nodejs";

type ChatRequestBody = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model?: string;
  baseURL?: string;
  apiKey?: string;
  provider?: string;
  usageContext?: string;
  usageLabel?: string;
};

type UsagePayload = {
  available: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function parseBooleanEnv(name: string) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function normalizeBaseUrl(baseURL: string) {
  return baseURL.replace(/\/$/, "");
}

function encodeFrame(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function hasUserSuppliedConfig(body: ChatRequestBody) {
  return Boolean(body.model?.trim() && body.baseURL?.trim() && body.apiKey?.trim());
}

function resolveUpstreamConfig(body: ChatRequestBody) {
  if (hasUserSuppliedConfig(body)) {
    return {
      mode: "user" as const,
      provider: body.provider ?? "",
      model: body.model!.trim(),
      baseURL: body.baseURL!.trim(),
      apiKey: body.apiKey!.trim(),
    };
  }

  const platform = getPlatformTrialConfig();
  if (!platform.enabled || !platform.apiKey || !platform.baseURL || !platform.model) {
    return null;
  }

  return {
    mode: "trial" as const,
    provider: platform.provider,
    model: platform.model,
    baseURL: platform.baseURL,
    apiKey: platform.apiKey,
    enableThinking: parseBooleanEnv("PLATFORM_ENABLE_THINKING"),
  };
}

async function openUpstreamStream(
  body: ChatRequestBody,
  upstream: { model: string; baseURL: string; apiKey: string; enableThinking?: boolean },
  includeUsage: boolean,
) {
  return fetch(`${normalizeBaseUrl(upstream.baseURL)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upstream.apiKey}`,
    },
    body: JSON.stringify({
      model: upstream.model,
      messages: body.messages,
      stream: true,
      ...(typeof upstream.enableThinking === "boolean" ? { enable_thinking: upstream.enableThinking } : {}),
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
    }),
  });
}

async function createUpstreamResponse(
  body: ChatRequestBody,
  upstream: { model: string; baseURL: string; apiKey: string; enableThinking?: boolean },
) {
  let response = await openUpstreamStream(body, upstream, true);
  if (response.ok) return response;

  const errorText = await response.text();
  const normalized = errorText.toLowerCase();
  const shouldRetryWithoutUsage =
    response.status === 400 ||
    response.status === 404 ||
    response.status === 422 ||
    normalized.includes("stream_options") ||
    normalized.includes("include_usage") ||
    normalized.includes("unsupported");

  if (!shouldRetryWithoutUsage) {
    return new Response(errorText || "Upstream error", { status: response.status || 500 });
  }

  response = await openUpstreamStream(body, upstream, false);
  if (!response.ok) {
    const fallbackError = await response.text();
    return new Response(fallbackError || "Upstream error", { status: response.status || 500 });
  }
  return response;
}

function getUsageFromChunk(json: any): UsagePayload | null {
  const usage = json?.usage;
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;
  return {
    available: typeof totalTokens === "number" || typeof promptTokens === "number" || typeof completionTokens === "number",
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

async function streamChatCompletions(args: {
  upstream: Response;
  trial?: {
    trialId: string;
    ipHash: string;
    context: string;
    label: string;
    inputChars: number;
  };
}) {
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = args.upstream.body!.getReader();
      let buffer = "";
      let usage: UsagePayload = { available: false };
      let outputChars = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const chunkUsage = getUsageFromChunk(json);
              if (chunkUsage?.available) usage = chunkUsage;
              const content = json?.choices?.[0]?.delta?.content;
              if (content) {
                outputChars += content.length;
                controller.enqueue(encodeFrame({ type: "chunk", content }));
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } finally {
        if (args.trial) {
          await recordTrialUsage({
            trialId: args.trial.trialId,
            ipHash: args.trial.ipHash,
            context: args.trial.context,
            label: args.trial.label,
            inputChars: args.trial.inputChars,
            outputChars,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          });
        }
        controller.enqueue(encodeFrame({ type: "usage", usage }));
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;
    const { messages } = body;
    if (!messages?.length) {
      return new Response("Missing messages", { status: 400 });
    }

    const invalidUserConfigReason = getInvalidUserApiConfigReason({
      provider: body.provider ?? "",
      model: body.model?.trim() ?? "",
      baseURL: body.baseURL?.trim() ?? "",
      apiKey: body.apiKey?.trim() ?? "",
      storageMode: "session-only",
    });
    if (invalidUserConfigReason === "api_key_non_latin1") {
      return new Response("API Key 中包含中文或全角字符，请检查是否误填了示例文本、说明文字或其它非密钥内容。", {
        status: 400,
      });
    }

    const upstream = resolveUpstreamConfig(body);
    if (!upstream) {
      return new Response("Missing model/baseURL/apiKey and platform trial is disabled", { status: 400 });
    }

    let trialCookie: string | null = null;
    let trialContext:
      | {
          trialId: string;
          ipHash: string;
          context: string;
          label: string;
          inputChars: number;
        }
      | undefined;

    if (upstream.mode === "trial") {
      const trialId = req.cookies.get(TRIAL_COOKIE_NAME)?.value || createId();
      if (!req.cookies.get(TRIAL_COOKIE_NAME)?.value) {
        trialCookie = buildTrialCookie(trialId);
      }

      const allowance = await reserveTrialRequest(trialId, getClientIp(req.headers), body.usageContext ?? "general");
      if (!allowance.ok) {
        const denied = new Response(allowance.reason, { status: allowance.statusCode });
        if (trialCookie) denied.headers.set("Set-Cookie", trialCookie);
        return denied;
      }

      trialContext = {
        trialId,
        ipHash: allowance.ipHash,
        context: body.usageContext ?? "general",
        label: body.usageLabel ?? "平台试用",
        inputChars: messages.reduce((sum, message) => sum + message.content.length, 0),
      };
    }

    const upstreamOrError = await createUpstreamResponse(body, upstream);
    if (!upstreamOrError.ok || !upstreamOrError.body) {
      const error = await upstreamOrError.text();
      const response = new Response(error || "Upstream error", { status: upstreamOrError.status || 500 });
      if (trialCookie) response.headers.set("Set-Cookie", trialCookie);
      return response;
    }

    const stream = await streamChatCompletions({
      upstream: upstreamOrError,
      trial: trialContext,
    });

    const response = new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
    if (trialCookie) response.headers.set("Set-Cookie", trialCookie);
    return response;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "unknown error", { status: 500 });
  }
}
