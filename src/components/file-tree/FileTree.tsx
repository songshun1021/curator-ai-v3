"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, FileUp } from "lucide-react";
import { FileTreeNode } from "@/components/file-tree/FileTreeNode";
import {
  CuratorDialog,
  CuratorField,
  CuratorNoticeDialog,
  curatorInputClassName,
  curatorTextareaClassName,
} from "@/components/ui/curator-dialogs";
import { getInterviewRoundFolders } from "@/lib/interview-paths";
import { isHiddenSystemPath } from "@/lib/system-files";
import { createJobFolderWithJD } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";

const REVEAL_HIGHLIGHT_CLASSES = ["ring-2", "ring-blue-400", "bg-blue-50"];
const EMPTY_JOB_FORM = { company: "", position: "", jdText: "" };

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

  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobForm, setJobForm] = useState(EMPTY_JOB_FORM);
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);

  const files = Object.values(fileCache);
  const stats = {
    jobs: files.filter((f) => f.type === "folder" && f.parentPath === "/岗位").length,
    resumes: files.filter((f) => f.path.startsWith("/简历") && f.name.endsWith(".json")).length,
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

  async function submitJobCreate() {
    try {
      await createJobFolderWithJD(jobForm);
      setJobDialogOpen(false);
      setJobForm(EMPTY_JOB_FORM);
    } catch (error) {
      setNotice({
        title: "新建岗位失败",
        description: error instanceof Error ? error.message : "岗位创建未完成，请稍后重试。",
      });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/70 px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="curator-button-functional w-full justify-start gap-2 rounded-2xl px-3.5 py-2.5"
            onClick={() => void openFilePath("/简历/主简历.json")}
          >
            <span className="curator-glass-dot bg-blue-400/90" />
            <FileUp size={16} />
            <span>导入简历</span>
          </button>
          <button
            type="button"
            className="curator-button-functional w-full justify-start gap-2 rounded-2xl px-3.5 py-2.5"
            onClick={() => setJobDialogOpen(true)}
          >
            <span className="curator-glass-dot bg-blue-300/80" />
            <BriefcaseBusiness size={16} />
            <span>新建岗位</span>
          </button>
        </div>
      </div>

      <div ref={treeWrapRef} className="soft-scrollbar flex-1 overflow-auto py-2">
        {tree
          .filter((node) => shouldShowInTree(node.file.path, node.file.isSystem))
          .map((node) => (
            <FileTreeNode key={node.file.path} node={node} />
          ))}
      </div>

      <div className="border-t border-white/70 px-3 py-3 text-[11px] text-zinc-500">
        {stats.jobs} 个岗位 · {stats.resumes} 份简历 · {stats.interviews} 次面试
      </div>

      <CuratorDialog
        open={jobDialogOpen}
        onOpenChange={(open) => {
          setJobDialogOpen(open);
          if (!open) setJobForm(EMPTY_JOB_FORM);
        }}
        title="新建岗位"
        description="一次填写公司、岗位和 JD，创建后会直接进入岗位文件夹。"
        footer={
          <>
            <button
              type="button"
              className="curator-button-secondary"
              onClick={() => {
                setJobDialogOpen(false);
                setJobForm(EMPTY_JOB_FORM);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="curator-button-secondary"
              onClick={async () => {
                setJobDialogOpen(false);
                await openFilePath("/简历/主简历.json");
              }}
            >
              导入简历
            </button>
            <button type="button" className="curator-button-primary" onClick={() => void submitJobCreate()}>
              创建岗位
            </button>
          </>
        }
      >
        <CuratorField label="公司名称">
          <input
            value={jobForm.company}
            onChange={(event) => setJobForm((current) => ({ ...current, company: event.target.value }))}
            className={curatorInputClassName}
            placeholder="例如：字节跳动"
          />
        </CuratorField>
        <CuratorField label="岗位名称">
          <input
            value={jobForm.position}
            onChange={(event) => setJobForm((current) => ({ ...current, position: event.target.value }))}
            className={curatorInputClassName}
            placeholder="例如：产品经理实习生"
          />
        </CuratorField>
        <CuratorField label="JD 内容" hint="默认绑定主简历。如需更新简历，请先点击“导入简历”进入主简历导入页。">
          <textarea
            value={jobForm.jdText}
            onChange={(event) => setJobForm((current) => ({ ...current, jdText: event.target.value }))}
            className={curatorTextareaClassName}
            placeholder="请粘贴岗位描述原文"
          />
        </CuratorField>
      </CuratorDialog>

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
