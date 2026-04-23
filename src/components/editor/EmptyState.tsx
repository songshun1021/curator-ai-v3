"use client";

import { BookOpen, Briefcase, FileText, MessageSquareQuote, Settings2, Sparkles } from "lucide-react";
import { generateInterviewReview, generatePrepPack } from "@/lib/generation-actions";
import { readFile, upsertFile } from "@/lib/file-system";
import {
  getWorkspaceGuideState,
  getWorkspaceGuideSteps,
  JOB_CREATE_FORM_PATH,
  JOB_ROOT,
  PREP_ROOT,
  REVIEW_ROOT,
  hasMeaningfulJd,
} from "@/lib/workspace-readiness";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";

const TOKEN_FOCUS_EVENT = "curator:focus-token-usage";
const SYSTEM_PROMPT_FOCUS_EVENT = "curator:focus-system-prompts";

const RESUME_ROOT = "/简历";
const CONFIG_ROOT = "/AI配置";
const MAIN_RESUME_PATH = `${RESUME_ROOT}/主简历.json`;

type GuideAction = {
  label: string;
  tone?: "functional" | "ghost";
  action: () => Promise<void> | void;
};

type EmptyCardConfig = {
  icon: typeof FileText;
  eyebrow: string;
  title: string;
  description: string;
  note?: string;
  primary: GuideAction;
  secondary?: GuideAction;
  tertiary?: GuideAction;
};

async function openOrCreateJobForm() {
  const formPath = JOB_CREATE_FORM_PATH;
  const existing = await readFile(formPath);
  if (!existing) {
    await upsertFile({
      path: formPath,
      name: "_新建岗位.json",
      parentPath: JOB_ROOT,
      contentType: "json",
      content: JSON.stringify({ company: "", position: "", jdText: "" }, null, 2),
      isSystem: true,
    });
    await useAppStore.getState().reloadTree();
  }

  await useAppStore.getState().openFilePath(formPath);
}

function EmptyCard({ config }: { config: EmptyCardConfig }) {
  const Icon = config.icon;

  return (
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="glass-soft w-full max-w-2xl border-white/70 bg-white/78 px-6 py-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-[rgba(15,23,42,0.04)] text-zinc-700">
            <Icon size={24} strokeWidth={1.75} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-[0.26em] text-zinc-400">{config.eyebrow}</div>
            <h2 className="mt-2 text-[22px] font-semibold tracking-tight text-zinc-900">{config.title}</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-500">{config.description}</p>

            {config.note ? (
              <p className="mt-3 border-t border-[var(--line-hair)] pt-3 text-xs leading-6 text-zinc-400">{config.note}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void config.primary.action()} className="curator-button-primary curator-button-sm">
                {config.primary.label}
              </button>

              {config.secondary ? (
                <button
                  type="button"
                  onClick={() => void config.secondary?.action()}
                  className={config.secondary.tone === "ghost" ? "curator-button-ghost curator-button-sm" : "curator-button-functional curator-button-sm"}
                >
                  {config.secondary.label}
                </button>
              ) : null}

              {config.tertiary ? (
                <button
                  type="button"
                  onClick={() => void config.tertiary?.action()}
                  className={config.tertiary.tone === "functional" ? "curator-button-functional curator-button-sm" : "curator-button-ghost curator-button-sm"}
                >
                  {config.tertiary.label}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyState() {
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const setCurrentFilePath = useAppStore((state) => state.setCurrentFilePath);
  const fileCache = useAppStore((state) => state.fileCache);
  const openFilePath = useAppStore((state) => state.openFilePath);

  async function openResumeBootstrap() {
    const candidates = [`${RESUME_ROOT}/个人简历.pdf`, `${RESUME_ROOT}/个人简历.md`, MAIN_RESUME_PATH];
    for (const path of candidates) {
      if (await openFilePath(path)) return;
    }

    await openFilePath(MAIN_RESUME_PATH);
  }

  const guideState = getWorkspaceGuideState(fileCache);
  const sharedGuideSteps = getWorkspaceGuideSteps(guideState);
  const pendingGuideSteps = sharedGuideSteps.filter((step) => !step.done);
  const leadGuideStep = pendingGuideSteps[0] ?? sharedGuideSteps[sharedGuideSteps.length - 1];
  const latestJobPath = guideState.latestJobPath;
  const latestJobHasJd = latestJobPath ? hasMeaningfulJd(fileCache[`${latestJobPath}/jd.md`]?.content) : false;

  async function handleLeadStep() {
    if (!leadGuideStep) return;

    if (leadGuideStep.id === "resume") {
      await openResumeBootstrap();
      return;
    }

    if (leadGuideStep.id === "job") {
      await openOrCreateJobForm();
      return;
    }

    if (leadGuideStep.id === "prep") {
      if (!latestJobPath) {
        await openOrCreateJobForm();
        return;
      }

      if (!latestJobHasJd) {
        await openFilePath(`${latestJobPath}/jd.md`);
        return;
      }

      await generatePrepPack(latestJobPath);
      return;
    }

    if (!guideState.latestInterviewPath) {
      if (!latestJobPath) {
        await openOrCreateJobForm();
        return;
      }

      await createInterviewRecord(latestJobPath, "一面");
      return;
    }

    await generateInterviewReview(guideState.latestInterviewPath);
  }

  if (!currentFilePath) {
    return (
      <EmptyCard
        config={{
          icon: Sparkles,
          eyebrow: "Workspace",
          title: "先从左侧选一个入口",
          description: leadGuideStep
            ? `现在最值得先做的是：${leadGuideStep.title}。`
            : "这里保持轻量空态，直接打开当前入口即可。",
          note: "中间区只负责当前文件，不重复右侧引导。",
          primary: {
            label: leadGuideStep?.actionLabel ?? "打开主简历",
            action: handleLeadStep,
          },
          secondary: {
            label: "打开主简历",
            tone: "functional",
            action: () => void openFilePath(MAIN_RESUME_PATH),
          },
          tertiary: {
            label: "新建岗位",
            tone: "ghost",
            action: openOrCreateJobForm,
          },
        }}
      />
    );
  }

  const isFolder = !currentFilePath.includes(".");
  if (!isFolder) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="glass-soft border-white/70 bg-white/78 px-5 py-4 text-sm text-zinc-500">
          当前还没有打开文件。请从左侧文件树选择一个文件或目录入口。
        </div>
      </div>
    );
  }

  const guideMap: Record<string, EmptyCardConfig> = {
    [RESUME_ROOT]: {
      icon: FileText,
      eyebrow: "Resume",
      title: "先把主简历基线整理清楚",
      description: "先让简历进入可用状态。",
      note: "这里保留当前模块的直接入口。",
      primary: { label: "上传 PDF 简历", action: openResumeBootstrap },
      secondary: { label: "打开主简历", tone: "functional", action: () => void openFilePath(MAIN_RESUME_PATH) },
      tertiary: { label: "从零开始填写", tone: "ghost", action: () => void openFilePath(MAIN_RESUME_PATH) },
    },
    [JOB_ROOT]: {
      icon: Briefcase,
      eyebrow: "Job",
      title: "先创建岗位并录入 JD",
      description: "先补齐目标岗位的 JD。",
      note: "如果最近岗位已经存在，可以直接回到它的 JD 文件继续补齐。",
      primary: { label: "新建岗位", action: openOrCreateJobForm },
      secondary: {
        label: latestJobPath ? "查看最近岗位" : "打开主简历",
        tone: "functional",
        action: latestJobPath ? () => void openFilePath(`${latestJobPath}/jd.md`) : () => void openFilePath(MAIN_RESUME_PATH),
      },
      tertiary: { label: "查看准备包入口", tone: "ghost", action: () => setCurrentFilePath(PREP_ROOT) },
    },
    [PREP_ROOT]: {
      icon: BookOpen,
      eyebrow: "Prep",
      title: "准备包会在这里持续沉淀",
      description: "先从岗位目录生成准备包。",
      note: "准备包会沉淀题单和行动清单。",
      primary: {
        label: guideState.latestPrepPackPath ? "打开最近准备包" : latestJobPath && latestJobHasJd ? "生成准备包" : "先补 JD",
        action: async () => {
          if (guideState.latestPrepPackPath) {
            await openFilePath(guideState.latestPrepPackPath);
            return;
          }

          if (!latestJobPath) {
            setCurrentFilePath(JOB_ROOT);
            return;
          }

          if (!latestJobHasJd) {
            await openFilePath(`${latestJobPath}/jd.md`);
            return;
          }

          await generatePrepPack(latestJobPath);
        },
      },
      secondary: {
        label: latestJobPath ? "查看最近岗位" : "回到岗位目录",
        tone: "functional",
        action: latestJobPath ? () => void openFilePath(`${latestJobPath}/jd.md`) : () => setCurrentFilePath(JOB_ROOT),
      },
      tertiary: { label: "去复盘入口", tone: "ghost", action: () => setCurrentFilePath(REVIEW_ROOT) },
    },
    [REVIEW_ROOT]: {
      icon: MessageSquareQuote,
      eyebrow: "Review",
      title: "把面试原文沉淀成下一轮准备依据",
      description: "先处理面试原文，再生成复盘。",
      note: "复盘会反哺下一轮准备。",
      primary: {
        label: guideState.latestReviewPath ? "打开最近复盘" : guideState.latestInterviewPath ? "生成复盘" : "先新建面试记录",
        action: async () => {
          if (guideState.latestReviewPath) {
            await openFilePath(guideState.latestReviewPath);
            return;
          }

          if (guideState.latestInterviewPath) {
            const result = await generateInterviewReview(guideState.latestInterviewPath);
            if (!result.ok) return;
            return;
          }

          if (!latestJobPath) {
            setCurrentFilePath(JOB_ROOT);
            return;
          }

          await createInterviewRecord(latestJobPath, "一面");
        },
      },
      secondary: {
        label: guideState.latestInterviewPath ? "打开最近原文" : "去准备包入口",
        tone: "functional",
        action: guideState.latestInterviewPath
          ? () => void openFilePath(`${guideState.latestInterviewPath}/面试原文.md`)
          : () => setCurrentFilePath(PREP_ROOT),
      },
      tertiary: { label: "返回岗位目录", tone: "ghost", action: () => setCurrentFilePath(JOB_ROOT) },
    },
    [CONFIG_ROOT]: {
      icon: Settings2,
      eyebrow: "System",
      title: "把模型、Token 和系统提示放在同一面板里",
      description: "这里集中管理模型配置、Token 使用概览，以及系统 Prompt 和 Agent 的入口。",
      note: "如果只是想继续主链路，右侧 guide 会提示你是否真的需要回到配置。",
      primary: { label: "打开模型配置", action: () => setCurrentFilePath(`${CONFIG_ROOT}/模型配置.json`) },
      secondary: {
        label: "查看 Token 概览",
        tone: "functional",
        action: async () => {
          const ok = await openFilePath(`${CONFIG_ROOT}/模型配置.json`);
          if (ok && typeof window !== "undefined") {
            window.dispatchEvent(new Event(TOKEN_FOCUS_EVENT));
          }
        },
      },
      tertiary: {
        label: "编辑系统提示词",
        tone: "ghost",
        action: async () => {
          const ok = await openFilePath(`${CONFIG_ROOT}/模型配置.json`);
          if (ok && typeof window !== "undefined") {
            window.dispatchEvent(new Event(SYSTEM_PROMPT_FOCUS_EVENT));
          }
        },
      },
    },
  };

  const card = guideMap[currentFilePath];
  if (!card) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="glass-soft border-white/70 bg-white/78 px-5 py-4 text-sm text-zinc-500">
          当前目录还没有单独的空态入口，可以先从左侧文件树继续选择具体文件。
        </div>
      </div>
    );
  }

  return <EmptyCard config={card} />;
}
