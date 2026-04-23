"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, FileUp, Sparkles, WandSparkles } from "lucide-react";

type CardId = "resume" | "job" | "prep";
type PrepTrack = "产品" | "运营" | "设计" | "开发";
type PrepMode = "高频题" | "追问" | "模拟";

function CardShell({
  id,
  activeCard,
  onActivate,
  className,
  children,
}: {
  id: CardId;
  activeCard: CardId;
  onActivate: (cardId: CardId) => void;
  className: string;
  children: React.ReactNode;
}) {
  const active = activeCard === id;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate(id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate(id);
        }
      }}
      className={`glass-subpanel group relative flex min-h-[340px] w-full cursor-pointer flex-col overflow-hidden border-white/70 bg-white/70 p-5 text-left transition-[transform,box-shadow,border-color,background-color] duration-[var(--dur-morph)] ease-[var(--ease-glass)] hover:-translate-y-1.5 hover:scale-[1.028] hover:border-white/85 hover:bg-white/78 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(15,23,42,0.04),0_18px_44px_rgba(15,23,42,0.08)] ${
        active
          ? "border-white/85 bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(15,23,42,0.04),0_18px_44px_rgba(15,23,42,0.08)]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

function CardHeader({
  emoji,
  title,
  active,
}: {
  emoji: string;
  title: string;
  active: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="glass-inline flex h-11 w-11 items-center justify-center rounded-[14px] border-white/75 bg-white/82 text-[22px]">
          <span aria-hidden="true">{emoji}</span>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Step</div>
          <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[var(--text-title)]">{title}</div>
        </div>
      </div>

      <span
        className={`glass-inline px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${
          active
            ? "border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.08)] text-[var(--color-primary)]"
            : "border-[var(--line-hair)] bg-white/82 text-zinc-400"
        }`}
      >
        {active ? "Open" : "Hover"}
      </span>
    </div>
  );
}

export function OnboardingRedesignDemo() {
  const fileInputId = useId();
  const [activeCard, setActiveCard] = useState<CardId>("resume");
  const [resumeFileName, setResumeFileName] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [prepTrack, setPrepTrack] = useState<PrepTrack>("产品");
  const [prepMode, setPrepMode] = useState<PrepMode>("高频题");

  const resumeStatus = useMemo(() => {
    if (!resumeFileName) return "导入个人简历";
    return resumeFileName.length > 16 ? `${resumeFileName.slice(0, 16)}...` : resumeFileName;
  }, [resumeFileName]);

  return (
    <main className="min-h-screen bg-white px-4 py-4 text-[var(--text-body)] md:px-6 md:py-5">
      <div className="relative mx-auto flex min-h-[calc(100vh-32px)] max-w-[1380px] flex-col overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9)_0%,rgba(247,249,252,0.96)_52%,rgba(244,247,251,1)_100%)] px-6 pb-8 pt-6 md:px-8 md:pb-10 md:pt-7">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[8%] top-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(238,244,252,0.62)_0%,rgba(255,255,255,0)_72%)]" />
          <div className="absolute right-[10%] top-[18%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(244,247,252,0.86)_0%,rgba(255,255,255,0)_74%)]" />
        </div>

        <header className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[42px] font-semibold tracking-[-0.06em] text-[var(--text-title)] md:text-[72px] md:leading-[0.96]">
              OfferDesk
            </h1>
            <p className="mt-2 text-sm tracking-[0.02em] text-zinc-500 md:text-[15px]">从简历，到岗位，到准备。</p>
          </div>

          <Link
            href="/"
            className="mt-1 text-[12px] tracking-[0.08em] text-zinc-400 transition-colors duration-[var(--dur-fast)] hover:text-zinc-700"
          >
            跳过
          </Link>
        </header>

        <section className="relative z-10 mt-10 grid flex-1 gap-5 lg:min-h-[66vh] lg:grid-cols-3 lg:items-center lg:gap-6">
          <CardShell
            id="resume"
            activeCard={activeCard}
            onActivate={setActiveCard}
            className="lg:translate-y-10 lg:rotate-[-4deg]"
          >
            <CardHeader emoji="📄" title="个人简历" active={activeCard === "resume"} />

            <div className="mt-6 flex flex-1 flex-col justify-between">
              <div className="space-y-3">
                <div className="text-sm leading-6 text-zinc-500">PDF</div>
                <div className="glass-soft flex min-h-[110px] items-center justify-center border-dashed border-[var(--line-hair)] bg-white/76 px-4 text-center">
                  <div className="space-y-3">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,122,255,0.08)] text-[var(--color-primary)]">
                      <FileUp size={18} />
                    </div>
                    <div className="text-sm font-medium text-[var(--text-title)]">{resumeStatus}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <label
                  htmlFor={fileInputId}
                  className="curator-button-functional curator-button-sm cursor-pointer"
                  onClick={(event) => event.stopPropagation()}
                >
                  导入个人简历
                </label>
                <ArrowRight size={16} className="text-zinc-400" />
              </div>
            </div>

            <input
              id={fileInputId}
              type="file"
              accept="application/pdf"
              className="hidden"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const file = event.target.files?.[0];
                setResumeFileName(file?.name ?? "");
                setActiveCard("resume");
              }}
            />
          </CardShell>

          <CardShell
            id="job"
            activeCard={activeCard}
            onActivate={setActiveCard}
            className="lg:-translate-y-7 lg:rotate-[1.5deg]"
          >
            <CardHeader emoji="🎯" title="岗位信息" active={activeCard === "job"} />

            <div className="mt-6 flex flex-1 flex-col justify-between">
              <div className="grid gap-3">
                <input
                  value={jobCompany}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setJobCompany(event.target.value)}
                  placeholder="公司"
                  className="curator-input-surface h-11 w-full px-4 text-sm"
                />
                <input
                  value={jobTitle}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="岗位"
                  className="curator-input-surface h-11 w-full px-4 text-sm"
                />
                <div className="glass-soft flex min-h-[110px] items-center border-[var(--line-hair)] bg-white/76 px-4">
                  <div className="text-sm leading-6 text-zinc-500">
                    {jobCompany || jobTitle ? `${jobCompany || "公司"} / ${jobTitle || "岗位"}` : "输入岗位的信息"}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="curator-button-functional curator-button-sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveCard("job");
                  }}
                >
                  填写岗位信息
                </button>
                <BriefcaseBusiness size={16} className="text-zinc-400" />
              </div>
            </div>
          </CardShell>

          <CardShell
            id="prep"
            activeCard={activeCard}
            onActivate={setActiveCard}
            className="lg:translate-y-8 lg:rotate-[4deg]"
          >
            <CardHeader emoji="✨" title="面试准备" active={activeCard === "prep"} />

            <div className="mt-6 flex flex-1 flex-col justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["产品", "运营", "设计", "开发"] as PrepTrack[]).map((track) => {
                    const active = prepTrack === track;
                    return (
                      <button
                        key={track}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPrepTrack(track);
                          setActiveCard("prep");
                        }}
                        className={`glass-inline px-3 py-1.5 text-xs transition-colors ${
                          active
                            ? "border-[rgba(0,122,255,0.18)] bg-[rgba(0,122,255,0.08)] text-[var(--color-primary)]"
                            : "border-[var(--line-hair)] bg-white/78 text-zinc-500 hover:text-zinc-800"
                        }`}
                      >
                        {track}
                      </button>
                    );
                  })}
                </div>

                <div className="glass-soft min-h-[110px] border-[var(--line-hair)] bg-white/76 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-title)]">
                    <Sparkles size={15} className="text-[var(--color-primary)]" />
                    {prepTrack}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["高频题", "追问", "模拟"] as PrepMode[]).map((mode) => {
                      const active = prepMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPrepMode(mode);
                            setActiveCard("prep");
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? "bg-[rgba(15,23,42,0.08)] text-[var(--text-title)]"
                              : "bg-[rgba(15,23,42,0.04)] text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="curator-button-functional curator-button-sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveCard("prep");
                  }}
                >
                  开始准备
                </button>
                <WandSparkles size={16} className="text-zinc-400" />
              </div>
            </div>
          </CardShell>
        </section>

        <div className="relative z-10 mt-8 flex justify-center">
          <div className="glass-inline flex items-center gap-2 border-white/75 px-4 py-2 text-[11px] tracking-[0.18em] text-zinc-500">
            <Check size={14} className="text-[var(--color-primary)]" />
            简洁。清楚。可直接开始。
          </div>
        </div>
      </div>
    </main>
  );
}
