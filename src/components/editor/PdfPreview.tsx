"use client";

import { useState } from "react";
import {
  RESUME_MAIN_JSON_PATH,
  RESUME_MARKDOWN_PATH,
  RESUME_PDF_PATH,
  generateMainResumeFromPdf,
  generateResumeMarkdownFromPdf,
  getResumeJsonRunStatus,
  hasConfiguredModel,
  resumeDataUrlToFile,
  type ResumeActionMessage,
  type ResumeJsonRunStatus,
} from "@/lib/resume-import";
import { useAppStore } from "@/store/app-store";

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`h-2.5 w-8 rounded-full transition-all ${
            current > step
              ? "bg-sky-500"
              : current === step
                ? "animate-pulse bg-sky-400"
                : "bg-white/70"
          }`}
        />
      ))}
    </div>
  );
}

export function PdfPreview({ path, content }: { path: string; content: string }) {
  const llmConfig = useAppStore((s) => s.llmConfig);
  const trialStatus = useAppStore((s) => s.trialStatus);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const reloadTree = useAppStore((s) => s.reloadTree);
  const setResumePrefillPayload = useAppStore((s) => s.setResumePrefillPayload);
  const [runningAction, setRunningAction] = useState<"md" | "json" | null>(null);
  const [actionMessage, setActionMessage] = useState<ResumeActionMessage | null>(null);
  const [jsonRunStatus, setJsonRunStatus] = useState<ResumeJsonRunStatus | null>(null);

  const hasContent = Boolean(content?.trim());
  const isImportedResumePdf = path === RESUME_PDF_PATH;

  if (!hasContent) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">该 PDF 暂无可预览内容。</div>;
  }

  const messageTone =
    actionMessage?.type === "success"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
      : actionMessage?.type === "warning"
        ? "border-amber-200 bg-amber-50/90 text-amber-700"
        : "border-rose-200 bg-rose-50/90 text-rose-700";

  async function handleGenerateMarkdown() {
    if (!isImportedResumePdf) return;
    setRunningAction("md");
    setJsonRunStatus(null);
    setActionMessage(null);

    try {
      const file = resumeDataUrlToFile(content, "个人简历.pdf");
      const result = await generateResumeMarkdownFromPdf({
        file,
        confirmOverwriteMarkdown: (message) => window.confirm(message),
      });

      if (result.canceled) return;

      await reloadTree();
      if (result.message) {
        setActionMessage(result.message);
      }
      await openFilePath(RESUME_MARKDOWN_PATH);
    } catch (error) {
      setActionMessage({
        type: "error",
        stage: "error",
        text: `生成个人简历.md 失败：${error instanceof Error ? error.message : "请稍后重试"}`,
      });
    } finally {
      setRunningAction(null);
    }
  }

  async function handleGenerateMainResumeJson() {
    if (!isImportedResumePdf) return;
    if (!hasConfiguredModel(llmConfig)) {
      setActionMessage({
        type: "error",
        stage: "prefill_failed",
        text: trialStatus?.blockedReason
          ? `平台试用当前不可用：${trialStatus.blockedReason}。请在 AI 配置页填写你自己的 API。`
          : "请先在 /AI配置/模型配置.json 中完成模型配置，或使用平台试用额度。",
      });
      await openFilePath("/AI配置/模型配置.json");
      return;
    }

    setRunningAction("json");
    setActionMessage(null);
    setJsonRunStatus(getResumeJsonRunStatus("preparing", "pdf"));

    try {
      const file = resumeDataUrlToFile(content, "个人简历.pdf");
      const result = await generateMainResumeFromPdf({
        file,
        llmConfig,
        confirmOverwriteMarkdown: (message) => window.confirm(message),
        confirmOverwriteMainResume: (message) => window.confirm(message),
        onStageChange: setJsonRunStatus,
      });

      if (result.canceled) return;

      await reloadTree();

      if (result.resume && result.message) {
        setResumePrefillPayload({
          resume: result.resume,
          incompleteSections: result.incompleteSections,
          message: result.message,
        });
        await openFilePath(RESUME_MAIN_JSON_PATH);
        return;
      }

      if (result.message) {
        setActionMessage(result.message);
      }

      await openFilePath(result.blocked ? RESUME_MARKDOWN_PATH : RESUME_MAIN_JSON_PATH);
    } catch (error) {
      setActionMessage({
        type: "error",
        stage: "prefill_failed",
        text: `从个人简历 PDF 生成主简历失败：${error instanceof Error ? error.message : "请稍后重试"}`,
      });
      await openFilePath(RESUME_MAIN_JSON_PATH);
    } finally {
      setRunningAction(null);
      setJsonRunStatus(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/70 bg-white/72 px-4 py-3 backdrop-blur-xl">
        {isImportedResumePdf ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="curator-button-functional curator-button-sm"
              disabled={Boolean(runningAction)}
              onClick={() => void handleGenerateMarkdown()}
            >
              {runningAction === "md" ? "生成中..." : "生成个人简历.md"}
            </button>
            <button
              type="button"
              className="curator-button-primary curator-button-sm"
              disabled={Boolean(runningAction)}
              onClick={() => void handleGenerateMainResumeJson()}
            >
              {runningAction === "json" ? "处理中..." : "生成主简历 JSON"}
            </button>
            <a href={content} target="_blank" rel="noreferrer" className="curator-button-ghost curator-button-sm">
              新窗口打开
            </a>
            <span className="text-[11px] text-zinc-500">建议先检查个人简历.md，再保存主简历。</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{path}</span>
            <a href={content} target="_blank" rel="noreferrer" className="curator-button-ghost curator-button-sm">
              新窗口打开
            </a>
          </div>
        )}
      </div>

      {runningAction === "json" && jsonRunStatus ? (
        <div className="mx-4 mt-4 rounded-[22px] border border-sky-100 bg-sky-50/80 px-4 py-4 text-xs text-zinc-700">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-zinc-900">{jsonRunStatus.title}</p>
              <p className="mt-1 text-zinc-500">{jsonRunStatus.description}</p>
            </div>
            <ProgressDots current={jsonRunStatus.progress} />
          </div>
        </div>
      ) : null}

      {actionMessage ? (
        <div className={`mx-4 mt-4 rounded-[20px] border px-4 py-3 text-xs ${messageTone}`}>
          <p className="font-medium">当前状态</p>
          <p className="mt-1 leading-5">{actionMessage.text}</p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 p-4">
        <object data={content} type="application/pdf" className="h-full w-full">
          <div className="glass-panel flex h-full items-center justify-center rounded-[28px] border border-white/80 bg-white/72 p-6 text-sm text-zinc-500 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
            该 PDF 暂不支持内嵌预览，可使用“新窗口打开”查看。
          </div>
        </object>
      </div>
    </div>
  );
}
