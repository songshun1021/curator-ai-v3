"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { buildContext } from "@/lib/context-builder";
import { sendMessage } from "@/lib/ai-engine";
import { readFile } from "@/lib/file-system";
import { useAppStore } from "@/store/app-store";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ContextBadge } from "@/components/chat/ContextBadge";

export function ChatPanel() {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const threads = useAppStore((s) => s.threads);
  const currentThreadId = useAppStore((s) => s.currentThreadId);
  const messages = useAppStore((s) => s.messages);
  const loadThreads = useAppStore((s) => s.loadThreads);
  const createThread = useAppStore((s) => s.createThread);
  const setCurrentThread = useAppStore((s) => s.setCurrentThread);
  const loadMessages = useAppStore((s) => s.loadMessages);

  const [activeRefs, setActiveRefs] = useState<string[]>([]);
  const [assistantStreaming, setAssistantStreaming] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, assistantStreaming]);

  const currentThread = useMemo(() => threads.find((t) => t.id === currentThreadId), [threads, currentThreadId]);

  async function saveMessage(threadId: string, role: "user" | "assistant" | "system", content: string) {
    await db.chat_messages.add({
      id: crypto.randomUUID(),
      threadId,
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    await db.chat_threads.update(threadId, {
      updatedAt: new Date().toISOString(),
      title: currentThread?.title === "新对话" && role === "user" ? content.slice(0, 20) : currentThread?.title || "对话",
    });
    await loadMessages(threadId);
    await loadThreads();
  }

  async function handleSend(input: { text: string; referencedFiles: string[] }) {
    const threadId = currentThreadId || (await createThread());

    const missing: string[] = [];
    if (!llmConfig.model?.trim()) missing.push("模型名");
    if (!llmConfig.baseURL?.trim()) missing.push("API Base URL");
    if (!llmConfig.apiKey?.trim()) missing.push("API Key");
    if (missing.length > 0) {
      await saveMessage(threadId, "system", `请先完成 AI 配置：缺少 ${missing.join("、")}。可在「AI配置/模型配置.json」中填写后重试。`);
      return;
    }

    const refs = input.referencedFiles;
    setActiveRefs(refs);

    await saveMessage(threadId, "user", input.text);

    const context = await buildContext({ mode: "chat", currentFilePath: currentFilePath ?? undefined, userPrompt: input.text });
    const extraRefMessages: Array<{ role: "user"; content: string }> = [];
    for (const ref of refs) {
      const file = await readFile(ref);
      if (file) extraRefMessages.push({ role: "user", content: `[引用文件: ${ref}]\n${file.content}` });
    }

    let assistantLive = "";
    setAssistantStreaming("");
    await sendMessage({
      ...llmConfig,
      provider: llmConfig.provider,
      messages: [...context.messages, ...extraRefMessages],
      usageContext: "chat",
      usageLabel: currentFilePath ? `聊天：${currentFilePath.split("/").pop()}` : "聊天对话",
      onChunk: (chunk) => {
        assistantLive += chunk;
        setAssistantStreaming(assistantLive);
      },
    })
      .then(async (finalText) => {
        setAssistantStreaming("");
        await saveMessage(threadId, "assistant", finalText || assistantLive);
      })
      .catch(async (err) => {
        setAssistantStreaming("");
        await saveMessage(threadId, "system", `请求失败：${err instanceof Error ? err.message : String(err)}`);
      });
  }

  return (
    <div className="flex h-full flex-col bg-transparent px-3 py-3">
      <div className="glass-subpanel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-white/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="curator-button-functional h-9 gap-1 rounded-full px-3 text-xs"
              onClick={() => void createThread()}
            >
              <Plus size={14} />
              新对话
            </button>
            <div className="relative min-w-0 flex-1">
              <select
                className="h-9 w-full rounded-full border border-white/70 bg-white/80 px-3 text-xs text-zinc-700 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                value={currentThreadId ?? ""}
                onChange={(e) => void setCurrentThread(e.target.value)}
              >
                {threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {currentFilePath ? <ContextBadge label={`📄 ${currentFilePath.split("/").pop()} (自动)`} /> : null}
            {activeRefs.map((r) => (
              <ContextBadge
                key={r}
                label={`📄 ${r.split("/").pop()}`}
                removable
                onRemove={() => setActiveRefs((prev) => prev.filter((x) => x !== r))}
              />
            ))}
            {!currentFilePath && activeRefs.length === 0 ? <ContextBadge label="当前未注入文件上下文" subtle /> : null}
          </div>
        </div>

        <div ref={listRef} className="soft-scrollbar min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
          {messages.length === 0 && !assistantStreaming ? (
            <div className="glass-soft px-4 py-3 text-sm text-zinc-500">
              直接提问，或输入 `@` 引用文件。
            </div>
          ) : null}

          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}

          {assistantStreaming ? (
            <ChatMessage
              message={{
                id: "__streaming__",
                threadId: currentThreadId ?? "",
                role: "assistant",
                content: assistantStreaming,
                timestamp: new Date().toISOString(),
              }}
              streaming
            />
          ) : null}
        </div>

        <ChatInput onSend={handleSend} />
      </div>
    </div>
  );
}
