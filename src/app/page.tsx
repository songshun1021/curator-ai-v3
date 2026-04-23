"use client";

import "@/lib/randomuuid-polyfill";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { EditorArea } from "@/components/editor/EditorArea";
import { FileTree } from "@/components/file-tree/FileTree";
import { OnboardingFlow } from "@/components/home/OnboardingFlow";
import { JobBoard } from "@/components/job/JobBoard";
import { initWorkspace } from "@/lib/init-workspace";
import { hasCompletedOnboarding, markOnboardingCompleted, ONBOARDING_OPEN_EVENT } from "@/lib/onboarding";
import { useAppStore } from "@/store/app-store";

export default function Home() {
  const reloadTree = useAppStore((state) => state.reloadTree);
  const loadThreads = useAppStore((state) => state.loadThreads);
  const loadTrialStatus = useAppStore((state) => state.loadTrialStatus);

  const [workspaceBooted, setWorkspaceBooted] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);

  useEffect(() => {
    const run = async () => {
      await initWorkspace();
      await reloadTree();
      await loadThreads();
      await loadTrialStatus();
      setWorkspaceBooted(true);
    };

    void run();
  }, [loadThreads, loadTrialStatus, reloadTree]);

  useEffect(() => {
    if (!workspaceBooted) return;
    setHasOnboarded(hasCompletedOnboarding());
    setOnboardingReady(true);

    const onOpenOnboarding = () => {
      setHasOnboarded(false);
      setShowWorkspace(false);
      setOnboardingReady(true);
    };

    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpenOnboarding);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpenOnboarding);
  }, [workspaceBooted]);

  if (!workspaceBooted || !onboardingReady) {
    return (
      <main className="relative h-screen w-screen overflow-hidden bg-[#f5f5f2] px-3 py-3 text-zinc-900">
        <div className="glass-panel flex h-full items-center justify-center border-white/60 bg-white/70">
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <Sparkles size={16} className="text-sky-500" />
            正在准备工作区...
          </div>
        </div>
      </main>
    );
  }

  if (!hasOnboarded && !showWorkspace) {
    return (
      <main className="relative min-h-screen w-screen overflow-hidden bg-[#f5f5f2] px-3 py-3 text-zinc-900">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/55 via-white/18 to-transparent" />
        </div>
        <div className="relative h-full min-h-[calc(100vh-24px)]">
          <OnboardingFlow
            onComplete={() => {
              markOnboardingCompleted();
              setHasOnboarded(true);
              setShowWorkspace(true);
            }}
            onSkip={() => {
              markOnboardingCompleted();
              setHasOnboarded(true);
              setShowWorkspace(true);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f5f5f2] px-3 py-3 text-zinc-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/55 via-white/18 to-transparent" />
      </div>

      <div className="relative flex h-full gap-3">
        <aside
          className={`relative shrink-0 overflow-visible transition-[width,opacity,transform] duration-300 ease-[var(--ease-glass)] ${
            leftRailCollapsed
              ? "w-0 min-w-0"
              : "glass-panel flex w-[224px] min-w-[224px] flex-col overflow-hidden border-white/60 bg-white/70 opacity-100"
          }`}
        >
          {!leftRailCollapsed ? (
            <>
              <div className="border-b border-white/55 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Workspace</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-800">Curator AI</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="glass-soft flex h-10 w-10 items-center justify-center rounded-2xl border-white/60 bg-white/70 text-zinc-700">
                      <Sparkles size={15} />
                    </div>
                    <button
                      type="button"
                      aria-label="收起左侧导航"
                      className="curator-rail-toggle"
                      onClick={() => setLeftRailCollapsed(true)}
                    >
                      <ChevronLeft size={18} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="soft-scrollbar min-h-0 flex-1 overflow-hidden px-2 py-2">
                <FileTree />
              </div>
            </>
          ) : (
            <button
              type="button"
              aria-label="展开左侧导航"
              className="curator-rail-toggle curator-rail-toggle-float-left absolute left-0 top-1/2 z-30 -translate-y-1/2"
              onClick={() => setLeftRailCollapsed(false)}
            >
              <ChevronRight size={18} strokeWidth={1.8} />
            </button>
          )}
        </aside>

        <section className="glass-panel min-w-0 flex-1 overflow-hidden border-white/60 bg-white/70">
          <EditorArea />
        </section>

        <aside
          className={`relative shrink-0 overflow-visible transition-[width,opacity,transform] duration-300 ease-[var(--ease-glass)] ${
            rightRailCollapsed
              ? "w-0 min-w-0"
              : "flex w-[392px] min-w-[392px] flex-col opacity-100"
          }`}
        >
          {!rightRailCollapsed ? (
            <>
              <button
                type="button"
                aria-label="收起右侧面板"
                className="curator-rail-toggle absolute right-3 top-3 z-30"
                onClick={() => setRightRailCollapsed(true)}
              >
                <ChevronRight size={18} strokeWidth={1.8} />
              </button>

              <section className="glass-panel min-h-0 flex-1 overflow-hidden border-white/60 bg-white/70">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b border-white/55 px-4 py-3 pr-16">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Next Up</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-800">下一步行动建议</div>
                  </div>

                  <div className="min-h-0 flex-1">
                    <JobBoard />
                  </div>
                </div>
              </section>
            </>
          ) : (
            <button
              type="button"
              aria-label="展开右侧面板"
              className="curator-rail-toggle curator-rail-toggle-float-right absolute right-0 top-1/2 z-30 -translate-y-1/2"
              onClick={() => setRightRailCollapsed(false)}
            >
              <ChevronLeft size={18} strokeWidth={1.8} />
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
