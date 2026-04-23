"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, PencilLine, Sparkles } from "lucide-react";
import { readFile, updateFile } from "@/lib/file-system";
import {
  RESUME_MAIN_JSON_PATH,
  RESUME_MARKDOWN_PATH,
  generateMainResumeFromMarkdown,
  getResumeJsonRunStatus,
  hasConfiguredModel,
  type ResumeActionMessage,
  type ResumeJsonRunStatus,
} from "@/lib/resume-import";
import { useAppStore } from "@/store/app-store";

const AUTO_SAVE_DELAY_MS = 800;
const MARKDOWN_EDIT_MODE_KEY = "curator-editor-md-edit-mode";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function formatSavedAt(timestamp: string | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getInitialEditMode() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MARKDOWN_EDIT_MODE_KEY) === "true";
}

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

export function MarkdownView({ path }: { path: string }) {
  const consumeMarkdownEditOnce = useAppStore((s) => s.consumeMarkdownEditOnce);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const trialStatus = useAppStore((s) => s.trialStatus);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const refreshCurrentFile = useAppStore((s) => s.refreshCurrentFile);
  const setResumePrefillPayload = useAppStore((s) => s.setResumePrefillPayload);
  const [value, setValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isEditMode, setIsEditMode] = useState(getInitialEditMode);
  const [resumeActionRunning, setResumeActionRunning] = useState(false);
  const [resumeActionMessage, setResumeActionMessage] = useState<ResumeActionMessage | null>(null);
  const [resumeRunStatus, setResumeRunStatus] = useState<ResumeJsonRunStatus | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef("");
  const fileVersionRef = useRef("");
  const isResumeMarkdown = path === RESUME_MARKDOWN_PATH;

  const persist = useCallback(
    async (force = false) => {
      const nextValue = valueRef.current;
      if (!force && nextValue === fileVersionRef.current) {
        setSaveStatus("saved");
        return;
      }
      setSaveStatus("saving");
      try {
        await updateFile(path, { content: nextValue });
        await refreshCurrentFile();
        fileVersionRef.current = nextValue;
        setSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
      } catch {
        setSaveStatus("error");
      }
    },
    [path, refreshCurrentFile],
  );

  useEffect(() => {
    const shouldOpenInEdit = consumeMarkdownEditOnce(path);
    if (shouldOpenInEdit) {
      setIsEditMode(true);
    }

    setHydrated(false);
    setSaveStatus("idle");
    setLastSavedAt(null);
    setResumeActionRunning(false);
    setResumeActionMessage(null);
    setResumeRunStatus(null);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    readFile(path).then((file) => {
      const content = file?.content ?? "";
      setValue(content);
      valueRef.current = content;
      fileVersionRef.current = content;
      setHydrated(true);
    });
  }, [consumeMarkdownEditOnce, path]);

  useEffect(() => {
    valueRef.current = value;
    if (!hydrated || !isEditMode) return;
    if (value === fileVersionRef.current) {
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [hydrated, isEditMode, persist, value]);

  useEffect(() => {
    const flush = () => {
      if (!isEditMode) return;
      if (valueRef.current !== fileVersionRef.current) {
        void persist(true);
      }
    };

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [isEditMode, persist]);

  const statusText =
    saveStatus === "saving"
      ? "保存中..."
      : saveStatus === "error"
        ? "保存失败"
        : saveStatus === "dirty"
          ? "未保存"
          : lastSavedAt
            ? `已保存 ${formatSavedAt(lastSavedAt)}`
            : "已保存";

  async function handleGenerateMainResumeJson() {
    if (!isResumeMarkdown) return;
    if (!hasConfiguredModel(llmConfig)) {
      setResumeActionMessage({
        type: "error",
        stage: "prefill_failed",
        text: trialStatus?.blockedReason
          ? `平台试用当前不可用：${trialStatus.blockedReason}。请在 AI 配置页填写你自己的 API。`
          : "请先在 /AI配置/模型配置.json 中完成模型配置，或使用平台试用额度。",
      });
      await openFilePath("/AI配置/模型配置.json");
      return;
    }

    setResumeActionRunning(true);
    setResumeActionMessage(null);
    setResumeRunStatus(getResumeJsonRunStatus("preparing", "markdown"));

    try {
      if (valueRef.current !== fileVersionRef.current) {
        await persist(true);
      }

      const result = await generateMainResumeFromMarkdown({
        llmConfig,
        confirmOverwriteMainResume: (message) => window.confirm(message),
        onStageChange: setResumeRunStatus,
        runSource: "markdown",
      });

      if (result.canceled) return;

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
        setResumeActionMessage(result.message);
      }
      await openFilePath(path);
    } catch (error) {
      setResumeActionMessage({
        type: "error",
        stage: "prefill_failed",
        text: `从个人简历.md 生成主简历失败：${error instanceof Error ? error.message : "请稍后重试"}`,
      });
      await openFilePath(RESUME_MAIN_JSON_PATH);
    } finally {
      setResumeActionRunning(false);
      setResumeRunStatus(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-transparent px-4 py-4">
      <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/60 bg-gradient-to-r from-sky-50/70 via-white/40 to-white/70 px-4 py-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="glass-soft flex h-10 w-10 items-center justify-center rounded-2xl text-sky-600">
              {isEditMode ? <PencilLine size={17} /> : <FileText size={17} />}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Markdown</div>
              <div className="mt-1 font-medium text-zinc-700">{isEditMode ? `编辑模式 · ${statusText}` : "阅读模式"}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isResumeMarkdown ? (
              <button
                type="button"
                className="curator-button-primary curator-button-sm"
                disabled={resumeActionRunning}
                onClick={() => void handleGenerateMainResumeJson()}
              >
                {resumeActionRunning ? "处理中..." : "生成主简历 JSON"}
              </button>
            ) : null}
            <button
              type="button"
              className="curator-button-functional curator-button-sm"
              onClick={() => {
                const next = !isEditMode;
                setIsEditMode(next);
                window.localStorage.setItem(MARKDOWN_EDIT_MODE_KEY, String(next));
              }}
            >
              {isEditMode ? "返回阅读模式" : "切换到编辑模式"}
            </button>
          </div>
        </div>

        {resumeActionRunning && resumeRunStatus ? (
          <div className="border-b border-white/60 bg-sky-50/70 px-4 py-4 text-xs text-zinc-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-zinc-900">{resumeRunStatus.title}</p>
                <p className="mt-1 text-zinc-500">{resumeRunStatus.description}</p>
              </div>
              <ProgressDots current={resumeRunStatus.progress} />
            </div>
          </div>
        ) : null}

        {resumeActionMessage ? (
          <div
            className={`border-b border-white/60 px-4 py-3 text-xs ${
              resumeActionMessage.type === "success"
                ? "bg-emerald-50/80 text-emerald-600"
                : resumeActionMessage.type === "warning"
                  ? "bg-amber-50/80 text-amber-700"
                  : "bg-rose-50/80 text-rose-600"
            }`}
          >
            {resumeActionMessage.text}
          </div>
        ) : null}

        {isEditMode ? (
          <div className="min-h-0 flex-1 px-4 py-4">
            <textarea
              className="h-full w-full resize-none rounded-[24px] border border-white/70 bg-white/80 px-4 py-4 font-mono text-xs leading-6 text-zinc-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        ) : (
          <div className="soft-scrollbar min-h-0 flex-1 overflow-auto px-4 py-4">
            <div className="glass-soft overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/60 px-4 py-3 text-xs text-zinc-500">
                <Sparkles size={14} className="text-amber-500" />
                <span>阅读优先展示，必要时再切换到源码编辑。</span>
              </div>
              <div className="prose max-w-none px-5 py-5 prose-zinc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
