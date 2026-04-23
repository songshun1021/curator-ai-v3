"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileDown, Sparkles } from "lucide-react";
import {
  CuratorConfirmDialog,
  CuratorDialog,
  CuratorField,
  CuratorNoticeDialog,
  curatorInputClassName,
} from "@/components/ui/curator-dialogs";
import { sendMessage } from "@/lib/ai-engine";
import { buildContext } from "@/lib/context-builder";
import { deleteFile, readFile, upsertFile } from "@/lib/file-system";
import { generateInterviewReview, generateJobDoc, generatePrepPack } from "@/lib/generation-actions";
import { getInterviewFolderPathFromAnyPath } from "@/lib/interview-paths";
import { getProtectedDeleteReason } from "@/lib/protected-files";
import { exportResumePdf } from "@/lib/resume-pdf";
import { flushResumeDraft, getResumeDraftSnapshot } from "@/lib/resume-draft-sync";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
const compactFunctionalButtonClassName = "curator-button-functional curator-button-sm";
const compactPrimaryButtonClassName = "curator-button-primary curator-button-sm";
const compactSecondaryButtonClassName = "curator-button-secondary curator-button-sm";
const compactDangerButtonClassName = "curator-button-danger curator-button-sm";
const compactGhostButtonClassName = "curator-button-ghost curator-button-sm";

const ROOT_PATHS = ["/简历", "/岗位", "/面试准备包", "/面试复盘", "/AI配置"];

function getJobFolderPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "岗位" || parts.length < 2 || parts[1].includes(".")) return null;
  return `/${parts[0]}/${parts[1]}`;
}

function isInterviewTranscriptEmpty(content: string) {
  const normalized = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "# 面试原文")
    .filter((line) => !line.includes("请将面试听写文本粘贴到下方"))
    .filter((line) => !line.includes("尽量按问答格式整理"));

  return normalized.length === 0;
}

interface ToolbarProps {
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Toolbar({ collapsible = false, collapsed = false, onToggleCollapsed }: ToolbarProps) {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const generationNotice = useAppStore((s) => s.generationNotice);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const markMarkdownEditOnce = useAppStore((s) => s.markMarkdownEditOnce);
  const clearGenerationNotice = useAppStore((s) => s.clearGenerationNotice);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewRound, setReviewRound] = useState("一面");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);
  const isFileContentPage = Boolean(currentFilePath && currentFilePath.includes("."));

  if (!currentFilePath) {
    return <div className="h-12 border-b border-white/70 px-4 py-3 text-xs text-zinc-600">请选择文件</div>;
  }

  if (collapsible && isFileContentPage && collapsed) {
    return (
      <div className="flex h-12 items-center justify-end border-b border-white/70 bg-white/78 px-3 py-2 text-xs backdrop-blur-xl">
        <button
          type="button"
          aria-label="展开顶部功能键"
          className={`${compactGhostButtonClassName} h-8 w-8 rounded-full !px-0`}
          onClick={onToggleCollapsed}
        >
          <ChevronDown size={16} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  const jobFolderPath = getJobFolderPath(currentFilePath);
  const interviewFolderPath = getInterviewFolderPathFromAnyPath(currentFilePath);
  const isInterviewTranscriptFile = currentFilePath.endsWith("/面试原文.md");
  const isInterviewReportFile = currentFilePath.endsWith("/复盘报告.md");
  const showReviewGenerateButton = Boolean(interviewFolderPath) && !isInterviewReportFile;

  function openNotice(title: string, description: string) {
    setNotice({ title, description });
  }

  async function polishResume() {
    const source = window.prompt("请输入要润色的经历文本");
    if (!source) return;
    const context = await buildContext({ mode: "resume-polish", userPrompt: `请按 STAR 法则润色：\n${source}` });
    const output = await sendMessage({
      ...llmConfig,
      provider: llmConfig.provider,
      messages: context.messages,
      usageContext: "resume-polish",
      usageLabel: "简历润色",
    });
    window.alert(output);
  }

  async function runReview() {
    if (!interviewFolderPath) return;
    const interview = await readFile(`${interviewFolderPath}/面试原文.md`);
    if (!interview || isInterviewTranscriptEmpty(interview.content)) {
      openNotice("还不能生成复盘", "请先在“面试原文.md”模板下方粘贴至少一段真实问答内容。");
      return;
    }
    await generateInterviewReview(interviewFolderPath);
  }

  async function openOrCreateJd() {
    if (!jobFolderPath) return;
    const jdPath = `${jobFolderPath}/jd.md`;
    const jd = await readFile(jdPath);
    if (!jd) {
      await upsertFile({
        path: jdPath,
        name: "jd.md",
        parentPath: jobFolderPath,
        contentType: "md",
        content: "# JD\n\n请粘贴岗位描述。",
      });
    }
    await useAppStore.getState().reloadTree();
    markMarkdownEditOnce(jdPath);
    const ok = await openFilePath(jdPath);
    if (!ok) openNotice("打开失败", "JD 文件未找到，可能已被删除。");
  }

  async function prepareDeleteCurrentTarget() {
    if (!currentFilePath) return;
    const target = await readFile(currentFilePath);
    if (!target) {
      openNotice("删除失败", "当前文件不存在或已删除。");
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

  async function removeCurrentTarget() {
    if (!currentFilePath) return;
    const target = await readFile(currentFilePath);
    if (!target) {
      openNotice("删除失败", "当前文件不存在或已删除。");
      return;
    }

    await deleteFile(target.path);
    const store = useAppStore.getState();
    await store.reloadTree();
    if (store.currentFilePath && (store.currentFilePath === target.path || store.currentFilePath.startsWith(`${target.path}/`))) {
      setCurrentFilePath(null);
    }
    const noticePath = store.generationNotice?.path;
    if (noticePath && (noticePath === target.path || noticePath.startsWith(`${target.path}/`))) {
      clearGenerationNotice();
    }
  }

  return (
    <div className="border-b border-white/70 bg-white/80 px-3 py-2 text-xs backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {isGenerating ? (
            <button type="button" className={compactDangerButtonClassName} onClick={() => cancelGeneration()}>
              取消生成
            </button>
          ) : null}

          {currentFilePath === "/简历/主简历.json" ? (
            <>
              <button type="button" disabled={isGenerating} onClick={polishResume} className={compactFunctionalButtonClassName}>
                <Sparkles size={14} strokeWidth={1.8} /> AI 润色
              </button>
              <button
                type="button"
                className={compactFunctionalButtonClassName}
                onClick={async () => {
                  await flushResumeDraft("/简历/主简历.json");
                  const draft = getResumeDraftSnapshot("/简历/主简历.json");
                  if (draft) {
                    await exportResumePdf(draft);
                    return;
                  }
                  const file = await readFile("/简历/主简历.json");
                  if (!file) return;
                  await exportResumePdf(JSON.parse(file.content));
                }}
              >
                <FileDown size={14} strokeWidth={1.8} /> 导出 PDF
              </button>
            </>
          ) : null}

          {jobFolderPath ? (
            <>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void openOrCreateJd()}>
                录入 JD
              </button>
              <button
                type="button"
                disabled={isGenerating}
                className={compactFunctionalButtonClassName}
                onClick={() => {
                  setReviewRound("一面");
                  setReviewDialogOpen(true);
                }}
              >
                新建复盘
              </button>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void generateJobDoc(jobFolderPath, "match")}>
                匹配分析
              </button>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void generateJobDoc(jobFolderPath, "boss")}>
                BOSS 招呼语
              </button>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void generateJobDoc(jobFolderPath, "email")}>
                求职邮件
              </button>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void generateJobDoc(jobFolderPath, "custom-resume")}>
                定制简历
              </button>
              <button type="button" disabled={isGenerating} className={compactFunctionalButtonClassName} onClick={() => void generatePrepPack(jobFolderPath)}>
                面试准备包
              </button>
            </>
          ) : null}

          {showReviewGenerateButton ? (
            <button type="button" disabled={isGenerating} className={compactPrimaryButtonClassName} onClick={runReview}>
              生成复盘报告
            </button>
          ) : null}
        </div>

        {collapsible && isFileContentPage ? (
          <button
            type="button"
            aria-label="收起顶部功能键"
            className={`${compactGhostButtonClassName} h-8 w-8 shrink-0 rounded-full !px-0`}
            onClick={onToggleCollapsed}
          >
            <ChevronUp size={16} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-zinc-600">
        <span className="max-w-full break-all rounded-xl border border-white/70 bg-white/72 px-2.5 py-1">当前路径：{currentFilePath}</span>
        {currentFilePath === "/简历/主简历.json" ? (
          <span className="rounded-xl border border-white/70 bg-white/60 px-2.5 py-1">提示：岗位文书请在岗位目录下生成</span>
        ) : null}
        {isInterviewTranscriptFile ? (
          <span className="rounded-xl border border-white/70 bg-white/60 px-2.5 py-1">步骤：1. 粘贴原文 2. 点击“生成复盘报告”</span>
        ) : null}
        <button type="button" disabled={isGenerating} className={compactDangerButtonClassName} onClick={() => void prepareDeleteCurrentTarget()}>
          删除当前文件
        </button>

        {generationNotice ? (
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/75 bg-white/88 px-2 py-1 text-zinc-700 shadow-[0_10px_24px_rgba(148,163,184,0.1)]">
              <span className="truncate">{generationNotice.text}</span>
              {generationNotice.path ? (
                <button
                  type="button"
                  className={compactFunctionalButtonClassName}
                  onClick={async () => {
                    const ok = await openFilePath(generationNotice.path!);
                    if (!ok) openNotice("打开失败", "目标文件未找到，可能已被删除。");
                  }}
                >
                  打开
                </button>
              ) : null}
              <button type="button" className={compactGhostButtonClassName} onClick={() => clearGenerationNotice()}>
                关闭
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <CuratorDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        title="新建复盘"
        description={jobFolderPath ? `岗位：${jobFolderPath.split("/").filter(Boolean).at(-1)}` : "填写面试轮次后创建复盘目录。"}
        widthClassName="max-w-md"
        footer={
          <>
            <button type="button" className={compactSecondaryButtonClassName} onClick={() => setReviewDialogOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className={compactPrimaryButtonClassName}
              onClick={async () => {
                if (!jobFolderPath) return;
                try {
                  await createInterviewRecord(jobFolderPath, reviewRound);
                  setReviewDialogOpen(false);
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
        <CuratorField label="面试轮次" hint="例如：一面、二面、HR 面">
          <input value={reviewRound} onChange={(event) => setReviewRound(event.target.value)} className={curatorInputClassName} placeholder="请输入轮次" />
        </CuratorField>
      </CuratorDialog>

      <CuratorConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="删除当前文件"
        description="当前选中文件会被永久删除，此操作不可撤销。"
        confirmLabel="确认删除"
        confirmTone="danger"
        onConfirm={async () => {
          await removeCurrentTarget();
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
