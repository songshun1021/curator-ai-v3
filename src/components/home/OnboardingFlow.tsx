"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, FileText, Upload } from "lucide-react";
import { ONBOARDING_COPY, ONBOARDING_SCREENSHOTS } from "@/components/home/onboarding-content";
import { createJobFolderWithJD } from "@/lib/workspace-actions";
import { upsertFile } from "@/lib/file-system";
import { generateResumeMarkdownFromPdf, RESUME_MAIN_JSON_PATH, RESUME_PDF_PATH } from "@/lib/resume-import";
import { pdfFileToDataUrl } from "@/lib/pdf-import";
import { useAppStore } from "@/store/app-store";

type OnboardingFlowProps = {
  onComplete: () => void;
  onSkip: () => void;
};

type StepIndex = 0 | 1 | 2 | 3;
type CommitState = {
  company: string;
  position: string;
  jdText: string;
  resumeFile: File | null;
};

type RunState = {
  running: boolean;
  completed: boolean;
  error: string;
  ticks: Array<"pending" | "active" | "done">;
};

const TOTAL_STEPS = 4;

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, index) => {
        const active = index <= step;
        return (
          <span
            key={index}
            className={`h-1.5 w-10 rounded-full transition-colors ${
              active ? "bg-primary" : "bg-[rgba(15,23,42,0.08)]"
            }`}
          />
        );
      })}
    </div>
  );
}

function StepChrome({
  step,
  onBack,
  onSkip,
  canGoBack,
}: {
  step: StepIndex;
  onBack: () => void;
  onSkip: () => void;
  canGoBack: boolean;
}) {
  return (
    <div className="glass-soft mb-6 flex items-center justify-between border-white/65 px-4 py-3">
      <div className="flex items-center gap-3">
        <ProgressBar step={step} />
        <span className="text-xs text-zinc-500">Step {step + 1} / {TOTAL_STEPS}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="curator-button-ghost curator-button-sm"
          onClick={onBack}
          disabled={!canGoBack}
        >
          <ArrowLeft size={14} />
          返回
        </button>
        <button type="button" className="curator-button-ghost curator-button-sm" onClick={onSkip}>
          跳过
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function ScreenshotPanel({
  imageSrc,
  title,
  eyebrow,
  description,
  heightClass = "h-[420px]",
}: {
  imageSrc: string;
  title: string;
  eyebrow: string;
  description: string;
  heightClass?: string;
}) {
  return (
    <div className="glass-subpanel border-white/70 p-5">
      <div className={`flex ${heightClass} items-center justify-center overflow-hidden rounded-[16px] border border-white/70 bg-white/80 p-4`}>
        <img src={imageSrc} alt={title} className="max-h-full w-full object-contain object-center" />
      </div>
      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">{eyebrow}</div>
        <div className="mt-2 text-base font-semibold text-zinc-800">{title}</div>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

function StepActions({
  primaryLabel,
  onPrimary,
  secondaryLabel = "跳过",
  onSecondary,
  primaryDisabled = false,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary: () => void;
  primaryDisabled?: boolean;
}) {
  return (
    <div className="mt-auto flex min-h-[64px] items-end justify-end gap-3 border-t border-white/70 pt-5">
      <button type="button" className="curator-button-ghost curator-button-sm" onClick={onSecondary}>
        {secondaryLabel}
      </button>
      <button
        type="button"
        className="curator-button-primary curator-button-sm min-w-[112px] justify-center"
        onClick={onPrimary}
        disabled={primaryDisabled}
      >
        {primaryLabel}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState<StepIndex>(0);
  const [commitState, setCommitState] = useState<CommitState>({
    company: "",
    position: "",
    jdText: "",
    resumeFile: null,
  });
  const [runState, setRunState] = useState<RunState>({
    running: false,
    completed: false,
    error: "",
    ticks: ["pending", "pending", "pending"],
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reloadTree = useAppStore((state) => state.reloadTree);

  const canStart = useMemo(
    () =>
      Boolean(
        commitState.resumeFile &&
          commitState.company.trim() &&
          commitState.position.trim() &&
          commitState.jdText.trim(),
      ),
    [commitState],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onSkip();
        return;
      }
      if (event.key === "ArrowLeft" && step > 0 && !runState.running) {
        setStep((current) => Math.max(0, current - 1) as StepIndex);
      }
      if (event.key === "ArrowRight" && step < 3 && !runState.running) {
        setStep((current) => Math.min(3, current + 1) as StepIndex);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip, runState.running, step]);

  async function handleImportAndEnter() {
    if (!canStart || !commitState.resumeFile) {
      onComplete();
      return;
    }

    setRunState({
      running: true,
      completed: false,
      error: "",
      ticks: ["active", "pending", "pending"],
    });

    try {
      const pdfDataUrl = await pdfFileToDataUrl(commitState.resumeFile);
      await upsertFile({
        path: RESUME_PDF_PATH,
        name: "个人简历.pdf",
        parentPath: "/简历",
        contentType: "pdf",
        content: pdfDataUrl,
      });
      await reloadTree();

      await generateResumeMarkdownFromPdf({
        file: commitState.resumeFile,
        confirmOverwriteMarkdown: () => true,
      });
      setRunState((current) => ({ ...current, ticks: ["done", "active", "pending"] }));

      await createJobFolderWithJD({
        company: commitState.company,
        position: commitState.position,
        jdText: commitState.jdText,
        resumePath: RESUME_MAIN_JSON_PATH,
      });
      setRunState((current) => ({ ...current, ticks: ["done", "done", "active"] }));

      await reloadTree();
      setRunState({
        running: false,
        completed: true,
        error: "",
        ticks: ["done", "done", "done"],
      });
      onComplete();
    } catch (error) {
      setRunState({
        running: false,
        completed: false,
        error: error instanceof Error ? error.message : "导入失败，请重试。",
        ticks: ["pending", "pending", "pending"],
      });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-8">
      <div className="glass-panel w-full max-w-[960px] overflow-hidden p-6 md:min-h-[740px] md:p-8">
        <StepChrome
          step={step}
          onBack={() => setStep((current) => Math.max(0, current - 1) as StepIndex)}
          onSkip={onSkip}
          canGoBack={step > 0 && !runState.running}
        />

        {step === 0 ? (
          <div className="flex min-h-[620px] items-center">
            <div className="mx-auto w-full max-w-[640px]">
              <div className="glass-subpanel flex min-h-[520px] flex-col border-white/70 p-6 md:p-7">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-subtle">{ONBOARDING_COPY.step1Eyebrow}</div>
                <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em] leading-[1.18] text-text-title md:text-[32px] lg:whitespace-nowrap">
                  {ONBOARDING_COPY.step1Title}
                </h1>
                <p className="mt-3 max-w-[22rem] text-[15px] leading-7 text-text-muted">{ONBOARDING_COPY.step1Subtitle}</p>
                <StepActions primaryLabel="下一步" onPrimary={() => setStep(1)} onSecondary={onSkip} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex min-h-[620px] items-center">
            <div className="grid w-full gap-6 lg:grid-cols-[0.52fr_0.48fr]">
              <div className="glass-subpanel flex min-h-[520px] flex-col border-white/70 p-5">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-subtle">{ONBOARDING_COPY.step2Eyebrow}</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-text-title">{ONBOARDING_COPY.step2Title}</h2>
                <p className="mt-3 text-[15px] leading-7 text-text-muted">{ONBOARDING_COPY.step2Subtitle}</p>
                <StepActions primaryLabel="下一步" onPrimary={() => setStep(2)} onSecondary={() => setStep(2)} />
              </div>

              <div className="grid gap-5">
                <div className="glass-subpanel border-white/70 p-5">
                  <div className="text-sm font-semibold text-zinc-900">导入个人简历 PDF</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">上传后自动整理主简历。</p>
                  <button
                    type="button"
                    className="mt-5 flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-[var(--line-hair)] bg-white/70 text-zinc-600"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={20} />
                    <span className="text-sm font-medium">{commitState.resumeFile ? commitState.resumeFile.name : "拖拽或点击上传 PDF"}</span>
                    <span className="text-xs text-zinc-400">{commitState.resumeFile ? "已选中" : "支持本地 PDF 简历"}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setCommitState((current) => ({ ...current, resumeFile: file }));
                    }}
                  />
                </div>

                <div className="glass-subpanel border-white/70 p-5">
                  <div className="text-sm font-semibold text-zinc-900">导入岗位 JD</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">补齐公司、职位和 JD。</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      className="curator-input-surface w-full p-3 text-sm"
                      placeholder="公司"
                      value={commitState.company}
                      onChange={(event) => setCommitState((current) => ({ ...current, company: event.target.value }))}
                    />
                    <input
                      className="curator-input-surface w-full p-3 text-sm"
                      placeholder="职位"
                      value={commitState.position}
                      onChange={(event) => setCommitState((current) => ({ ...current, position: event.target.value }))}
                    />
                  </div>
                  <textarea
                    className="curator-input-surface mt-3 min-h-[132px] w-full p-3 text-sm"
                    placeholder="粘贴岗位 JD..."
                    value={commitState.jdText}
                    onChange={(event) => setCommitState((current) => ({ ...current, jdText: event.target.value }))}
                  />
                  <p className="mt-2 text-xs text-zinc-400">当前 {commitState.jdText.trim().length} 字</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex min-h-[620px] items-center">
            <div className="grid w-full gap-6 lg:grid-cols-[0.48fr_0.52fr]">
              <ScreenshotPanel
                imageSrc={ONBOARDING_SCREENSHOTS[1].imageSrc}
                title={ONBOARDING_SCREENSHOTS[1].title}
                eyebrow={ONBOARDING_SCREENSHOTS[1].eyebrow}
                description={ONBOARDING_SCREENSHOTS[1].description}
                heightClass="h-[420px]"
              />

              <div className="glass-subpanel flex min-h-[520px] flex-col border-white/70 p-6">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-subtle">{ONBOARDING_COPY.step3Eyebrow}</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-text-title">{ONBOARDING_COPY.step3Title}</h2>
                <p className="mt-3 text-[15px] leading-7 text-text-muted">{ONBOARDING_COPY.step3Subtitle}</p>
                <div className="mt-6 space-y-3">
                  <div className="rounded-[16px] border border-white/70 bg-white/72 px-4 py-3 text-sm text-zinc-700">生成面试准备包</div>
                  <div className="rounded-[16px] border border-white/70 bg-white/72 px-4 py-3 text-sm text-zinc-700">生成匹配分析</div>
                  <div className="rounded-[16px] border border-white/70 bg-white/72 px-4 py-3 text-sm text-zinc-700">生成 BOSS 文书</div>
                </div>
                <StepActions primaryLabel="下一步" onPrimary={() => setStep(3)} onSecondary={() => setStep(3)} />
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex min-h-[620px] items-center">
            <div className="grid w-full gap-6 lg:grid-cols-[0.48fr_0.52fr]">
              <ScreenshotPanel
                imageSrc={ONBOARDING_SCREENSHOTS[2].imageSrc}
                title={ONBOARDING_SCREENSHOTS[2].title}
                eyebrow={ONBOARDING_SCREENSHOTS[2].eyebrow}
                description={ONBOARDING_SCREENSHOTS[2].description}
                heightClass="h-[420px]"
              />

              <div className="glass-subpanel flex min-h-[520px] flex-col border-white/70 p-6">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-subtle">{ONBOARDING_COPY.step4Eyebrow}</div>
                <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-text-title">{ONBOARDING_COPY.step4Title}</h2>
                <p className="mt-3 text-[15px] leading-7 text-text-muted">{ONBOARDING_COPY.step4Subtitle}</p>
                <div className="mt-6 space-y-4">
                  {[
                    "保存 PDF 并提取简历",
                    "创建岗位并写入 JD",
                    "准备进入工作台",
                  ].map((label, index) => {
                    const state = runState.ticks[index];
                    return (
                      <div key={label} className="flex items-center justify-between rounded-[16px] border border-white/70 bg-white/70 px-4 py-3">
                        <div className="text-sm font-medium text-zinc-800">{label}</div>
                        <div className="text-xs text-zinc-500">
                          {state === "done" ? "已完成" : state === "active" ? "处理中" : "待开始"}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {runState.error ? (
                  <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50/85 px-4 py-3 text-sm text-red-700">
                    {runState.error}
                  </div>
                ) : null}

                <StepActions
                  primaryLabel={runState.running ? "处理中..." : "进入工作台"}
                  onPrimary={() => {
                    if (runState.completed) {
                      onComplete();
                      return;
                    }
                    void handleImportAndEnter();
                  }}
                  onSecondary={onSkip}
                  primaryDisabled={!runState.completed && (!canStart || runState.running)}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
