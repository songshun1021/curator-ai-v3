"use client";

import { useEffect } from "react";
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
    <main className="flex h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="w-[240px] border-r border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-10 border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">Curator AI</div>
        <div className="h-[calc(100%-40px)]">
          <FileTree />
        </div>
      </aside>

      <section className="min-w-0 flex-1 border-r border-zinc-200 dark:border-zinc-800">
        <EditorArea />
      </section>

      <aside className="w-[420px] border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-full min-h-0 flex-col">
          <section className="min-h-0 flex-1 border-b border-zinc-200 dark:border-zinc-800">
            <JobBoard />
          </section>
          <section className="min-h-0 flex-1">
            <div className="h-10 border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">AI 助手</div>
            <div className="h-[calc(100%-40px)]">
              <ChatPanel />
            </div>
          </section>
        </div>
      </aside>
    </main>
  );
}
