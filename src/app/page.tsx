"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EditorArea } from "@/components/editor/EditorArea";
import { FileTree } from "@/components/file-tree/FileTree";
import { JobBoard } from "@/components/job/JobBoard";
import { initWorkspace } from "@/lib/init-workspace";
import { useAppStore } from "@/store/app-store";

export default function Home() {
  const reloadTree = useAppStore((s) => s.reloadTree);
  const loadThreads = useAppStore((s) => s.loadThreads);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);

  useEffect(() => {
    const run = async () => {
      await initWorkspace();
      await reloadTree();
      await loadThreads();
      setCurrentFilePath("/AI配置/模型配置.json");
    };
    void run();
  }, [loadThreads, reloadTree, setCurrentFilePath]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f5f5f2] px-3 py-3 text-zinc-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/55 via-white/18 to-transparent" />
      </div>

      <div className="relative flex h-full gap-3">
        <aside className="glass-panel flex w-[252px] min-w-[252px] flex-col overflow-hidden border-white/60 bg-white/70">
          <div className="border-b border-white/55 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Workspace</div>
                <div className="mt-1 text-sm font-semibold text-zinc-800">Curator AI</div>
              </div>
              <div className="glass-soft flex h-10 w-10 items-center justify-center rounded-2xl border-white/60 bg-white/70 text-zinc-700">
                <Sparkles size={15} />
              </div>
            </div>
          </div>

          <div className="soft-scrollbar min-h-0 flex-1 overflow-hidden px-2 py-2">
            <FileTree />
          </div>
        </aside>

        <section className="glass-panel min-w-0 flex-1 overflow-hidden border-white/60 bg-white/70">
          <EditorArea />
        </section>

        <aside className="flex w-[430px] min-w-[430px] flex-col gap-3">
          <section className="glass-panel min-h-0 flex-1 overflow-hidden border-white/60 bg-white/70">
            <JobBoard />
          </section>

          <section className="glass-panel min-h-0 flex-1 overflow-hidden border-white/60 bg-white/70">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-white/55 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Assistant</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-800">AI 助手</div>
                  </div>
                  <div className="rounded-full border border-white/70 bg-white/72 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                    运行中
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <ChatPanel />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
