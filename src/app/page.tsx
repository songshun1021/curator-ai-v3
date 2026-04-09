"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EditorArea } from "@/components/editor/EditorArea";
import { FileTree } from "@/components/file-tree/FileTree";
import { initWorkspace } from "@/lib/init-workspace";
import { useAppStore } from "@/store/app-store";

const ONBOARDING_KEY = "curator-onboarding-completed";

function OnboardingModal({ onClose }: { onClose: (neverShowAgain: boolean) => void }) {
  const [neverShowAgain, setNeverShowAgain] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-xl border bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">欢迎使用 Curator AI</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">新手建议先完成下面 3 步，能最快进入可用状态。</p>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>先到「AI配置 / 模型配置.json」填写 `API Key`、`Base URL`、`模型名` 并验证连接。</li>
          <li>点击左侧「+ 新建岗位」，填写公司、职位、JD 文本并保存。</li>
          <li>进入岗位目录后生成「定制简历」和「面试准备包」，再按需要生成复盘报告。</li>
        </ol>

        <label className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-500">
          <input type="checkbox" checked={neverShowAgain} onChange={(e) => setNeverShowAgain(e.target.checked)} />
          下次不再自动显示
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => onClose(false)}>
            稍后再看
          </button>
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => onClose(neverShowAgain)}>
            开始使用
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const reloadTree = useAppStore((s) => s.reloadTree);
  const loadThreads = useAppStore((s) => s.loadThreads);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const run = async () => {
      await initWorkspace();
      await reloadTree();
      await loadThreads();
      setCurrentFilePath("/AI配置/模型配置.json");

      const completed = window.localStorage.getItem(ONBOARDING_KEY) === "true";
      if (!completed) {
        setShowOnboarding(true);
      }
    };
    void run();

    const openOnboarding = () => setShowOnboarding(true);
    window.addEventListener("curator:open-onboarding", openOnboarding);
    return () => window.removeEventListener("curator:open-onboarding", openOnboarding);
  }, [loadThreads, reloadTree, setCurrentFilePath]);

  return (
    <>
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

        <aside className="w-[380px] bg-zinc-50 dark:bg-zinc-950">
          <div className="h-10 border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">AI 助手</div>
          <div className="h-[calc(100%-40px)]">
            <ChatPanel />
          </div>
        </aside>
      </main>

      {showOnboarding ? (
        <OnboardingModal
          onClose={(neverShowAgain) => {
            if (neverShowAgain) {
              window.localStorage.setItem(ONBOARDING_KEY, "true");
            }
            setShowOnboarding(false);
          }}
        />
      ) : null}
    </>
  );
}
