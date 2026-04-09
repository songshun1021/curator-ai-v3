"use client";

import { ChatMessage as Msg } from "@/types";

export function ChatMessage({ message }: { message: Msg }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`rounded-md border p-2 text-sm ${isUser ? "ml-8 bg-blue-50 dark:bg-blue-950/40" : isSystem ? "bg-amber-50 dark:bg-amber-950/30" : "mr-8 bg-zinc-50 dark:bg-zinc-900"}`}>
      <div className="mb-1 text-[11px] text-zinc-500">{isUser ? "你" : isSystem ? "系统" : "Curator AI"}</div>
      <div className="whitespace-pre-wrap break-words">{message.content}</div>
    </div>
  );
}
