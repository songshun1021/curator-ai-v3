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
      ? "已收到取消指令，正在保存草稿..."
      : generationStatus === "error"
        ? "生成失败，请检查配置或稍后重试"
        : `正在生成 ${generatingType}...`;

  const previewContent = normalizeStreamingPreview(generatingContent || "生成中...");

  return (
    <div className="flex h-full flex-col bg-transparent px-4 py-4">
      <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden border-white/60 bg-white/60">
        <div className="flex items-center justify-between gap-3 border-b border-white/60 bg-gradient-to-r from-stone-100/75 via-white/30 to-slate-100/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="glass-soft flex h-10 w-10 items-center justify-center rounded-2xl border-white/70 bg-white/80 text-zinc-700">
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Generating</div>
              <div className="mt-1 text-sm font-semibold text-zinc-800">{statusText}</div>
            </div>
          </div>

          <button
            type="button"
            className="rounded-full border border-white/75 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-200 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => cancelGeneration()}
            disabled={generationStatus === "canceling"}
          >
            {generationStatus === "canceling" ? "取消中..." : "取消生成"}
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/60 px-5 py-3 text-xs text-zinc-500">
          <Sparkles size={14} className="text-zinc-400" />
          <span>中栏会实时预览流式内容，结束后自动切回正式文件视图。</span>
        </div>

        <div ref={scrollRef} className="soft-scrollbar min-h-0 flex-1 overflow-auto px-5 py-5">
          <div className="glass-soft prose max-w-none border border-white/65 bg-white/72 px-5 py-4 prose-zinc">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
