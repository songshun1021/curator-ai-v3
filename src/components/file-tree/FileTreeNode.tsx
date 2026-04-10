"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight, FileJson2, FileText, FileType, Folder, FolderOpen, Sparkles } from "lucide-react";
import { deleteFile, readFile } from "@/lib/file-system";
import { isHiddenSystemPath } from "@/lib/system-files";
import { createInterviewRecord, createJobFolder, updateJobStatus } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
import { TreeNode } from "@/types";

const STATUS_COLORS: Record<string, string> = {
  saved: "bg-zinc-400",
  preparing: "bg-amber-500",
  applied: "bg-blue-500",
  interviewing: "bg-purple-500",
  offered: "bg-emerald-500",
  rejected: "bg-red-500",
};

function getFileIcon(name: string, isFolder: boolean, expanded: boolean) {
  if (isFolder) return expanded ? FolderOpen : Folder;
  if (name.endsWith(".md")) return FileText;
  if (name.endsWith(".json")) return FileJson2;
  if (name.endsWith(".pdf")) return FileType;
  return FileText;
}

function isJobFolder(path: string) {
  return path.startsWith("/岗位/") && path.split("/").length === 3;
}

function shouldShowInTree(path: string, isSystem: boolean) {
  if (isSystem) return false;
  if (isHiddenSystemPath(path)) return false;
  if (path.endsWith("/meta.json")) return false;
  return true;
}

export function FileTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const expandedFolders = useAppStore((s) => s.expandedFolders);
  const fileCache = useAppStore((s) => s.fileCache);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const reloadTree = useAppStore((s) => s.reloadTree);
  const clearGenerationNotice = useAppStore((s) => s.clearGenerationNotice);

  const isFolder = node.file.type === "folder";
  const expanded = expandedFolders.includes(node.file.path);
  const selected = currentFilePath === node.file.path;
  const Icon = getFileIcon(node.file.name, isFolder, expanded);

  const visibleChildren = useMemo(
    () => node.children.filter((child) => shouldShowInTree(child.file.path, child.file.isSystem)),
    [node.children],
  );

  const jobStatus = useMemo(() => {
    if (!isJobFolder(node.file.path)) return null;
    const meta = fileCache[`${node.file.path}/meta.json`];
    if (!meta) return null;
    try {
      return JSON.parse(meta.content).status as string;
    } catch {
      return null;
    }
  }, [fileCache, node.file.path]);

  async function tryDeleteTarget(path: string) {
    const target = await readFile(path);
    if (!target) {
      window.alert("目标不存在或已删除。");
      return;
    }
    if (target.isSystem) {
      window.alert("系统文件不可删除。");
      return;
    }
    if (["/简历", "/岗位", "/面试准备包", "/面试复盘", "/AI配置"].includes(target.path)) {
      window.alert("根目录不可删除。");
      return;
    }
    const ok = window.confirm(
      target.type === "folder"
        ? `将删除文件夹「${target.name}」及其全部内容，确认继续？`
        : `将永久删除文件「${target.name}」，确认继续？`,
    );
    if (!ok) return;

    await deleteFile(target.path);
    await reloadTree();

    const current = useAppStore.getState().currentFilePath;
    if (current && (current === target.path || current.startsWith(`${target.path}/`))) {
      useAppStore.getState().setCurrentFilePath(null);
    }
    const noticePath = useAppStore.getState().generationNotice?.path;
    if (noticePath && (noticePath === target.path || noticePath.startsWith(`${target.path}/`))) {
      clearGenerationNotice();
    }
  }

  async function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();

    if (node.file.path === "/岗位") {
      const company = window.prompt("输入公司名");
      if (!company) return;
      const position = window.prompt("输入岗位名");
      if (!position) return;
      try {
        await createJobFolder(company.trim(), position.trim());
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "创建岗位失败");
      }
      return;
    }

    if (node.file.path === "/面试复盘") {
      const jobs = Object.values(fileCache)
        .filter((f) => f.type === "folder" && f.parentPath === "/岗位")
        .map((f) => f.path);
      if (jobs.length === 0) {
        window.alert("请先创建岗位");
        return;
      }
      const selectedJob = window.prompt(`输入关联岗位路径:\n${jobs.join("\n")}`, jobs[0]);
      if (!selectedJob) return;
      const round = window.prompt("输入面试轮次（如：一面）", "一面");
      if (!round) return;
      try {
        await createInterviewRecord(selectedJob, round);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "创建面试记录失败");
      }
      return;
    }

    if (isJobFolder(node.file.path)) {
      const action = window.prompt("输入操作：status / delete", "status");
      if (!action) return;
      if (action === "delete") {
        await tryDeleteTarget(node.file.path);
        return;
      }
      const next = window.prompt(
        "设置岗位状态：saved/preparing/applied/interviewing/offered/rejected",
        jobStatus ?? "saved",
      );
      if (!next) return;
      await updateJobStatus(node.file.path, next);
      return;
    }

    if (node.file.path === "/AI配置") {
      const action = window.prompt("输入操作：export / import / toggle-theme", "export");
      if (action === "toggle-theme") {
        document.documentElement.classList.toggle("dark");
        return;
      }
      if (action === "export") {
        const files = Object.values(fileCache);
        const payload = {
          version: "3.0",
          exportedAt: new Date().toISOString(),
          files,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `curator-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (action === "import") {
        window.alert("请在后续版本使用设置面板导入（当前已实现导出）。");
      }
      await reloadTree();
      return;
    }

    if (!node.file.isSystem) {
      const action = window.prompt("输入操作：delete", "delete");
      if (action === "delete") {
        await tryDeleteTarget(node.file.path);
      }
    }
  }

  return (
    <div className={depth > 0 ? "pl-4" : ""}>
      <button
        data-path={node.file.path}
        type="button"
        onClick={() => {
          if (isFolder) toggleFolder(node.file.path);
          setCurrentFilePath(node.file.path);
        }}
        onContextMenu={onContextMenu}
        className={`flex h-8 w-full items-center gap-1.5 px-2 text-left text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800 ${selected ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" : ""}`}
      >
        {isFolder ? (
          expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Icon
          size={16}
          className={`shrink-0 ${isFolder ? "text-amber-500" : node.file.isSystem ? "text-zinc-400" : "text-zinc-600 dark:text-zinc-300"}`}
        />
        <span className={`truncate ${node.file.isSystem ? "text-zinc-400" : ""}`}>{node.file.name}</span>
        {jobStatus ? <span className={`ml-auto size-2 rounded-full ${STATUS_COLORS[jobStatus] || "bg-zinc-400"}`} /> : null}
        {node.file.isGenerated ? <Sparkles size={12} className="ml-1 text-blue-500" /> : null}
      </button>

      {isFolder && expanded && visibleChildren.length > 0 ? (
        <div>
          {visibleChildren.map((child) => (
            <FileTreeNode key={child.file.path} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
