"use client";

import { ArrowRight, BookOpen, Briefcase, FileText, MessageSquareQuote, Sparkles } from "lucide-react";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { generatePrepPack } from "@/lib/generation-actions";
import { pickLatestInterviewRound } from "@/lib/interview-paths";
import { readFile, upsertFile } from "@/lib/file-system";
import { useAppStore } from "@/store/app-store";

const GUIDE_FOCUS_EVENT = "curator:focus-guide";
const TOKEN_FOCUS_EVENT = "curator:focus-token-usage";
const SYSTEM_PROMPT_FOCUS_EVENT = "curator:focus-system-prompts";

export function EmptyState() {
  const currentFilePath = useAppStore((s) => s.currentFilePath);
  const setCurrentFilePath = useAppStore((s) => s.setCurrentFilePath);
  const fileCache = useAppStore((s) => s.fileCache);
  const openFilePath = useAppStore((s) => s.openFilePath);

  async function openOrCreateJobForm() {
    const formPath = "/岗位/_新建岗位.json";
    const existing = await readFile(formPath);
    if (!existing) {
      await upsertFile({
        path: formPath,
        name: "_新建岗位.json",
        parentPath: "/岗位",
        contentType: "json",
        content: JSON.stringify({ company: "", position: "", jdText: "" }, null, 2),
        isSystem: true,
      });
      await useAppStore.getState().reloadTree();
    }
    await openFilePath(formPath);
  }

  if (!currentFilePath) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden px-6 py-8">
        <div className="glass-panel relative w-full max-w-4xl overflow-hidden border-white/60 bg-white/70 px-8 py-9">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-stone-100/80 via-white/15 to-slate-100/75" />

          <div className="relative">
            <div className="flex flex-col items-center text-center">
              <div className="glass-soft flex h-16 w-16 items-center justify-center rounded-[22px] border-white/65 bg-white/72 text-zinc-700">
                <Sparkles size={24} />
              </div>
              <h2 className="mt-5 text-[28px] font-semibold tracking-tight text-zinc-800">从当前工作区继续推进</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">
                左侧管理文件，中央阅读与编辑，右侧行动板和 AI 助手会根据你当前所在位置给出下一步建议。
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setCurrentFilePath("/AI配置/模型配置.json")}
                className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-4 text-left shadow-sm transition hover:bg-white"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Step 01</div>
                <div className="mt-2 text-sm font-semibold text-zinc-800">确认模型配置</div>
                <p className="mt-2 text-xs leading-6 text-zinc-500">先检查 API 配置与连接状态，避免后续生成被中断。</p>
              </button>

              <button
                type="button"
                onClick={() => setCurrentFilePath("/简历/主简历.json")}
                className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-4 text-left shadow-sm transition hover:bg-white"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Step 02</div>
                <div className="mt-2 text-sm font-semibold text-zinc-800">完善主简历</div>
                <p className="mt-2 text-xs leading-6 text-zinc-500">补齐联系方式和关键经历，后续岗位分析会直接引用这里。</p>
              </button>

              <button
                type="button"
                onClick={() => void openOrCreateJobForm()}
                className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-4 text-left shadow-sm transition hover:bg-white"
              >
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Step 03</div>
                <div className="mt-2 text-sm font-semibold text-zinc-800">直接新建岗位</div>
                <p className="mt-2 text-xs leading-6 text-zinc-500">立即进入岗位建档表单，录入 JD 后再继续生成准备包和复盘材料。</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isFolder = !currentFilePath.includes(".");
  if (!isFolder) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">暂无可展示内容</div>;
  }

  const focusGuide = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(GUIDE_FOCUS_EVENT));
  };

  const focusTokenUsage = async () => {
    const ok = await openFilePath("/AI配置/模型配置.json");
    if (!ok || typeof window === "undefined") return;
    window.dispatchEvent(new Event(TOKEN_FOCUS_EVENT));
  };

  const focusSystemPrompts = async () => {
    const ok = await openFilePath("/AI配置/模型配置.json");
    if (!ok || typeof window === "undefined") return;
    window.dispatchEvent(new Event(SYSTEM_PROMPT_FOCUS_EVENT));
  };

  const files = Object.values(fileCache);
  const latestJob = files
    .filter((file) => file.type === "folder" && file.parentPath === "/岗位")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const latestInterview = pickLatestInterviewRound(files);
  const latestJobHasJd = latestJob ? Boolean(fileCache[`${latestJob.path}/jd.md`]?.content.trim()) : false;

  const map = {
    "/简历": {
      icon: FileText,
      tone: "from-slate-100/90 via-white/40 to-sky-50/75",
      title: "先把简历基线打稳",
      desc: "主简历是岗位匹配分析、招呼语、准备包和复盘回溯的共同基线，建议先把关键信息和经历补齐。",
      action: () => setCurrentFilePath("/简历/主简历.json"),
      button: "打开主简历",
      secondaryAction: () => setCurrentFilePath("/简历/主简历.json"),
      secondaryButton: "导入简历",
      hint: "优先补齐姓名、手机、邮箱，以及至少一段可量化的项目或实习经历。",
    },
    "/岗位": {
      icon: Briefcase,
      tone: "from-stone-100/90 via-white/35 to-stone-50/70",
      title: "把目标岗位整理成清晰行动入口",
      desc: "录入 JD 后，匹配分析、BOSS 招呼语、求职邮件和准备包都会围绕这个岗位继续生成。",
      action: () => void openOrCreateJobForm(),
      button: "新建岗位",
      secondaryAction: () => setCurrentFilePath("/简历/主简历.json"),
      secondaryButton: "导入简历",
      tertiaryAction: focusGuide,
      tertiaryButton: "查看引导",
      hint: "岗位入口保持不变，仍从现有的“新建岗位”流程进入。",
    },
    "/面试准备包": {
      icon: BookOpen,
      tone: "from-stone-100/90 via-white/35 to-slate-50/75",
      title: "准备包会在这里持续累积",
      desc: "在岗位目录点击“生成面试准备包”后，这里会出现高频题、追问预测、知识清单和行动建议。",
      action: () => setCurrentFilePath("/岗位"),
      button: "回到岗位目录",
      secondaryAction: latestJob ? () => void openFilePath(`${latestJob.path}/jd.md`) : undefined,
      secondaryButton: latestJob ? "打开最近岗位" : undefined,
      tertiaryAction: latestJob && latestJobHasJd ? () => void generatePrepPack(latestJob.path) : undefined,
      tertiaryButton: latestJob && latestJobHasJd ? "生成准备包" : undefined,
      hint: "准备包不单独创建，继续从岗位目录发起即可。",
    },
    "/面试复盘": {
      icon: MessageSquareQuote,
      tone: "from-stone-100/90 via-white/35 to-slate-50/70",
      title: "把每次面试沉淀成下次准备的依据",
      desc: "录入面试原文并生成复盘报告后，关键行动项会继续反哺后续准备包和追问训练。",
      action: latestJob ? () => void createInterviewRecord(latestJob.path, "一面") : focusGuide,
      button: latestJob ? "新建面试记录" : "查看复盘引导",
      secondaryAction: latestInterview ? () => void openFilePath(`${latestInterview.path}/面试原文.md`) : undefined,
      secondaryButton: latestInterview ? "打开最近复盘" : undefined,
      hint: "复盘入口保持不变，仍沿用现有的“新建面试记录”流程。",
    },
    "/AI配置": {
      icon: Sparkles,
      tone: "from-slate-100/90 via-white/35 to-stone-50/70",
      title: "把模型、Token 与系统提示词放在一个控制面板里",
      desc: "这里集中管理模型配置、Token 使用概览、系统 Prompt/Agent 和新手引导入口。",
      action: () => setCurrentFilePath("/AI配置/模型配置.json"),
      button: "打开模型配置",
      secondaryAction: focusTokenUsage,
      secondaryButton: "查看 Token 概览",
      tertiaryAction: focusSystemPrompts,
      tertiaryButton: "编辑系统提示词",
      hint: "先检查模型是否可用，再看 Token 使用与系统提示词。",
    },
  } as const;

  const item = (map as Record<string, (typeof map)[keyof typeof map]>)[currentFilePath];
  if (!item) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">请选择文件</div>;
  }

  const Icon = item.icon;

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-6 py-8">
      <div className="glass-panel relative w-full max-w-4xl overflow-hidden border-white/60 bg-white/70">
        <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-r ${item.tone}`} />

        <div className="relative grid gap-6 px-8 py-8 md:grid-cols-[104px_minmax(0,1fr)] md:items-center">
          <div className="flex justify-center md:justify-start">
            <div className="glass-soft flex h-24 w-24 items-center justify-center rounded-[28px] border-white/65 bg-white/74 text-zinc-700">
              <Icon size={36} strokeWidth={1.65} />
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Section Guide</div>
            <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-zinc-800">{item.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">{item.desc}</p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={item.action}
                className="curator-button-functional gap-2"
              >
                {item.button}
                <ArrowRight size={14} />
              </button>

              {"secondaryAction" in item && item.secondaryAction && item.secondaryButton ? (
                <button
                  type="button"
                  onClick={item.secondaryAction}
                  className="curator-button-secondary gap-2"
                >
                  {item.secondaryButton}
                </button>
              ) : null}

              {"tertiaryAction" in item && item.tertiaryAction && item.tertiaryButton ? (
                <button
                  type="button"
                  onClick={item.tertiaryAction}
                  className="curator-button-secondary gap-2"
                >
                  {item.tertiaryButton}
                </button>
              ) : null}

              <span className="rounded-full border border-white/70 bg-white/70 px-3 py-2 text-xs leading-5 text-zinc-500">
                {item.hint}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
