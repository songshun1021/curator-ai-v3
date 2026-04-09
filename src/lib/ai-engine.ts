export interface SendMessageArgs {
  baseURL: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    args.onChunk?.(chunk);
  }

  return full;
}
