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
      .filter((file) => file.type === "file" && file.path.toLowerCase().includes(q))
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
    <div className="relative border-t border-white/60 px-4 py-4">
      {showMentions ? (
        <div className="glass-soft absolute bottom-[88px] left-4 right-4 z-10 max-h-52 overflow-auto p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件"
            className="curator-input-surface mb-2 h-9 w-full rounded-2xl px-3 text-xs"
          />
          {candidates.length === 0 ? <div className="px-3 py-2 text-xs text-zinc-400">没有匹配的文件</div> : null}
          {candidates.map((candidate) => (
            <button
              key={candidate.path}
              type="button"
              onClick={() => {
                setReferencedFiles((prev) => (prev.includes(candidate.path) ? prev : [...prev, candidate.path]));
                setShowMentions(false);
                setText((prev) => prev.replace(/@[^\s]*$/, "") + `@${candidate.name} `);
              }}
              className="block w-full rounded-2xl px-3 py-2 text-left text-xs text-zinc-600 transition hover:bg-white/90"
            >
              <span className="font-medium text-zinc-700">引用 {candidate.name}</span>
              <span className="ml-1 text-zinc-400">({candidate.path})</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-2">
        {referencedFiles.map((path) => (
          <span
            key={path}
            className="inline-flex items-center rounded-full border border-blue-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(236,244,255,0.82))] px-3 py-1 text-[11px] font-medium text-blue-700 shadow-[0_8px_18px_rgba(59,130,246,0.05)]"
          >
            引用 {path.split("/").pop()}
          </span>
        ))}
      </div>

      <div className="glass-soft flex items-end gap-2 rounded-[26px] p-2">
        <textarea
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const match = next.match(/@([^\s]*)$/);
            if (match) {
              setShowMentions(true);
              setQuery(match[1]);
            } else {
              setShowMentions(false);
            }
          }}
          placeholder="输入消息...（输入 @ 引用文件）"
          className="min-h-[52px] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-zinc-700 outline-none placeholder:text-zinc-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          className="curator-button-primary h-11 w-11 rounded-2xl p-0 text-[rgba(255,255,255,0.92)] disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!text.trim()}
        >
          <SendHorizonal size={17} />
        </button>
      </div>
    </div>
  );
}
