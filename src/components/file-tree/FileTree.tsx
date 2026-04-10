"use client";

import { useEffect, useRef } from "react";
import { FileTreeNode } from "@/components/file-tree/FileTreeNode";
import { readFile, upsertFile } from "@/lib/file-system";
import { getInterviewRoundFolders } from "@/lib/interview-paths";
import { isHiddenSystemPath } from "@/lib/system-files";
import { useAppStore } from "@/store/app-store";

const REVEAL_HIGHLIGHT_CLASSES = ["ring-2", "ring-blue-400", "bg-blue-50", "dark:bg-blue-950/40"];

function shouldShowInTree(path: string, isSystem: boolean) {
  if (isSystem) return false;
  if (isHiddenSystemPath(path)) return false;
  if (path.endsWith("/meta.json")) return false;
  return true;
}

export function FileTree() {
  const tree = useAppStore((s) => s.tree);
  const fileCache = useAppStore((s) => s.fileCache);
  const pendingRevealPath = useAppStore((s) => s.pendingRevealPath);
  const consumePendingRevealPath = useAppStore((s) => s.consumePendingRevealPath);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const treeWrapRef = useRef<HTMLDivElement>(null);

  const files = Object.values(fileCache);
  const stats = {
    jobs: files.filter((f) => f.type === "folder" && f.parentPath === "/岗位").length,
    resumes: files.filter((f) => f.path.startsWith("/简历/") && f.name.endsWith(".json")).length,
    interviews: getInterviewRoundFolders(files).length,
  };

  useEffect(() => {
    if (!pendingRevealPath) return;
    const raf = requestAnimationFrame(() => {
      const wrap = treeWrapRef.current;
      if (!wrap) return;
      const selector = `button[data-path="${CSS.escape(pendingRevealPath)}"]`;
      const target = wrap.querySelector<HTMLElement>(selector);
      if (!target) {
        consumePendingRevealPath();
        return;
      }

      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add(...REVEAL_HIGHLIGHT_CLASSES);
      window.setTimeout(() => target.classList.remove(...REVEAL_HIGHLIGHT_CLASSES), 2000);
      consumePendingRevealPath();
    });

    return () => cancelAnimationFrame(raf);
  }, [consumePendingRevealPath, pendingRevealPath]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <button
          type="button"
          className="w-full rounded-md border px-2 py-1 text-xs"
          onClick={async () => {
            const formPath = "/岗位/_新建岗位.json";
            const existing = await readFile(formPath);
            if (!existing) {
              await upsertFile({
                path: formPath,
                name: "_新建岗位.json",
                parentPath: "/岗位",
                contentType: "json",
                content: JSON.stringify({ company: "", position: "", jdText: "" }, null, 2),
                isSystem: true,
              });
            }
            const ok = await openFilePath(formPath);
            if (!ok) window.alert("打开岗位创建表单失败，请重试。");
          }}
        >
          + 新建岗位
        </button>
      </div>

      <div ref={treeWrapRef} className="flex-1 overflow-auto py-2">
        {tree
          .filter((node) => shouldShowInTree(node.file.path, node.file.isSystem))
          .map((node) => (
            <FileTreeNode key={node.file.path} node={node} />
          ))}
      </div>

      <div className="border-t border-zinc-200 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800">
        {stats.jobs} 个岗位 · {stats.resumes} 份简历 · {stats.interviews} 轮面试
      </div>
    </div>
  );
}
