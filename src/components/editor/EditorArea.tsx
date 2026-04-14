"use client";

import { useMemo } from "react";
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

  const file = useMemo(() => (currentFilePath ? fileCache[currentFilePath] : null), [currentFilePath, fileCache]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-white dark:bg-zinc-950">
      <Toolbar />
      <div className="min-h-0 flex-1">
        {isGenerating ? <GeneratingView /> : null}

        {!isGenerating && (!currentFilePath || !file || file.type === "folder") ? <EmptyState /> : null}

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
