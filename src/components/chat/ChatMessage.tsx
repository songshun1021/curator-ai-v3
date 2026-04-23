"use client";

import { Bot, Loader2, UserRound } from "lucide-react";
import { ChatMessage as Msg } from "@/types";

export function ChatMessage({ message, streaming = false }: { message: Msg; streaming?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  const wrapperClass = isUser ? "ml-8 items-end" : "mr-8 items-start";
  const bubbleClass = isUser
    ? "border-sky-100 bg-sky-50/90"
    : isSystem
      ? "border-white/75 bg-white/84"
      : "border-white/70 bg-white/80";

  const title = isUser ? "你" : isSystem ? "系统" : "Curator AI";
  const Icon = isUser ? UserRound : Bot;

  return (
    <div className={`flex ${wrapperClass}`}>
      <div className={`max-w-[88%] rounded-[24px] border px-4 py-3 shadow-[0_14px_34px_rgba(148,163,184,0.08)] ${bubbleClass}`}>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${isUser ? "bg-sky-100 text-sky-600" : isSystem ? "bg-white text-zinc-500" : "bg-zinc-100 text-zinc-600"}`}>
            <Icon size={12} />
          </span>
          <span className="font-medium">{title}</span>
          {streaming ? <Loader2 size={12} className="animate-spin text-sky-500" /> : null}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">{message.content}</div>
      </div>
    </div>
  );
}
