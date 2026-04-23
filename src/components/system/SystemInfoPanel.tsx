"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, FileText, FolderTree, Sparkles } from "lucide-react";
import { getResumeSourceReceipt } from "@/lib/context-builder";
import { getWorkspaceGuideState } from "@/lib/workspace-readiness";
import { useAppStore } from "@/store/app-store";

function getJobFolderPath(path: string | null) {
  if (!path) return undefined;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "岗位" || parts.length < 2) return undefined;
  return `/${parts[0]}/${parts[1]}`;
}

function getModelStatusLabel(trialEnabled: boolean, provider: string, model: string) {
  if (trialEnabled) return "平台试用可用";
  if (provider && model) return `${provider} · ${model}`;
  if (provider) return provider;
  return "尚未配置";
}

export function SystemInfoPanel({ compact = false }: { compact?: boolean }) {
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const fileCache = useAppStore((state) => state.fileCache);
  const llmConfig = useAppStore((state) => state.llmConfig);
  const trialStatus = useAppStore((state) => state.trialStatus);
  const generationNotice = useAppStore((state) => state.generationNotice);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generatingType = useAppStore((state) => state.generatingType);

  const [resumeSourceLabel, setResumeSourceLabel] = useState("正在识别...");

  const guideState = useMemo(() => getWorkspaceGuideState(fileCache), [fileCache]);
  const jobFolderPath = useMemo(() => getJobFolderPath(currentFilePath), [currentFilePath]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const label = await getResumeSourceReceipt(jobFolderPath);
      if (!cancelled) setResumeSourceLabel(label);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentFilePath, fileCache, jobFolderPath]);

  const cards = [
    {
      key: "file",
      icon: FileText,
      label: "当前文件",
      value: currentFilePath || "未选中文件",
      hint: currentFilePath ? "系统会围绕这个入口组织状态和生成结果。" : "先从左侧选择一个文件或目录入口。",
    },
    {
      key: "resume",
      icon: FolderTree,
      label: "简历来源",
      value: resumeSourceLabel,
      hint: "定制简历和岗位链路会优先参考这里识别到的简历证据。",
    },
    {
      key: "model",
      icon: Cpu,
      label: "模型状态",
      value: getModelStatusLabel(
        Boolean(trialStatus?.trialEnabled),
        llmConfig.provider || (trialStatus?.provider ?? ""),
        llmConfig.model || (trialStatus?.model ?? ""),
      ),
      hint: trialStatus?.blockedReason
        ? `当前限制：${trialStatus.blockedReason}`
        : "这里只展示系统状态，不再在右侧重复堆助手入口。",
    },
  ];

  const shellClassName = compact
    ? "rounded-[22px] border border-[var(--line-hair)] bg-white/72"
    : "glass-soft overflow-hidden border-white/65 bg-white/74";

  return (
    <div className={compact ? "space-y-3" : "soft-scrollbar h-full overflow-auto px-4 py-4"}>
      <div className={shellClassName}>
        {!compact ? (
          <div className="border-b border-[var(--line-hair)] px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">System</div>
            <div className="mt-1 text-sm font-semibold text-zinc-800">系统信息</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              展示当前工作区状态、简历来源、模型可用性和最近生成结果，不再在右侧重复堆助手入口。
            </p>
          </div>
        ) : null}

        <div className="space-y-3 px-4 py-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="rounded-[18px] border border-[var(--line-hair)] bg-white/76 px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="glass-inline flex h-9 w-9 items-center justify-center rounded-full border-white/70 bg-white/82 text-zinc-600">
                    <Icon size={15} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{card.label}</div>
                    <div className="mt-1 break-all text-sm font-medium text-zinc-800">{card.value}</div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{card.hint}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-[18px] border border-[var(--line-hair)] bg-white/76 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="glass-inline flex h-9 w-9 items-center justify-center rounded-full border-white/70 bg-white/82 text-zinc-600">
                <Sparkles size={15} strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Workspace State</div>
                <div className="mt-1 text-sm font-medium text-zinc-800">
                  {guideState.hasMainResume ? "主简历已就绪" : "主简历待完善"} ·{" "}
                  {guideState.hasJd ? "岗位 JD 已就绪" : "岗位 JD 待补充"}
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  最近岗位：{guideState.latestJobPath ?? "暂无"}；准备包：{guideState.hasPrep ? "已有" : "暂无"}；复盘：
                  {guideState.hasReview ? "已有" : "暂无"}。
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-[var(--line-hair)] bg-white/76 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Latest Output</div>
            <div className="mt-1 text-sm font-medium text-zinc-800">
              {isGenerating ? `正在生成：${generatingType || "处理中"}` : generationNotice?.text || "当前没有新的生成结果"}
            </div>
            <p className="mt-1 break-all text-xs leading-5 text-zinc-500">
              {generationNotice?.path ?? "新的结果保存后，会在这里显示路径和状态。"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
