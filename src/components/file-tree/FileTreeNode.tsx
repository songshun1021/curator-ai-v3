"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileJson2, FileText, FileType, Folder, FolderOpen, Sparkles } from "lucide-react";
import {
  CuratorConfirmDialog,
  CuratorContextMenu,
  CuratorDialog,
  CuratorField,
  CuratorNoticeDialog,
  curatorInputClassName,
  curatorSelectClassName,
  curatorTextareaClassName,
} from "@/components/ui/curator-dialogs";
import { deleteFile, readFile } from "@/lib/file-system";
import { isHiddenSystemPath } from "@/lib/system-files";
import { getProtectedDeleteReason } from "@/lib/protected-files";
import { createInterviewRecord, createJobFolderWithJD, updateJobStatus } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
import { TreeNode } from "@/types";

const ROOT_PATHS = ["/简历", "/岗位", "/面试准备包", "/面试复盘", "/AI配置"];
const STATUS_OPTIONS = [
  { value: "saved", label: "已保存" },
  { value: "preparing", label: "准备中" },
  { value: "applied", label: "已投递" },
  { value: "interviewing", label: "面试中" },
  { value: "offered", label: "已拿 offer" },
  { value: "rejected", label: "未通过" },
];
const STATUS_COLORS: Record<string, string> = {
  saved: "bg-zinc-400",
  preparing: "bg-stone-400",
  applied: "bg-sky-400",
  interviewing: "bg-slate-400",
  offered: "bg-emerald-400",
  rejected: "bg-rose-400",
};
const EMPTY_JOB_FORM = { company: "", position: "", jdText: "" };

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

function getJobLabel(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function FileTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const expandedFolders = useAppStore((s) => s.expandedFolders);
  const fileCache = useAppStore((s) => s.fileCache);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);
  const toggleFolder = useAppStore((s) => s.toggleFolder);
  const reloadTree = useAppStore((s) => s.reloadTree);
  const clearGenerationNotice = useAppStore((s) => s.clearGenerationNotice);

  const [menuState, setMenuState] = useState({ open: false, x: 0, y: 0 });
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobForm, setJobForm] = useState(EMPTY_JOB_FORM);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [interviewForm, setInterviewForm] = useState({ jobFolderPath: "", round: "一面" });
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusValue, setStatusValue] = useState("saved");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);

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

  const jobFolders = useMemo(
    () =>
      Object.values(fileCache)
        .filter((file) => file.type === "folder" && file.parentPath === "/岗位")
        .map((file) => ({ path: file.path, label: getJobLabel(file.path) }))
        .sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [fileCache],
  );

  function openNotice(title: string, description: string) {
    setNotice({ title, description });
  }

  async function removeTarget(path: string) {
    const target = await readFile(path);
    if (!target) {
      openNotice("删除失败", "目标不存在或已删除。");
      return;
    }

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

  async function handleDeleteIntent(path: string) {
    const target = await readFile(path);
    if (!target) {
      openNotice("删除失败", "目标不存在或已删除。");
      return;
    }

    const protectedReason = getProtectedDeleteReason(target.path, target.isSystem);
    if (protectedReason) {
      openNotice("无法删除", protectedReason);
      return;
    }

    if (ROOT_PATHS.includes(target.path)) {
      openNotice("无法删除", "根目录不可删除。");
      return;
    }

    setDeleteDialogOpen(true);
  }

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setCurrentFilePath(node.file.path);
    if (isJobFolder(node.file.path)) setStatusValue(jobStatus ?? "saved");
    setMenuState({
      open: true,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 240),
    });
  }

  const menuItems = useMemo(() => {
    if (node.file.path === "/岗位") {
      return [{ label: "新建岗位", onSelect: () => setJobDialogOpen(true) }];
    }

    if (node.file.path === "/面试复盘") {
      return [
        {
          label: "新建复盘",
          disabled: jobFolders.length === 0,
          onSelect: () => {
            if (jobFolders.length === 0) {
              openNotice("无法创建复盘", "请先在“岗位”目录下创建至少一个岗位。");
              return;
            }
            setInterviewForm({ jobFolderPath: jobFolders[0]?.path ?? "", round: "一面" });
            setInterviewDialogOpen(true);
          },
        },
      ];
    }

    if (isJobFolder(node.file.path)) {
      return [
        { label: "修改岗位状态", onSelect: () => setStatusDialogOpen(true) },
        { label: "", separator: true },
        { label: "删除岗位", danger: true, onSelect: () => void handleDeleteIntent(node.file.path) },
      ];
    }

    if (node.file.path === "/AI配置") {
      return [
        {
          label: "导出所有数据",
          onSelect: () => {
            const files = Object.values(fileCache);
            const payload = {
              version: "3.0",
              exportedAt: new Date().toISOString(),
              files,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `curator-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
          },
        },
        {
          label: "导入数据",
          onSelect: () => openNotice("导入暂未开放", "当前版本保留导出能力，导入入口后续再接回设置面板。"),
        },
      ];
    }

    if (!node.file.isSystem) {
      return [{ label: node.file.type === "folder" ? "删除文件夹" : "删除文件", danger: true, onSelect: () => void handleDeleteIntent(node.file.path) }];
    }

    return [];
  }, [fileCache, jobFolders, jobStatus, node.file.isSystem, node.file.path, node.file.type]);

  return (
    <div className={depth > 0 ? "pl-4" : ""}>
      <button
        data-path={node.file.path}
        type="button"
        onClick={() => {
          if (isFolder) toggleFolder(node.file.path);
          setCurrentFilePath(node.file.path);
        }}
        onContextMenu={handleContextMenu}
        className={`flex h-8 w-full items-center gap-1.5 rounded-xl px-2 text-left text-[13px] transition hover:bg-slate-50 ${
          selected ? "bg-[linear-gradient(180deg,rgba(239,246,255,0.88),rgba(232,240,250,0.8))] text-sky-700 shadow-[inset_0_0_0_1px_rgba(125,166,255,0.22)]" : "text-zinc-700"
        }`}
      >
        {isFolder ? expanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" /> : <span className="w-4 shrink-0" />}
        <Icon size={16} className={`shrink-0 ${isFolder ? "text-zinc-500" : node.file.isSystem ? "text-zinc-400" : "text-zinc-600"}`} />
        <span className={`truncate ${node.file.isSystem ? "text-zinc-400" : ""}`}>{node.file.name}</span>
        {jobStatus ? <span className={`ml-auto size-2 rounded-full ${STATUS_COLORS[jobStatus] || "bg-zinc-400"}`} /> : null}
        {node.file.isGenerated ? <Sparkles size={12} className="ml-1 text-sky-400" /> : null}
      </button>

      {isFolder && expanded && visibleChildren.length > 0 ? (
        <div>
          {visibleChildren.map((child) => (
            <FileTreeNode key={child.file.path} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}

      <CuratorContextMenu open={menuState.open} position={{ x: menuState.x, y: menuState.y }} items={menuItems} onClose={() => setMenuState((current) => ({ ...current, open: false }))} />

      <CuratorDialog
        open={jobDialogOpen}
        onOpenChange={(open) => {
          setJobDialogOpen(open);
          if (!open) setJobForm(EMPTY_JOB_FORM);
        }}
        title="新建岗位"
        description="保留当前的一条龙建档流程，创建后会直接打开该岗位的 JD。"
        footer={
          <>
            <button type="button" className="curator-button-secondary" onClick={() => setJobDialogOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="curator-button-primary"
              onClick={async () => {
                setJobDialogOpen(false);
                await useAppStore.getState().openFilePath("/简历/主简历.json");
              }}
            >
              导入简历
            </button>
            <button
              type="button"
              className="curator-button-primary"
              onClick={async () => {
                try {
                  await createJobFolderWithJD(jobForm);
                  setJobDialogOpen(false);
                  setJobForm(EMPTY_JOB_FORM);
                } catch (error) {
                  openNotice("新建岗位失败", error instanceof Error ? error.message : "岗位创建未完成，请稍后重试。");
                }
              }}
            >
              创建岗位
            </button>
          </>
        }
      >
        <CuratorField label="公司名称">
          <input value={jobForm.company} onChange={(event) => setJobForm((current) => ({ ...current, company: event.target.value }))} className={curatorInputClassName} placeholder="例如：腾讯" />
        </CuratorField>
        <CuratorField label="岗位名称">
          <input value={jobForm.position} onChange={(event) => setJobForm((current) => ({ ...current, position: event.target.value }))} className={curatorInputClassName} placeholder="例如：运营实习生" />
        </CuratorField>
        <CuratorField label="JD 内容" hint="岗位默认绑定主简历；如需更新简历，请先点“导入简历”完成主简历导入。">
          <textarea value={jobForm.jdText} onChange={(event) => setJobForm((current) => ({ ...current, jdText: event.target.value }))} className={curatorTextareaClassName} placeholder="请粘贴岗位描述原文" />
        </CuratorField>
      </CuratorDialog>

      <CuratorDialog
        open={interviewDialogOpen}
        onOpenChange={(open) => {
          setInterviewDialogOpen(open);
          if (!open) setInterviewForm({ jobFolderPath: jobFolders[0]?.path ?? "", round: "一面" });
        }}
        title="新建复盘"
        description="选择关联岗位并填写轮次，创建后会直接打开“面试原文.md”。"
        footer={
          <>
            <button type="button" className="curator-button-secondary" onClick={() => setInterviewDialogOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="curator-button-primary"
              onClick={async () => {
                try {
                  await createInterviewRecord(interviewForm.jobFolderPath, interviewForm.round);
                  setInterviewDialogOpen(false);
                } catch (error) {
                  openNotice("新建复盘失败", error instanceof Error ? error.message : "复盘记录创建未完成，请稍后重试。");
                }
              }}
            >
              创建复盘
            </button>
          </>
        }
      >
        <CuratorField label="关联岗位">
          <select value={interviewForm.jobFolderPath} onChange={(event) => setInterviewForm((current) => ({ ...current, jobFolderPath: event.target.value }))} className={curatorSelectClassName}>
            {jobFolders.map((folder) => (
              <option key={folder.path} value={folder.path}>
                {folder.label}
              </option>
            ))}
          </select>
        </CuratorField>
        <CuratorField label="面试轮次" hint="例如：一面、二面、HR 面">
          <input value={interviewForm.round} onChange={(event) => setInterviewForm((current) => ({ ...current, round: event.target.value }))} className={curatorInputClassName} placeholder="请输入轮次" />
        </CuratorField>
      </CuratorDialog>

      <CuratorDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        title="修改岗位状态"
        description={isJobFolder(node.file.path) ? `岗位：${getJobLabel(node.file.path)}` : ""}
        widthClassName="max-w-md"
        footer={
          <>
            <button type="button" className="curator-button-secondary" onClick={() => setStatusDialogOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="curator-button-primary"
              onClick={async () => {
                await updateJobStatus(node.file.path, statusValue);
                setStatusDialogOpen(false);
              }}
            >
              保存状态
            </button>
          </>
        }
      >
        <CuratorField label="岗位状态">
          <select value={statusValue} onChange={(event) => setStatusValue(event.target.value)} className={curatorSelectClassName}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </CuratorField>
      </CuratorDialog>

      <CuratorConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={node.file.type === "folder" ? "删除文件夹" : "删除文件"}
        description={node.file.type === "folder" ? `将删除“${node.file.name}”及其全部内容，此操作不可撤销。` : `将永久删除“${node.file.name}”，此操作不可撤销。`}
        confirmLabel="确认删除"
        confirmTone="danger"
        onConfirm={async () => {
          await removeTarget(node.file.path);
          setDeleteDialogOpen(false);
        }}
      />

      <CuratorNoticeDialog
        open={Boolean(notice)}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        title={notice?.title ?? ""}
        description={notice?.description ?? ""}
      />
    </div>
  );
}
