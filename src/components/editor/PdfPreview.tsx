"use client";

export function PdfPreview({ path, content }: { path: string; content: string }) {
  const hasContent = Boolean(content?.trim());

  if (!hasContent) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">
        该 PDF 暂无可预览内容。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="truncate">{path}</span>
        <a href={content} download={path.split("/").pop() || "resume.pdf"} className="rounded border px-2 py-0.5">
          下载 PDF
        </a>
        <a href={content} target="_blank" rel="noreferrer" className="rounded border px-2 py-0.5">
          新窗口打开
        </a>
      </div>
      <div className="min-h-0 flex-1">
        <object data={content} type="application/pdf" className="h-full w-full">
          <div className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">
            该 PDF 暂不支持内嵌预览，可使用“下载 PDF”或“新窗口打开”查看。
          </div>
        </object>
      </div>
    </div>
  );
}
