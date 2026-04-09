"use client";

import { FileDown, Sparkles } from "lucide-react";
import { sendMessage } from "@/lib/ai-engine";
import { buildContext } from "@/lib/context-builder";
import { deleteFile, readFile, upsertFile } from "@/lib/file-system";
import { generateInterviewReview, generateJobDoc, generatePrepPack } from "@/lib/generation-actions";
import { exportResumePdf } from "@/lib/resume-pdf";
import { flushResumeDraft, getResumeDraftSnapshot } from "@/lib/resume-draft-sync";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";

function getJobFolderPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "岗位" || parts.length < 2) return null;
  return `/${parts[0]}/${parts[1]}`;
}

function getInterviewFolderPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "面试复盘" || parts.length < 2) return null;
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

export function Toolbar() {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const isGenerating = useAppStore((s) => s.isGenerating);
  const generationNotice = useAppStore((s) => s.generationNotice);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const clearGenerationNotice = useAppStore((s) => s.clearGenerationNotice);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);

  if (!currentFilePath) {
    return <div className="h-12 border-b px-3 py-2 text-xs text-zinc-500">请选择文件</div>;
  }

  const jobFolderPath = getJobFolderPath(currentFilePath);
  const interviewFolderPath = getInterviewFolderPath(currentFilePath);
  const isInterviewTranscriptFile = currentFilePath.endsWith("/面试原文.md");

  async function polishResume() {
    const source = window.prompt("请输入要润色的经历文本");
    if (!source) return;
    const context = await buildContext({ mode: "resume-polish", userPrompt: `请按 STAR 法则润色：\n${source}` });
    const output = await sendMessage({ ...llmConfig, messages: context.messages });
    window.alert(output);
  }

  async function createInterviewRecordQuickly() {
    if (!jobFolderPath) return;
    const round = window.prompt("请输入面试轮次（例如：一面/二面/HR面）", "一面");
    if (round === null) return;
    try {
      await createInterviewRecord(jobFolderPath, round);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "新建复盘失败");
    }
  }

  async function runReview() {
    if (!interviewFolderPath) return;
    const interview = await readFile(`${interviewFolderPath}/面试原文.md`);
    if (!interview || isInterviewTranscriptEmpty(interview.content)) {
      window.alert("请先在“面试原文.md”模板下方粘贴至少一段真实问答内容，再点击生成复盘报告。");
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
    const ok = await openFilePath(jdPath);
    if (!ok) window.alert("JD 文件未找到，可能已被删除。");
  }

  async function removeCurrentTarget() {
    if (!currentFilePath) return;
    const target = await readFile(currentFilePath);
    if (!target) {
      window.alert("当前文件不存在或已删除。");
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
    const isFolder = target.type === "folder";
    const ok = window.confirm(
      isFolder
        ? `将删除文件夹「${target.name}」及其全部内容，确认继续？`
        : `将永久删除文件「${target.name}」，确认继续？`,
    );
    if (!ok) return;

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
    <div className="border-b bg-white/90 px-2 py-1 text-xs dark:bg-zinc-950/90">
      <div className="flex flex-wrap items-center gap-2">
        {isGenerating ? (
          <button
            type="button"
            className="rounded-md border border-red-300 px-2 py-1 text-red-600"
            onClick={() => cancelGeneration()}
          >
            取消生成
          </button>
        ) : null}

        {currentFilePath === "/简历/主简历.json" ? (
          <>
            <button type="button" disabled={isGenerating} onClick={polishResume} className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
              <Sparkles size={14} /> AI润色
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
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
              <FileDown size={14} /> 导出PDF
            </button>
          </>
        ) : null}

        {jobFolderPath ? (
          <>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void openOrCreateJd()}>
              录入JD
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void createInterviewRecordQuickly()}>
              新建复盘
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void generateJobDoc(jobFolderPath, "match")}>
              生成匹配分析
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void generateJobDoc(jobFolderPath, "boss")}>
              生成BOSS招呼语
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void generateJobDoc(jobFolderPath, "email")}>
              生成求职邮件
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void generateJobDoc(jobFolderPath, "custom-resume")}>
              生成定制简历
            </button>
            <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={() => void generatePrepPack(jobFolderPath)}>
              生成面试准备包
            </button>
          </>
        ) : null}

        {interviewFolderPath ? (
          <button type="button" disabled={isGenerating} className="rounded-md border px-2 py-1" onClick={runReview}>
            生成复盘报告
          </button>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-zinc-500">
        <span className="max-w-full break-all">当前路径：{currentFilePath}</span>
        {currentFilePath === "/简历/主简历.json" ? <span>提示：岗位文书请在岗位目录下生成</span> : null}
        {isInterviewTranscriptFile ? <span>步骤：1. 粘贴原文 2. 点击“生成复盘报告”</span> : null}
        <button
          type="button"
          disabled={isGenerating}
          className="rounded-md border border-red-300 px-2 py-0.5 text-red-600"
          onClick={() => void removeCurrentTarget()}
        >
          删除当前文件
        </button>

        {generationNotice ? (
          <div className="ml-auto flex items-center gap-2 rounded-md border px-2 py-0.5 text-zinc-600">
            <span className="truncate">{generationNotice.text}</span>
            {generationNotice.path ? (
              <button
                type="button"
                className="rounded border px-1.5 py-0.5"
                onClick={async () => {
                  const ok = await openFilePath(generationNotice.path!);
                  if (!ok) window.alert("目标文件未找到，可能已被删除。");
                }}
              >
                打开
              </button>
            ) : null}
            <button type="button" className="rounded border px-1.5 py-0.5" onClick={() => clearGenerationNotice()}>
              关闭
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
