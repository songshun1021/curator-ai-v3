"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function GeneratingView() {
  const generatingType = useAppStore((s) => s.generatingType);
  const generatingContent = useAppStore((s) => s.generatingContent);
  const generationStatus = useAppStore((s) => s.generationStatus);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [generatingContent]);

  const statusText =
    generationStatus === "canceling"
      ? "已取消，正在保存草稿..."
      : generationStatus === "error"
        ? "生成失败"
        : `正在生成：${generatingType}...`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          {statusText}
        </div>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => cancelGeneration()}
          disabled={generationStatus === "canceling"}
        >
          {generationStatus === "canceling" ? "取消中..." : "取消"}
        </button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-4 prose prose-zinc max-w-none dark:prose-invert">
        <ReactMarkdown>{generatingContent || "生成中..."}</ReactMarkdown>
      </div>
    </div>
  );
}
