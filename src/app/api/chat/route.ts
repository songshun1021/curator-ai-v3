import { NextRequest } from "next/server";

export const runtime = "nodejs";

type ChatRequestBody = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  baseURL: string;
  apiKey: string;
  provider?: string;
};

type UsagePayload = {
  available: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

function normalizeBaseUrl(baseURL: string) {
  return baseURL.replace(/\/$/, "");
}

function encodeFrame(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

async function openUpstreamStream(body: ChatRequestBody, includeUsage: boolean) {
  return fetch(`${normalizeBaseUrl(body.baseURL)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.apiKey}`,
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
    }),
  });
}

async function createUpstreamResponse(body: ChatRequestBody) {
  let upstream = await openUpstreamStream(body, true);
  if (upstream.ok) return upstream;

  const errorText = await upstream.text();
  const normalized = errorText.toLowerCase();
  const shouldRetryWithoutUsage =
    upstream.status === 400 ||
    upstream.status === 404 ||
    upstream.status === 422 ||
    normalized.includes("stream_options") ||
    normalized.includes("include_usage") ||
    normalized.includes("unsupported");

  if (!shouldRetryWithoutUsage) {
    return new Response(errorText || "Upstream error", { status: upstream.status || 500 });
  }

  upstream = await openUpstreamStream(body, false);
  if (!upstream.ok) {
    const fallbackError = await upstream.text();
    return new Response(fallbackError || "Upstream error", { status: upstream.status || 500 });
  }
  return upstream;
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

async function streamChatCompletions(upstream: Response) {
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      let usage: UsagePayload = { available: false };
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
              if (chunkUsage?.available) {
                usage = chunkUsage;
              }
              const content = json?.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encodeFrame({ type: "chunk", content }));
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } finally {
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
    const { messages, model, baseURL, apiKey } = body;

    if (!model || !baseURL || !apiKey) {
      return new Response("Missing model/baseURL/apiKey", { status: 400 });
    }

    const upstreamOrError = await createUpstreamResponse(body);
    if (!upstreamOrError.ok || !upstreamOrError.body) {
      const error = await upstreamOrError.text();
      return new Response(error || "Upstream error", { status: upstreamOrError.status || 500 });
    }

    const stream = await streamChatCompletions(upstreamOrError);

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "unknown error", { status: 500 });
  }
}
