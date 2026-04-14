"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDot, Compass, Sparkles } from "lucide-react";
import { ReviewGeneratedDetail } from "@/lib/action-events";
import { generateInterviewReview, generateJobDoc, generatePrepPack } from "@/lib/generation-actions";
import { readFile, upsertFile } from "@/lib/file-system";
import { pickLatestInterviewRound } from "@/lib/interview-paths";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
import { JobMeta, ResumeData, VirtualFile } from "@/types";

type ActionSource = "resume" | "job" | "review";
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

const SOURCE_LABEL: Record<ActionSource, string> = {
  resume: "简历",
  job: "岗位",
  review: "复盘",
};

const SOURCE_TONE: Record<ActionSource, string> = {
  resume: "border-zinc-200 bg-white text-zinc-600",
  job: "border-zinc-200 bg-white text-zinc-600",
  review: "border-zinc-200 bg-white text-zinc-600",
};

const GUIDE_HIDE_KEY = "curator-guide-hidden";
const GUIDE_FOCUS_EVENT = "curator:focus-guide";

function parseJson<T>(file: VirtualFile | undefined): T | null {
  if (!file || file.type !== "file") return null;
  try {
    return JSON.parse(file.content) as T;
  } catch {
    return null;
  }
}

function getLatestFolder(files: VirtualFile[], parentPath: string) {
  return files
    .filter((f) => f.type === "folder" && f.parentPath === parentPath)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
}

function hasMeaningfulTranscript(content: string) {
  return content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "# 面试原文")
    .filter((line) => !line.includes("请将面试听写文本粘贴到下方"))
    .filter((line) => !line.includes("尽量按问答格式整理")).length > 0;
}

function getResumeActions(fileCache: Record<string, VirtualFile>): ActionItem[] {
  const actions: ActionItem[] = [];
  const importedPdf = fileCache["/简历/个人简历.pdf"];
  const resumeMarkdown = fileCache["/简历/个人简历.md"] ?? fileCache["/简历/个人简历.提取.md"];
  const hasImportedSource = Boolean(resumeMarkdown?.content.trim() || importedPdf?.content.trim());
  const resumeFile = fileCache["/简历/主简历.json"];

  if (!resumeFile && !hasImportedSource) {
    actions.push({
      id: "resume-missing",
      title: "先完善主简历",
      description: "主简历是后续匹配分析、求职文书和准备包的统一基线。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
    return actions;
  }

  if (!resumeFile && hasImportedSource) {
    return actions;
  }

  const resume = parseJson<ResumeData>(resumeFile);
  if (!resume) {
    actions.push({
      id: "resume-invalid-json",
      title: "修复主简历格式",
      description: "当前主简历不是合法 JSON，请先修复后再继续生成。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
    return actions;
  }

  if (!resume.profile.name?.trim() || !resume.profile.phone?.trim() || !resume.profile.email?.trim()) {
    actions.push({
      id: "resume-contact",
      title: "补齐简历联系方式",
      description: "姓名、手机号和邮箱是投递阶段的必填信息。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
  }

  const hasExperience =
    (resume.internships?.length ?? 0) + (resume.projects?.length ?? 0) + (resume.campusExperience?.length ?? 0) > 0;
  if (!hasExperience) {
    actions.push({
      id: "resume-experience",
      title: "补充至少一段核心经历",
      description: "建议先补一段项目、校园或实习经历，便于后续做岗位匹配。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
  }

  return actions;
}

function getJobActions(fileCache: Record<string, VirtualFile>): ActionItem[] {
  const actions: ActionItem[] = [];
  const folders = Object.values(fileCache)
    .filter((f) => f.type === "folder" && f.parentPath === "/岗位")
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  for (const folder of folders) {
    const meta = parseJson<JobMeta>(fileCache[`${folder.path}/meta.json`]);
    const jd = fileCache[`${folder.path}/jd.md`];

    if (!jd || !jd.content.trim()) {
      actions.push({
        id: `job-jd-${folder.path}`,
        title: "先录入岗位 JD",
        description: `${folder.name} 还没有 JD 内容，当前无法生成匹配分析或准备包。`,
        source: "job",
        priority: 1,
        status: "pending",
        jobFolderPath: folder.path,
        actionType: "open_jd",
      });
      continue;
    }

    const company = meta?.company?.trim() || folder.name;
    const position = meta?.position?.trim() || "岗位";
    const prepFolder = fileCache[`/面试准备包/${company}-${position}`];
    if (!prepFolder) {
      actions.push({
        id: `job-prep-${folder.path}`,
        title: `为 ${company}-${position} 生成准备包`,
        description: "岗位与 JD 已就绪，下一步适合先生成准备包和知识清单。",
        source: "job",
        priority: 2,
        status: "pending",
        jobFolderPath: folder.path,
        actionType: "generate_prep_pack",
      });
    }
  }

  const latestJob = folders[folders.length - 1];
  if (latestJob) {
    actions.push({
      id: `job-match-${latestJob.path}`,
      title: "生成岗位匹配分析",
      description: "快速确认主简历与 JD 的匹配度，并先识别优势项和缺口项。",
      source: "job",
      priority: 3,
      status: "pending",
      jobFolderPath: latestJob.path,
      actionType: "generate_job_doc",
      payload: { docType: "match" },
    });
  }

  return actions;
}

function parseReviewActions(detail: ReviewGeneratedDetail): ActionItem[] {
  const jobFolderPath = detail.jobFolderPath;
  if (!jobFolderPath) return [];

  const lines = detail.summary
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*]\s+|^\d+\.\s+/.test(line))
    .slice(0, 5)
    .map((line) => line.replace(/^[-*]\s+|^\d+\.\s+/, ""));

  return lines.map((line, index) => ({
    id: `review-action-${detail.interviewFolderPath}-${index}`,
    title: `根据复盘继续准备：${line.slice(0, 24)}`,
    description: line,
    source: "review",
    priority: 1,
    status: "pending",
    jobFolderPath,
    interviewFolderPath: detail.interviewFolderPath,
    actionType: "generate_prep_pack",
  }));
}

export function JobBoard() {
  const fileCache = useAppStore((s) => s.fileCache);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const markMarkdownEditOnce = useAppStore((s) => s.markMarkdownEditOnce);

  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Record<string, true>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [reviewActionMap, setReviewActionMap] = useState<Record<string, ActionItem[]>>({});
  const [guideCollapsed, setGuideCollapsed] = useState(false);
  const [guideHidden, setGuideHidden] = useState(false);
  const [guideForceShow, setGuideForceShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setGuideHidden(window.localStorage.getItem(GUIDE_HIDE_KEY) === "true");
  }, []);

  useEffect(() => {
    const onFocusGuide = () => {
      setGuideForceShow(true);
      setGuideHidden(false);
      setGuideCollapsed(false);
      window.localStorage.removeItem(GUIDE_HIDE_KEY);
    };

    window.addEventListener(GUIDE_FOCUS_EVENT, onFocusGuide);
    return () => window.removeEventListener(GUIDE_FOCUS_EVENT, onFocusGuide);
  }, []);

  useEffect(() => {
    const onResumeSaved = () => undefined;
    const onJobCreated = () => undefined;
    const onReviewGenerated = (event: Event) => {
      const detail = (event as CustomEvent<ReviewGeneratedDetail>).detail;
      const next = parseReviewActions(detail);
      if (next.length > 0) {
        setReviewActionMap((prev) => ({ ...prev, [detail.interviewFolderPath]: next }));
      }
    };

    window.addEventListener("curator:resume-saved", onResumeSaved);
    window.addEventListener("curator:job-created", onJobCreated);
    window.addEventListener("curator:review-generated", onReviewGenerated);

    return () => {
      window.removeEventListener("curator:resume-saved", onResumeSaved);
      window.removeEventListener("curator:job-created", onJobCreated);
      window.removeEventListener("curator:review-generated", onReviewGenerated);
    };
  }, []);

  const actions = useMemo(() => {
    const base = [...getResumeActions(fileCache), ...getJobActions(fileCache)];
    const review = Object.values(reviewActionMap).flat();

    return [...review, ...base]
      .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "zh-CN"))
      .map((item) => {
        if (runningActionId === item.id) return { ...item, status: "running" as const };
        if (errorById[item.id]) return { ...item, status: "error" as const };
        if (doneIds[item.id]) return { ...item, status: "done" as const };
        return item;
      });
  }, [doneIds, errorById, fileCache, reviewActionMap, runningActionId]);

  const guideState = useMemo(() => {
    const files = Object.values(fileCache);
    const mainResume = fileCache["/简历/主简历.json"];
    const importedPdf = fileCache["/简历/个人简历.pdf"];
    const importedExtract = fileCache["/简历/个人简历.md"] ?? fileCache["/简历/个人简历.提取.md"];

    const latestJob = getLatestFolder(files, "/岗位");
    const latestInterview = pickLatestInterviewRound(files);

    const hasJob = Boolean(latestJob);
    const hasJd = hasJob ? Boolean(fileCache[`${latestJob.path}/jd.md`]?.content.trim()) : false;
    const hasPrep = files.some((f) => f.type === "file" && f.path.startsWith("/面试准备包/") && f.path.endsWith("/准备包.md"));
    const latestInterviewTranscript = latestInterview ? fileCache[`${latestInterview.path}/面试原文.md`] : null;
    const hasInterviewText = Boolean(latestInterviewTranscript && hasMeaningfulTranscript(latestInterviewTranscript.content));
    const hasReview = files.some((f) => f.type === "file" && f.path.startsWith("/面试复盘/") && f.path.endsWith("/复盘报告.md"));

    return {
      hasMainResume: Boolean(mainResume),
      hasImportedPdf: Boolean(importedPdf),
      hasImportedExtract: Boolean(importedExtract),
      latestJob,
      latestInterview,
      hasJob,
      hasJd,
      hasPrep,
      hasInterviewText,
      hasReview,
    };
  }, [fileCache]);

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
        const ok = await openFilePath("/简历/主简历.json");
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

  const guideSteps = [
    {
      id: "guide-step-1",
      title: "先准备简历基线",
      desc: "导入 PDF 或直接完善 /简历/主简历.json，后续生成会自动优先参考这部分信息。",
      done: guideState.hasImportedExtract || guideState.hasMainResume,
      action: async () =>
        runActionItem({
          id: "guide-open-resume",
          title: "",
          description: "",
          source: "resume",
          priority: 1,
          status: "pending",
          actionType: "open_resume",
        }),
      actionLabel: "打开简历",
    },
    {
      id: "guide-step-2",
      title: "新建岗位并录入 JD",
      desc: "岗位建档后，把 JD 填进岗位目录，后续匹配分析与准备包都从这里继续推进。",
      done: guideState.hasJob && guideState.hasJd,
      action: openOrCreateJobForm,
      actionLabel: "新建岗位",
    },
    {
      id: "guide-step-3",
      title: "生成面试准备包",
      desc: "在岗位目录点击生成准备包，拿到高频题、追问点、知识清单和行动建议。",
      done: guideState.hasPrep,
      action: async () => {
        if (!guideState.latestJob) {
          await openOrCreateJobForm();
          return;
        }
        await runActionItem({
          id: `guide-generate-prep-${guideState.latestJob.path}`,
          title: "",
          description: "",
          source: "job",
          priority: 2,
          status: "pending",
          actionType: "generate_prep_pack",
          jobFolderPath: guideState.latestJob.path,
        });
      },
      actionLabel: "生成准备包",
    },
    {
      id: "guide-step-4",
      title: "录入面试原文",
      desc: "每次面试后把问答原文粘贴到 /面试复盘/{公司-岗位}/{轮次}/面试原文.md，复盘质量会明显提升。",
      done: guideState.hasInterviewText,
      action: async () => {
        if (guideState.latestInterview) {
          const ok = await openFilePath(`${guideState.latestInterview.path}/面试原文.md`);
          if (ok) return;
        }
        if (!guideState.latestJob) {
          await openOrCreateJobForm();
          return;
        }
        await createInterviewRecord(guideState.latestJob.path, "一面");
      },
      actionLabel: "录入原文",
    },
    {
      id: "guide-step-5",
      title: "生成复盘并沉淀经验",
      desc: "复盘完成后，关键行动项会自动沉淀到记忆摘要，继续反哺下一次准备包。",
      done: guideState.hasReview,
      action: async () => {
        if (!guideState.latestInterview) {
          if (!guideState.latestJob) {
            await openOrCreateJobForm();
            return;
          }
          await createInterviewRecord(guideState.latestJob.path, "一面");
          return;
        }

        await runActionItem({
          id: `guide-generate-review-${guideState.latestInterview.path}`,
          title: "",
          description: "",
          source: "review",
          priority: 2,
          status: "pending",
          actionType: "generate_review",
          interviewFolderPath: guideState.latestInterview.path,
        });
      },
      actionLabel: "生成复盘",
    },
  ];

  const allGuideStepsCompleted = guideSteps.every((step) => step.done);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (allGuideStepsCompleted && !guideForceShow) {
      setGuideHidden(true);
      window.localStorage.setItem(GUIDE_HIDE_KEY, "true");
      return;
    }

    if (!allGuideStepsCompleted) {
      setGuideHidden(false);
      setGuideForceShow(false);
      window.localStorage.removeItem(GUIDE_HIDE_KEY);
    }
  }, [allGuideStepsCompleted, guideForceShow]);

  const shouldShowGuideCard = !guideHidden || guideForceShow || !allGuideStepsCompleted;

  return (
    <div className="soft-scrollbar h-full overflow-auto px-3 py-3">
      {shouldShowGuideCard ? (
        <div className="glass-subpanel mb-3 overflow-hidden border-white/60 bg-white/62">
          <div className="border-b border-white/60 bg-gradient-to-r from-stone-100/80 via-white/20 to-slate-100/75 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
            <div className="glass-soft flex h-10 w-10 items-center justify-center rounded-2xl border-white/70 bg-white/80 text-zinc-700">
                  <Compass size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800">工作区主链路</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">按这 5 步走，首页会一直给出清晰的下一步入口。</p>
                </div>
              </div>

              <button
                type="button"
                className="rounded-full border border-white/75 bg-white px-3 py-1 text-xs text-zinc-600 transition hover:border-zinc-200 hover:text-zinc-900"
                onClick={() => setGuideCollapsed((value) => !value)}
              >
                {guideCollapsed ? "展开" : "收起"}
              </button>
            </div>
          </div>

          {!guideCollapsed ? (
            <div className="space-y-2 px-3 py-3">
              {guideSteps.map((step, index) => (
                  <div key={step.id} className="glass-soft flex items-start gap-3 border border-white/60 bg-white/70 p-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-2xl border text-xs font-semibold ${
                      step.done
                        ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                        : "border-zinc-200 bg-zinc-50 text-zinc-500"
                    }`}
                  >
                    {step.done ? <CheckCircle2 size={16} /> : <span>{index + 1}</span>}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-zinc-800">{step.title}</div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          step.done
                            ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                            : "border-zinc-200 bg-zinc-50 text-zinc-500"
                        }`}
                      >
                        {step.done ? "已完成" : "待执行"}
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] leading-5 text-zinc-500">{step.desc}</div>

                    <button
                      type="button"
                      disabled={Boolean(runningActionId)}
                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/75 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-200 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void step.action()}
                    >
                      {step.actionLabel}
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="rounded-full border border-white/75 bg-white px-3 py-1 text-xs text-zinc-600 transition hover:border-zinc-200 hover:text-zinc-900"
            onClick={() => {
              setGuideForceShow(true);
              setGuideCollapsed(false);
            }}
          >
            重新查看引导
          </button>
        </div>
      )}

      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Action Board</div>
          <h3 className="mt-1 text-sm font-semibold text-zinc-800">下一步行动</h3>
        </div>
        <span className="rounded-full border border-white/75 bg-white/72 px-2.5 py-1 text-[11px] text-zinc-500">
          {actions.length} 项
        </span>
      </div>

      {actions.length === 0 ? (
        <div className="glass-subpanel border-white/60 bg-white/62 px-4 py-5 text-sm text-zinc-500">
          <div className="flex items-center gap-2 text-zinc-700">
            <Sparkles size={16} className="text-zinc-400" />
            当前没有待办行动
          </div>
          <p className="mt-2 text-xs leading-6 text-zinc-500">
            可以先新建岗位并录入 JD，右侧行动板会继续根据当前进度推荐下一步。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={Boolean(runningActionId)}
              className="glass-subpanel block w-full border-white/60 bg-white/62 p-3 text-left transition hover:-translate-y-0.5 hover:border-white/80 hover:shadow-[0_22px_38px_rgba(148,163,184,0.12)] disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => void runActionItem(item)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-800">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${SOURCE_TONE[item.source]}`}>
                  {SOURCE_LABEL[item.source]}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-zinc-400">点击后立即执行</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {item.status === "running" ? <span className="text-zinc-700">执行中...</span> : null}
                  {item.status === "done" ? <span className="text-emerald-600">已完成</span> : null}
                  {item.status === "error" ? <span className="text-rose-600">{errorById[item.id] ?? "执行失败"}</span> : null}
                  {item.status === "pending" ? (
                    <>
                      <CircleDot size={12} className="text-zinc-400" />
                      <span className="text-zinc-500">待处理</span>
                    </>
                  ) : null}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
