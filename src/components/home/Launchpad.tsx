"use client";

import { ArrowRight, BriefcaseBusiness, Check, FileText, Sparkles } from "lucide-react";
import { JOB_CREATE_FORM_PATH, MODEL_CONFIG_PATH, WorkspaceReadiness } from "@/lib/workspace-readiness";
import { RESUME_MAIN_JSON_PATH } from "@/lib/resume-import";

type LaunchpadProps = {
  readiness: WorkspaceReadiness;
  onOpenFile: (path: string) => Promise<void>;
  onEnterWorkspace: () => void;
};

type StepState = "done" | "active" | "pending";

type LaunchStep = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
  icon: typeof FileText;
  actionLabel: string;
  action: () => Promise<void>;
};

function stateOf(done: boolean, active?: boolean): StepState {
  if (done) return "done";
  if (active) return "active";
  return "pending";
}

function StatusChip({ state }: { state: StepState }) {
  const variants: Record<StepState, string> = {
    done: "border border-[rgba(52,199,89,0.22)] bg-[rgba(52,199,89,0.12)] text-[#34C759]",
    active: "border border-[rgba(0,122,255,0.22)] bg-primary-tint text-primary",
    pending: "border border-[var(--line-hair)] bg-[var(--line-hair)] text-text-muted",
  };
  const label = state === "done" ? "已完成" : state === "active" ? "当前先做" : "后续继续";

  return (
    <span className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-medium ${variants[state]}`}>
      {state === "done" ? <Check size={11} strokeWidth={2.5} /> : null}
      {label}
    </span>
  );
}

export function Launchpad({ readiness, onOpenFile, onEnterWorkspace }: LaunchpadProps) {
  const steps: LaunchStep[] = [
    {
      id: "resume",
      title: "个人简历导入",
      description: "上传 PDF，整理主简历。",
      done: readiness.hasResumeSource,
      active: !readiness.hasResumeSource,
      icon: FileText,
      actionLabel: readiness.hasResumeSource ? "继续检查主简历" : "上传 PDF 简历",
      action: async () => onOpenFile(RESUME_MAIN_JSON_PATH),
    },
    {
      id: "job",
      title: "岗位 JD 输入",
      description: "创建岗位，粘贴目标 JD。",
      done: readiness.hasJobWithJd,
      active: readiness.hasMainResume && !readiness.hasJobWithJd,
      icon: BriefcaseBusiness,
      actionLabel: readiness.hasJobWithJd ? "查看最近岗位" : readiness.hasAnyJob ? "继续填写 JD" : "创建岗位并填 JD",
      action: async () =>
        onOpenFile(readiness.latestJobPath ? `${readiness.latestJobPath}/jd.md` : JOB_CREATE_FORM_PATH),
    },
  ];

  const nextStep = !readiness.hasResumeSource
    ? steps[0]
    : !readiness.hasMainResume
      ? {
          id: "resume-check",
          title: "检查主简历",
          description: "确认信息完整，再继续后面的生成。",
          done: false,
          active: true,
          icon: FileText,
          actionLabel: "检查主简历",
          action: async () => onOpenFile(RESUME_MAIN_JSON_PATH),
        }
      : !readiness.hasJobWithJd
        ? steps[1]
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="glass-panel w-full max-w-4xl overflow-hidden p-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-[11px] uppercase tracking-[0.28em] text-text-subtle">Start Here</div>
          <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-text-title">先导入简历和岗位 JD</h1>
          <p className="mt-3 text-sm leading-7 text-text-muted">先补齐这两项，后续生成才更准。</p>

          {!readiness.hasAvailableLlm ? (
            <div className="mt-4 text-xs leading-6 text-text-muted">
              没配模型也能先整理简历和 JD，也可以
              <button
                type="button"
                className="curator-button-ghost ml-1 h-auto px-1 py-0 text-xs text-primary"
                onClick={() => void onOpenFile(MODEL_CONFIG_PATH)}
              >
                去配置模型
              </button>
              。
            </div>
          ) : null}
        </div>

        {nextStep ? (
          <div className="glass-soft mt-8 flex flex-col gap-4 border-white/65 bg-white/74 px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">当前先做</div>
              <div className="mt-2 text-base font-semibold text-zinc-800">{nextStep.title}</div>
              <p className="mt-1 text-sm leading-6 text-zinc-500">{nextStep.description}</p>
            </div>

            <button type="button" className="curator-button-primary shrink-0" onClick={() => void nextStep.action()}>
              {nextStep.actionLabel}
              <ArrowRight size={14} strokeWidth={2} />
            </button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            const state = stateOf(step.done, step.active);

            return (
              <article
                key={step.id}
                className="glass-soft flex h-full flex-col gap-4 border-white/65 bg-white/76 px-5 py-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-card ${
                      state === "active" ? "bg-primary-tint text-primary" : "bg-[rgba(15,23,42,0.04)] text-zinc-600"
                    }`}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                  </div>
                  <StatusChip state={state} />
                </div>

                <div className="flex-1">
                  <h2 className="text-base font-semibold text-text-title">{step.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-text-muted">{step.description}</p>
                </div>

                <button
                  type="button"
                  className={state === "active" ? "curator-button-functional curator-button-sm self-start" : "curator-button-ghost h-auto px-0 py-0 text-sm text-zinc-600"}
                  onClick={() => void step.action()}
                >
                  {step.actionLabel}
                  <ArrowRight size={14} strokeWidth={2} />
                </button>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-end gap-4 border-t border-line-hair pt-5">
          <div>
            <div className="text-xs leading-5 text-text-muted">也可以直接进入工作台。</div>
          </div>

          <button type="button" className="curator-button-ghost shrink-0" onClick={onEnterWorkspace}>
            进入工作台
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
