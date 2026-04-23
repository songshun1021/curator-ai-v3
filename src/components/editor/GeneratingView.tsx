"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/app-store";

function normalizeStreamingPreview(raw: string) {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^```(?:markdown|md|mdx|text|txt)?\s*[\r\n]*/i, "")
    .replace(/^'''(?:markdown|md|text|txt)?\s*[\r\n]*/i, "");
}

export function GeneratingView() {
  const generatingType = useAppStore((state) => state.generatingType);
  const generatingContent = useAppStore((state) => state.generatingContent);
  const generationStatus = useAppStore((state) => state.generationStatus);
  const cancelGeneration = useAppStore((state) => state.cancelGeneration);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [generatingContent]);

  const statusText =
    generationStatus === "canceling"
      ? "已收到取消指令，正在保存草稿..."
      : generationStatus === "error"
        ? "生成失败，请检查配置或稍后重试"
        : `正在生成 ${generatingType}...`;

  const previewContent = normalizeStreamingPreview(generatingContent || "生成中...");

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent px-5 py-4">
      <div className="flex items-center justify-between gap-3 border-b border-white/55 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(15,23,42,0.04)] text-zinc-700">
            <Loader2 size={18} className="animate-spin" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Generating</div>
            <div className="mt-1 text-sm font-semibold text-zinc-800">{statusText}</div>
          </div>
        </div>

        <button
          type="button"
          className="curator-button-functional curator-button-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => cancelGeneration()}
          disabled={generationStatus === "canceling"}
        >
          {generationStatus === "canceling" ? "取消中..." : "取消生成"}
        </button>
      </div>

      <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
        <Sparkles size={14} className="text-zinc-400" />
        <span>这里会实时显示流式结果，完成后自动切回正式文件视图。</span>
      </div>

      <div ref={scrollRef} className="soft-scrollbar min-h-0 flex-1 overflow-auto">
        <div className="rounded-[var(--radius-subpanel)] border border-[var(--line-hair)] bg-white/58 px-5 py-4">
          <div className="prose max-w-none prose-zinc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
