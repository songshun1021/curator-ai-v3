"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "@/store/app-store";
import { EmptyState } from "@/components/editor/EmptyState";
import { GeneratingView } from "@/components/editor/GeneratingView";
import { JsonFormView } from "@/components/editor/JsonFormView";
import { MarkdownView } from "@/components/editor/MarkdownView";
import { PdfPreview } from "@/components/editor/PdfPreview";
import { Toolbar } from "@/components/editor/Toolbar";

export function EditorArea() {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const fileCache = useAppStore((s) => s.fileCache);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const [toolbarHiddenByUser, setToolbarHiddenByUser] = useState(false);

  const file = useMemo(() => (currentFilePath ? fileCache[currentFilePath] : null), [currentFilePath, fileCache]);
  const hasContentFile = Boolean(currentFilePath && file?.type === "file");
  const canCollapseToolbar = hasContentFile;
  const toolbarCollapsed = canCollapseToolbar && toolbarHiddenByUser && !isGenerating;

  useEffect(() => {
    if (!hasContentFile && toolbarHiddenByUser) {
      setToolbarHiddenByUser(false);
    }
  }, [hasContentFile, toolbarHiddenByUser]);

  useEffect(() => {
    if (isGenerating && toolbarHiddenByUser) {
      setToolbarHiddenByUser(false);
    }
  }, [isGenerating, toolbarHiddenByUser]);

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-white dark:bg-zinc-950">
      <Toolbar
        collapsible={canCollapseToolbar}
        collapsed={toolbarCollapsed}
        onToggleCollapsed={() => setToolbarHiddenByUser((prev) => !prev)}
      />
      <div className="min-h-0 flex-1">
        {isGenerating ? <GeneratingView /> : null}

        {!isGenerating && !currentFilePath ? (
          <div className="flex h-full items-center justify-center px-8 py-10">
            <div className="glass-soft w-full max-w-xl border-white/70 bg-white/76 px-8 py-8 text-center">
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Workspace</div>
              <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-800">请先从左侧选择文件</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-500">
                中间编辑区不再重复显示大号引导页。主链路建议已经放到右侧，你可以直接从左栏打开主简历、岗位或准备包入口继续推进。
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  className="curator-button-functional curator-button-sm"
                  onClick={() => void openFilePath("/简历/主简历.json")}
                >
                  打开主简历
                </button>
                <button
                  type="button"
                  className="curator-button-ghost curator-button-sm"
                  onClick={() => void openFilePath("/岗位/_新建岗位.json")}
                >
                  创建岗位
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isGenerating && currentFilePath && (!file || file.type === "folder") ? <EmptyState /> : null}

        {!isGenerating && file?.type === "file" && file.contentType === "md" ? <MarkdownView path={file.path} /> : null}

        {!isGenerating && file?.type === "file" && file.contentType === "json" ? <JsonFormView path={file.path} /> : null}

        {!isGenerating && file?.type === "file" && file.contentType === "pdf" ? (
          <PdfPreview path={file.path} content={file.content} />
        ) : null}

        {!isGenerating && file?.type === "file" && !["md", "json", "pdf"].includes(file.contentType) ? (
          <div className="h-full overflow-auto p-4 prose prose-zinc max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
          </div>
        ) : null}
      </div>
    </div>
  );
}
