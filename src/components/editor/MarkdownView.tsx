"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readFile, updateFile } from "@/lib/file-system";
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

export function MarkdownView({ path }: { path: string }) {
  const [value, setValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isEditMode, setIsEditMode] = useState(getInitialEditMode);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef("");
  const fileVersionRef = useRef("");

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
        fileVersionRef.current = nextValue;
        setSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
        await useAppStore.getState().reloadTree();
      } catch {
        setSaveStatus("error");
      }
    },
    [path],
  );

  useEffect(() => {
    setHydrated(false);
    setSaveStatus("idle");
    setLastSavedAt(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    readFile(path).then((f) => {
      const content = f?.content ?? "";
      setValue(content);
      valueRef.current = content;
      fileVersionRef.current = content;
      setHydrated(true);
    });
  }, [path]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-zinc-500">
        <span>Markdown 渲染视图 · {isEditMode ? statusText : "只读预览"}</span>
        <button
          type="button"
          className="rounded border px-2 py-0.5"
          onClick={() => {
            const next = !isEditMode;
            setIsEditMode(next);
            window.localStorage.setItem(MARKDOWN_EDIT_MODE_KEY, String(next));
          }}
        >
          {isEditMode ? "返回预览" : "编辑源码"}
        </button>
      </div>

      {isEditMode ? (
        <div className="min-h-0 flex-1 p-3">
          <textarea
            className="h-full w-full resize-none rounded-md border p-3 font-mono text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4 prose prose-zinc max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
