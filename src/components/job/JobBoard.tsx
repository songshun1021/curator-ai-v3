"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Sparkles } from "lucide-react";
import { analyzeCustomResumeFit, parseResumeDataForAnalysis } from "@/lib/custom-resume-analysis";
import { generateInterviewReview, generateJobDoc, generatePrepPack } from "@/lib/generation-actions";
import {
  buildInterviewGrowthSummary,
  hasInterviewGrowthProfileContent,
  INTERVIEW_GROWTH_PROFILE_PATH,
  parseInterviewGrowthOverview,
} from "@/lib/interview-growth";
import { generateNextActionSuggestions, type GeneratedNextActionSuggestion, type NextActionCandidate } from "@/lib/next-action-suggestions";
import { readFile, upsertFile } from "@/lib/file-system";
import { RESUME_MARKDOWN_PATH } from "@/lib/resume-import";
import { getWorkspaceGuideState, getWorkspaceGuideSteps, JOB_CREATE_FORM_PATH, JOB_ROOT, hasMeaningfulJd } from "@/lib/workspace-readiness";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
import { VirtualFile } from "@/types";

type ActionSource = "resume" | "job" | "prep" | "review";
type ActionStatus = "pending" | "running" | "done" | "error";
type ActionType = "open_resume" | "open_jd" | "generate_prep_pack" | "generate_review" | "generate_job_doc" | "open_file";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  source: ActionSource;
  priority: number;
  status: ActionStatus;
  jobFolderPath?: string;
  interviewFolderPath?: string;
  actionType: ActionType;
  payload?: {
    path?: string;
    docType?: "match" | "boss" | "email" | "custom-resume";
  };
}

type DisplayActionItem = ActionItem & {
  displayTitle: string;
  displayNote: string;
};

const SOURCE_LABEL: Record<ActionSource, string> = {
  resume: "简历",
  job: "岗位",
  prep: "准备包",
  review: "复盘",
};

const GUIDE_COLLAPSE_KEY = "curator-guide-collapsed-by-user";
const GROWTH_COLLAPSE_KEY = "curator-growth-collapsed-by-user";
const GUIDE_FOCUS_EVENT = "curator:focus-guide";
const MAIN_RESUME_PATH = "/简历/主简历.json";

function parseJson<T>(file: VirtualFile | undefined): T | null {
  if (!file || file.type !== "file") return null;
  try {
    return JSON.parse(file.content) as T;
  } catch {
    return null;
  }
}

function normalizeLines(markdown: string) {
  return markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
}

function getMarkdownSection(lines: string[], heading: string) {
  const startIndex = lines.findIndex((line) => line === heading);
  if (startIndex < 0) return [];

  const section: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) break;
    section.push(line);
  }
  return section;
}

function extractActionLines(section: string[], limit: number) {
  return section
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^###\s+/.test(line))
    .filter((line) => !/^####\s+/.test(line))
    .filter((line) => !/^\|/.test(line))
    .map((line) => line.replace(/^- \[ \]\s*/, "").replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildSuggestionDescription(lines: string[], fallback: string) {
  if (lines.length === 0) return fallback;
  return lines.map((line) => `- ${line}`).join("\n");
}

function clipSuggestionText(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function getCustomResumePathForLatestJob(
  guideState: ReturnType<typeof getWorkspaceGuideState>,
  fileCache: Record<string, VirtualFile>,
) {
  if (!guideState.latestJobPath) return null;
  const meta = parseJson<{ company?: string; position?: string; resumeId?: string }>(fileCache[`${guideState.latestJobPath}/meta.json`]);
  const company = meta?.company?.trim();
  const position = meta?.position?.trim();
  if (!company || !position) return null;
  return `/简历/定制简历/${company}-${position}.json`;
}

function getCustomResumeSuggestionActions(
  guideState: ReturnType<typeof getWorkspaceGuideState>,
  fileCache: Record<string, VirtualFile>,
): ActionItem[] {
  const customResumePath = getCustomResumePathForLatestJob(guideState, fileCache);
  if (!guideState.latestJobPath || !guideState.hasJd || !customResumePath) return [];

  const customResumeFile = fileCache[customResumePath];
  const jdFile = fileCache[`${guideState.latestJobPath}/jd.md`];
  const meta = parseJson<{ resumeId?: string }>(fileCache[`${guideState.latestJobPath}/meta.json`]);
  const sourceResumePath = meta?.resumeId?.trim() || MAIN_RESUME_PATH;
  const sourceResumeFile = fileCache[sourceResumePath] ?? fileCache[MAIN_RESUME_PATH];
  const resumeMarkdownFile = fileCache[RESUME_MARKDOWN_PATH];
  const targetResume = parseResumeDataForAnalysis(customResumeFile?.content);
  const sourceResume = parseResumeDataForAnalysis(sourceResumeFile?.content);

  if (!targetResume || !jdFile?.content.trim()) return [];

  const fitAnalysis = analyzeCustomResumeFit({
    sourceResume,
    targetResume,
    jdContent: jdFile.content,
  });

  if (fitAnalysis.fitWarnings.length === 0 && fitAnalysis.supplementSuggestions.length === 0) {
    return [];
  }

  const actions: ActionItem[] = [];
  if (fitAnalysis.supplementSuggestions.length > 0) {
    const primarySuggestion = fitAnalysis.supplementSuggestions[0] ?? "补 1-2 条更贴岗位的事实";
    actions.push({
      id: `custom-resume-supplement-${guideState.latestJobPath}`,
      title: `先补：${primarySuggestion}`,
      description: buildSuggestionDescription(
        fitAnalysis.supplementSuggestions,
        "先补 1-2 条更贴 JD 的事实，再改简历会更容易过 HR 初筛。",
      ),
      source: "resume",
      priority: 0,
      status: "pending",
      actionType: "open_file",
      payload: {
        path: resumeMarkdownFile?.content?.trim() ? RESUME_MARKDOWN_PATH : sourceResumeFile?.path || MAIN_RESUME_PATH,
      },
    });
  }

  actions.push({
    id: `custom-resume-regenerate-${guideState.latestJobPath}`,
    title: "重新生成定制简历",
    description:
      fitAnalysis.fitWarnings.length > 0
        ? `当前仍偏弱：${fitAnalysis.fitWarnings.map((item) => `「${item}」`).join("、")}。先补事实再生成，会更像真实投递版本。`
        : "补充后再生成，会更贴岗位，也更容易被 HR 扫到重点。",
    source: "job",
    priority: 1,
    status: "pending",
    jobFolderPath: guideState.latestJobPath,
    actionType: "generate_job_doc",
    payload: { docType: "custom-resume" },
  });

  return actions;
}

function getSuggestionActions(
  guideState: ReturnType<typeof getWorkspaceGuideState>,
  fileCache: Record<string, VirtualFile>,
): ActionItem[] {
  const actions: ActionItem[] = [];
  actions.push(...getCustomResumeSuggestionActions(guideState, fileCache));
  const latestReview = guideState.latestReviewPath ? fileCache[guideState.latestReviewPath] : undefined;
  const latestPrep = guideState.latestPrepPackPath ? fileCache[guideState.latestPrepPackPath] : undefined;

  if (latestReview?.content.trim()) {
    const reviewLines = normalizeLines(latestReview.content);
    const actionLines = extractActionLines(getMarkdownSection(reviewLines, "## 五、改进行动清单"), 2);
    const reminderLines = extractActionLines(getMarkdownSection(reviewLines, "## 六、下次面试前必看提醒"), 1);
    const suggestionLines = [...actionLines, ...reminderLines].slice(0, 3);
    actions.push({
      id: `review-open-${latestReview.path}`,
      title: suggestionLines[0] ? `复盘建议：${suggestionLines[0]}` : "根据最近复盘继续准备",
      description: buildSuggestionDescription(
        suggestionLines.slice(suggestionLines[0] ? 1 : 0),
        "先打开最近复盘，按行动清单和必看提醒继续收口。",
      ),
      source: "review",
      priority: 1,
      status: "pending",
      actionType: "open_file",
      payload: { path: latestReview.path },
    });
    if (latestPrep?.content.trim()) {
      actions.push({
        id: `prep-open-${latestPrep.path}`,
        title: "打开最近准备包",
        description: "对照题单和行动清单继续准备。",
        source: "prep",
        priority: 2,
        status: "pending",
        actionType: "open_file",
        payload: { path: latestPrep.path },
      });
    }
  } else if (latestPrep?.content.trim()) {
    const prepLines = normalizeLines(latestPrep.content);
    const checklistLines = extractActionLines(getMarkdownSection(prepLines, "## 六、面试前行动清单"), 2);
    const questionLines = extractActionLines(getMarkdownSection(prepLines, "## 二、高频面试题"), 1);
    const suggestionLines = [...checklistLines, ...questionLines].slice(0, 3);
    actions.push({
      id: `prep-open-${latestPrep.path}`,
      title: suggestionLines[0] ? `准备包建议：${suggestionLines[0]}` : "先看最近准备包",
      description: buildSuggestionDescription(
        suggestionLines.slice(suggestionLines[0] ? 1 : 0),
        "先打开最近准备包，优先处理行动清单和高频题。",
      ),
      source: "prep",
      priority: 1,
      status: "pending",
      actionType: "open_file",
      payload: { path: latestPrep.path },
    });
  }

  if (!latestReview?.content.trim() && guideState.latestInterviewPath) {
    actions.push({
      id: `review-generate-${guideState.latestInterviewPath}`,
      title: "处理这次复盘",
      description: "先把最近一轮面试沉淀成复盘。",
      source: "review",
      priority: 2,
      status: "pending",
      interviewFolderPath: guideState.latestInterviewPath,
      actionType: "generate_review",
    });
  } else if (!latestPrep?.content.trim() && guideState.latestJobPath && guideState.hasJd) {
    actions.push({
      id: `prep-generate-${guideState.latestJobPath}`,
      title: "生成准备包",
      description: "继续把当前岗位整理成准备包。",
      source: "prep",
      priority: 2,
      status: "pending",
      jobFolderPath: guideState.latestJobPath,
      actionType: "generate_prep_pack",
    });
  } else if (guideState.latestJobPath && guideState.hasJd) {
    actions.push({
      id: `job-match-${guideState.latestJobPath}`,
      title: "查看岗位匹配",
      description: "回到岗位分析，继续补齐优势和短板。",
      source: "job",
      priority: 3,
      status: "pending",
      jobFolderPath: guideState.latestJobPath,
      actionType: "generate_job_doc",
      payload: { docType: "match" },
    });
  } else if (guideState.latestJobPath) {
    actions.push({
      id: `job-open-${guideState.latestJobPath}`,
      title: "继续补 JD",
      description: "先把最近岗位的 JD 补完整。",
      source: "job",
      priority: 3,
      status: "pending",
      actionType: "open_jd",
      jobFolderPath: guideState.latestJobPath,
    });
  } else {
    actions.push({
      id: "resume-open-generic",
      title: "先检查主简历",
      description: "先把简历基线整理稳，再继续后面的动作。",
      source: "resume",
      priority: 3,
      status: "pending",
      actionType: "open_resume",
    });
  }

  return actions;
}

function getActionStatusLabel(item: ActionItem, errorById: Record<string, string>) {
  if (item.status === "running") return "执行中";
  if (item.status === "done") return "已完成";
  if (item.status === "error") return errorById[item.id] ?? "执行失败";
  return "待执行";
}

function getStepStatusCopy(active: boolean) {
  return active ? "当前步骤" : "稍后继续";
}

export function JobBoard() {
  const fileCache = useAppStore((state) => state.fileCache);
  const openFilePath = useAppStore((state) => state.openFilePath);
  const markMarkdownEditOnce = useAppStore((state) => state.markMarkdownEditOnce);
  const llmConfig = useAppStore((state) => state.llmConfig);
  const trialStatus = useAppStore((state) => state.trialStatus);

  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Record<string, true>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [collapsedByUser, setCollapsedByUser] = useState(false);
  const [growthCollapsedByUser, setGrowthCollapsedByUser] = useState(false);
  const [forceExpanded, setForceExpanded] = useState(false);
  const [generatedSuggestions, setGeneratedSuggestions] = useState<GeneratedNextActionSuggestion[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsedByUser(window.localStorage.getItem(GUIDE_COLLAPSE_KEY) === "true");
    setGrowthCollapsedByUser(window.localStorage.getItem(GROWTH_COLLAPSE_KEY) === "true");
  }, []);

  useEffect(() => {
    const onFocusGuide = () => {
      setForceExpanded(true);
      setCollapsedByUser(false);
      window.localStorage.removeItem(GUIDE_COLLAPSE_KEY);
    };

    window.addEventListener(GUIDE_FOCUS_EVENT, onFocusGuide);
    return () => window.removeEventListener(GUIDE_FOCUS_EVENT, onFocusGuide);
  }, []);

  const guideState = useMemo(() => getWorkspaceGuideState(fileCache), [fileCache]);

  const actions = useMemo(() => {
    const base = getSuggestionActions(guideState, fileCache);

    return base
      .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "zh-CN"))
      .map((item) => {
        if (runningActionId === item.id) return { ...item, status: "running" as const };
        if (errorById[item.id]) return { ...item, status: "error" as const };
        if (doneIds[item.id]) return { ...item, status: "done" as const };
        return item;
      });
  }, [doneIds, errorById, fileCache, guideState, runningActionId]);

  const suggestionCandidates = useMemo<NextActionCandidate[]>(
    () =>
      actions.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        source: item.source,
      })),
    [actions],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const next = await generateNextActionSuggestions({
          llmConfig,
          trialStatus,
          candidates: suggestionCandidates,
          fileCache,
        });
        if (!cancelled) {
          setGeneratedSuggestions(next);
        }
      } catch {
        if (!cancelled) {
          setGeneratedSuggestions(null);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fileCache, llmConfig, suggestionCandidates, trialStatus]);

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

    const ok = await openFilePath(formPath);
    if (!ok) throw new Error("打开岗位创建表单失败");
  }

  async function runActionItem(item: ActionItem) {
    setRunningActionId(item.id);
    setErrorById((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    try {
      if (item.actionType === "open_resume") {
        const ok = await openFilePath(MAIN_RESUME_PATH);
        if (!ok) throw new Error("主简历文件不存在");
      } else if (item.actionType === "open_jd") {
        if (!item.jobFolderPath) throw new Error("缺少岗位路径");
        const jdPath = `${item.jobFolderPath}/jd.md`;
        markMarkdownEditOnce(jdPath);
        const ok = await openFilePath(jdPath);
        if (!ok) throw new Error("JD 文件不存在");
      } else if (item.actionType === "generate_prep_pack") {
        if (!item.jobFolderPath) throw new Error("缺少岗位路径");
        const result = await generatePrepPack(item.jobFolderPath);
        if (!result.ok) throw new Error(result.message);
      } else if (item.actionType === "generate_review") {
        if (!item.interviewFolderPath) throw new Error("缺少复盘路径");
        const result = await generateInterviewReview(item.interviewFolderPath);
        if (!result.ok) throw new Error(result.message);
      } else if (item.actionType === "generate_job_doc") {
        if (!item.jobFolderPath) throw new Error("缺少岗位路径");
        const result = await generateJobDoc(item.jobFolderPath, item.payload?.docType ?? "match");
        if (!result.ok) throw new Error(result.message);
      } else if (item.actionType === "open_file") {
        if (!item.payload?.path) throw new Error("缺少目标路径");
        const ok = await openFilePath(item.payload.path);
        if (!ok) throw new Error("目标文件不存在");
      }

      setDoneIds((prev) => ({ ...prev, [item.id]: true }));
    } catch (error) {
      setErrorById((prev) => ({
        ...prev,
        [item.id]: error instanceof Error ? error.message : "执行失败，请稍后重试",
      }));
    } finally {
      setRunningActionId(null);
    }
  }

  const guideSteps = getWorkspaceGuideSteps(guideState).map((step) => ({
    ...step,
    desc: step.description,
    action: async () => {
      if (step.id === "resume") {
        await runActionItem({
          id: "guide-open-resume",
          title: "",
          description: "",
          source: "resume",
          priority: 1,
          status: "pending",
          actionType: "open_resume",
        });
        return;
      }

      if (step.id === "job") {
        await openOrCreateJobForm();
        return;
      }

      if (step.id === "prep") {
        if (!guideState.latestJobPath) {
          await openOrCreateJobForm();
          return;
        }

        const jdFile = fileCache[`${guideState.latestJobPath}/jd.md`];
        if (!hasMeaningfulJd(jdFile?.content)) {
          markMarkdownEditOnce(`${guideState.latestJobPath}/jd.md`);
          await openFilePath(`${guideState.latestJobPath}/jd.md`);
          return;
        }

        await runActionItem({
          id: `guide-generate-prep-${guideState.latestJobPath}`,
          title: "",
          description: "",
          source: "job",
          priority: 2,
          status: "pending",
          actionType: "generate_prep_pack",
          jobFolderPath: guideState.latestJobPath,
        });
        return;
      }

      if (!guideState.latestInterviewPath) {
        if (!guideState.latestJobPath) {
          await openOrCreateJobForm();
          return;
        }

        await createInterviewRecord(guideState.latestJobPath, "一面");
        return;
      }

      await runActionItem({
        id: `guide-generate-review-${guideState.latestInterviewPath}`,
        title: "",
        description: "",
        source: "review",
        priority: 2,
        status: "pending",
        actionType: "generate_review",
        interviewFolderPath: guideState.latestInterviewPath,
      });
    },
  }));

  const pendingGuideSteps = guideSteps.filter((step) => !step.done);
  const allGuideStepsCompleted = pendingGuideSteps.length === 0;
  const currentGuideStep = pendingGuideSteps[0] ?? guideSteps[guideSteps.length - 1] ?? null;
  const showSuggestionsMode = actions.length > 0;
  const collapsedByCompletion = allGuideStepsCompleted && !forceExpanded;
  const guideCollapsed = collapsedByUser || collapsedByCompletion;
  const shouldShowGuideCard = Boolean(currentGuideStep) && (!guideCollapsed || forceExpanded);
  const displayActions = useMemo<DisplayActionItem[]>(
    () =>
      actions.map((item, index) => ({
        ...item,
        displayTitle: generatedSuggestions?.[index]?.title || clipSuggestionText(item.title, 30),
        displayNote: generatedSuggestions?.[index]?.note || clipSuggestionText(item.description, 18),
      })),
    [actions, generatedSuggestions],
  );
  const featuredAction = displayActions.find((item) => item.status !== "done") ?? displayActions[0] ?? null;
  const trailingActions = featuredAction ? displayActions.filter((item) => item.id !== featuredAction.id) : [];
  const growthProfileFile = fileCache[INTERVIEW_GROWTH_PROFILE_PATH];
  const growthOverview = useMemo(
    () => (hasInterviewGrowthProfileContent(growthProfileFile?.content) ? parseInterviewGrowthOverview(growthProfileFile?.content) : null),
    [growthProfileFile],
  );
  const growthSummary = useMemo(() => (growthOverview ? buildInterviewGrowthSummary(growthOverview) : null), [growthOverview]);

  return (
    <div className="soft-scrollbar h-full overflow-auto px-4 py-4">
      {shouldShowGuideCard && currentGuideStep ? (
        <section className="glass-soft mb-4 overflow-hidden border-white/65 bg-white/74">
          <div className="flex items-start justify-between gap-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(15,23,42,0.04)] text-zinc-700">
                <Compass size={18} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">Guide</div>
                <h3 className="mt-1 text-sm font-semibold text-zinc-800">新手指引</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">先把主链路走通。</p>
              </div>
            </div>

            <button
              type="button"
              className="curator-button-ghost curator-button-sm shrink-0"
              onClick={() => {
                const nextValue = !guideCollapsed;
                setCollapsedByUser(nextValue);
                setForceExpanded(false);
                if (nextValue) {
                  window.localStorage.setItem(GUIDE_COLLAPSE_KEY, "true");
                } else {
                  window.localStorage.removeItem(GUIDE_COLLAPSE_KEY);
                }
              }}
            >
              {guideCollapsed ? "展开" : "收起"}
            </button>
          </div>

          {!guideCollapsed ? (
            <>
              <div className="border-t border-[var(--line-hair)] px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Current</div>
                    <div className="mt-2 text-base font-semibold text-zinc-800">{currentGuideStep.title}</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{currentGuideStep.desc}</p>
                  </div>

                  <button
                    type="button"
                    className="curator-button-primary curator-button-sm shrink-0"
                    disabled={Boolean(runningActionId)}
                    onClick={() => void currentGuideStep.action()}
                  >
                    {currentGuideStep.actionLabel}
                    <ArrowRight size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 px-4 pb-4">
                {guideSteps
                  .filter((step) => step.id !== currentGuideStep.id)
                  .slice(0, 3)
                  .map((step, index) => {
                  return (
                    <article
                      key={step.id}
                      className={`rounded-[16px] border px-4 py-4 ${
                        step.done
                          ? "border-[rgba(52,199,89,0.16)] bg-[rgba(255,255,255,0.84)]"
                          : "border-[var(--line-hair)] bg-white/62"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Step 0{index + 1}</div>
                        <span
                          className={`text-[11px] font-medium tracking-[0.2em] ${
                            step.done ? "text-[#34C759]" : "text-zinc-400"
                          }`}
                        >
                          {step.done ? "已完成" : getStepStatusCopy(false)}
                        </span>
                      </div>
                      <div className="mt-3 text-sm font-medium text-zinc-800">{step.title}</div>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">{step.desc}</p>
                    </article>
                  );
                })}
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            className="curator-button-ghost curator-button-sm"
            onClick={() => {
              setForceExpanded(true);
              setCollapsedByUser(false);
              window.localStorage.removeItem(GUIDE_COLLAPSE_KEY);
            }}
          >
            查看新手引导
          </button>
        </div>
      )}

      {showSuggestionsMode ? (
        <>
          {actions.length === 0 ? (
            <div className="glass-soft border-white/65 bg-white/74 px-4 py-5 text-sm text-zinc-500">
              <div className="flex items-center gap-2 text-zinc-700">
                <Sparkles size={16} className="text-zinc-400" />
                当前还没有建议
              </div>
            </div>
          ) : (
            <>
              {featuredAction ? (
                <article className="glass-soft mb-3 border-white/65 bg-white/76 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">{SOURCE_LABEL[featuredAction.source]}</div>
                      <div className="mt-3 text-base font-semibold text-zinc-800">{featuredAction.displayTitle}</div>
                      {featuredAction.displayNote ? (
                        <p className="mt-2 text-xs leading-5 text-zinc-500">{featuredAction.displayNote}</p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-zinc-500">{getActionStatusLabel(featuredAction, errorById)}</span>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-3 border-t border-[var(--line-hair)] pt-4">
                    <button
                      type="button"
                      disabled={Boolean(runningActionId)}
                      className="curator-button-primary curator-button-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void runActionItem(featuredAction)}
                    >
                      {featuredAction.status === "running"
                        ? "执行中"
                        : featuredAction.status === "done"
                          ? "已完成"
                          : featuredAction.status === "error"
                            ? "重新执行"
                            : "现在执行"}
                      <ArrowRight size={14} strokeWidth={2} />
                    </button>
                  </div>
                </article>
              ) : null}

              {trailingActions.length > 0 ? (
                <div className="glass-soft overflow-hidden border-white/65 bg-white/72">
                  {trailingActions.slice(0, 2).map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-start justify-between gap-3 px-4 py-3 ${index === 0 ? "" : "border-t border-[var(--line-hair)]"}`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">{SOURCE_LABEL[item.source]}</div>
                        <div className="mt-2 text-sm font-medium text-zinc-800">{item.displayTitle}</div>
                        {item.displayNote ? (
                          <p className="mt-1 text-xs leading-5 text-zinc-500">{item.displayNote}</p>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-zinc-500">{getActionStatusLabel(item, errorById)}</div>
                        <button
                          type="button"
                          disabled={Boolean(runningActionId)}
                          className={`mt-2 ${
                            item.status === "done"
                              ? "curator-button-ghost curator-button-sm"
                              : "curator-button-functional curator-button-sm"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                          onClick={() => void runActionItem(item)}
                        >
                          {item.status === "done" ? "再次查看" : item.status === "error" ? "重试" : "继续"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {growthSummary ? (
        <section className="glass-soft mb-4 overflow-hidden border-white/60 bg-white/70 shadow-[0_12px_28px_rgba(148,163,184,0.08)]">
          <div className="flex items-start justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Growth</div>
              <h3 className="mt-1 text-sm font-semibold text-zinc-800">面试成长判断</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="curator-button-ghost curator-button-sm shrink-0 text-zinc-500"
                onClick={() => {
                  const nextValue = !growthCollapsedByUser;
                  setGrowthCollapsedByUser(nextValue);
                  if (nextValue) {
                    window.localStorage.setItem(GROWTH_COLLAPSE_KEY, "true");
                  } else {
                    window.localStorage.removeItem(GROWTH_COLLAPSE_KEY);
                  }
                }}
              >
                {growthCollapsedByUser ? "展开" : "收起"}
              </button>
              <button
                type="button"
                className="curator-button-ghost curator-button-sm shrink-0 text-zinc-500"
                onClick={() => void openFilePath(INTERVIEW_GROWTH_PROFILE_PATH)}
              >
                打开画像
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--line-hair)] px-4 py-3.5">
            <div className="rounded-[14px] border border-white/70 bg-white/76 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72),inset_0_-1px_0_rgba(15,23,42,0.03),0_10px_22px_rgba(148,163,184,0.06)]">
              <p className="text-sm font-semibold leading-6 text-zinc-800">{growthSummary.headline}</p>
              <div className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-500">
                {growthCollapsedByUser ? (
                  <p>{growthSummary.collapsedLine}</p>
                ) : (
                  growthSummary.summaryLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
