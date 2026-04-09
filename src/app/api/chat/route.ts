import { NextRequest } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, baseURL, apiKey } = body as {
      messages: Array<{ role: string; content: string }>;
      model: string;
      baseURL: string;
      apiKey: string;
    };

    if (!model || !baseURL || !apiKey) {
      return new Response("Missing model/baseURL/apiKey", { status: 400 });
    }

    const endpoint = `${baseURL.replace(/\/$/, "")}/chat/completions`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const error = await upstream.text();
      return new Response(error || "Upstream error", { status: upstream.status || 500 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        let buffer = "";
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
                const content = json?.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(encoder.encode(content));
              } catch {
                // ignore malformed chunk
              }
            }
          }
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "unknown error", { status: 500 });
  }
}
