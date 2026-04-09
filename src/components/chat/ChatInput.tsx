"use client";

import { useMemo, useState } from "react";
import { SendHorizonal } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function ChatInput({
  onSend,
}: {
  onSend: (input: { text: string; referencedFiles: string[] }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const fileCache = useAppStore((s) => s.fileCache);

  const candidates = useMemo(() => {
    const q = query.toLowerCase();
    return Object.values(fileCache)
      .filter((f) => f.type === "file" && f.path.toLowerCase().includes(q))
      .slice(0, 10);
  }, [fileCache, query]);

  async function submit() {
    const payload = text.trim();
    if (!payload) return;
    const refs = [...referencedFiles];
    setText("");
    setReferencedFiles([]);
    setShowMentions(false);
    await onSend({ text: payload, referencedFiles: refs });
  }

  return (
    <div className="relative border-t p-2">
      {showMentions ? (
        <div className="absolute bottom-14 left-2 right-2 max-h-44 overflow-auto rounded-md border bg-white p-1 dark:bg-zinc-900">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件"
            className="mb-1 w-full rounded-md border px-2 py-1 text-xs"
          />
          {candidates.map((c) => (
            <button
              key={c.path}
              type="button"
              onClick={() => {
                setReferencedFiles((prev) => (prev.includes(c.path) ? prev : [...prev, c.path]));
                setShowMentions(false);
                setText((prev) => prev.replace(/@[^\s]*$/, "") + `@${c.name} `);
              }}
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              📄 {c.name} ({c.path})
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-1 flex flex-wrap gap-1">
        {referencedFiles.map((path) => (
          <span key={path} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            📄 {path.split("/").pop()}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const match = next.match(/@([^\s]*)$/);
            if (match) {
              setShowMentions(true);
              setQuery(match[1]);
            }
          }}
          placeholder="输入消息...（输入 @ 引用文件）"
          className="h-9 flex-1 rounded-md border px-3 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" onClick={submit} className="inline-flex h-9 w-9 items-center justify-center rounded-md border">
          <SendHorizonal size={16} />
        </button>
      </div>
    </div>
  );
}
