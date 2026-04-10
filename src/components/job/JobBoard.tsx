"use client";

import { useEffect, useMemo, useState } from "react";
import { generateInterviewReview, generateJobDoc, generatePrepPack } from "@/lib/generation-actions";
import { readFile, upsertFile } from "@/lib/file-system";
import { pickLatestInterviewRound } from "@/lib/interview-paths";
import { createInterviewRecord } from "@/lib/workspace-actions";
import { useAppStore } from "@/store/app-store";
import { JobMeta, ResumeData, VirtualFile } from "@/types";
import { ReviewGeneratedDetail } from "@/lib/action-events";

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
  const resumeFile = fileCache["/简历/主简历.json"];
  if (!resumeFile) {
    actions.push({
      id: "resume-missing",
      title: "先完善主简历",
      description: "主简历是后续匹配分析和准备包的基础。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
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
      description: "姓名、手机号、邮箱是投递必填项。",
      source: "resume",
      priority: 1,
      status: "pending",
      actionType: "open_resume",
    });
  }

  const hasExp = (resume.internships?.length ?? 0) + (resume.projects?.length ?? 0) + (resume.campusExperience?.length ?? 0) > 0;
  if (!hasExp) {
    actions.push({
      id: "resume-experience",
      title: "补充至少一段经历",
      description: "建议先补一段项目或实习经历，便于生成匹配分析。",
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
  const folders = Object.values(fileCache).filter((f) => f.type === "folder" && f.parentPath === "/岗位");

  for (const folder of folders) {
    const meta = parseJson<JobMeta>(fileCache[`${folder.path}/meta.json`]);
    const jd = fileCache[`${folder.path}/jd.md`];

    if (!jd || !jd.content.trim()) {
      actions.push({
        id: `job-jd-${folder.path}`,
        title: "先录入岗位 JD",
        description: `${folder.name} 缺少 JD 内容，无法进行生成。`,
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
        title: `为 ${company}-${position} 生成面试准备包`,
        description: "你新增了岗位，下一步建议先生成准备包。",
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
      description: "快速确认简历与 JD 的匹配度并找差距。",
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
    title: `根据复盘补强：${line.slice(0, 24)}`,
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
    const importedExtract = fileCache["/简历/个人简历.提取.md"];

    const latestJob = getLatestFolder(files, "/岗位");
    const latestInterview = pickLatestInterviewRound(files);

    const hasJob = Boolean(latestJob);
    const hasJd = hasJob ? Boolean(fileCache[`${latestJob!.path}/jd.md`]?.content.trim()) : false;
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
        const ok = await openFilePath(`${item.jobFolderPath}/jd.md`);
        if (!ok) throw new Error("JD 文件不存在");
      } else if (item.actionType === "generate_prep_pack") {
        if (!item.jobFolderPath) throw new Error("缺少岗位路径");
        await generatePrepPack(item.jobFolderPath);
      } else if (item.actionType === "generate_review") {
        if (!item.interviewFolderPath) throw new Error("缺少复盘路径");
        await generateInterviewReview(item.interviewFolderPath);
      } else if (item.actionType === "generate_job_doc") {
        if (!item.jobFolderPath) throw new Error("缺少岗位路径");
        await generateJobDoc(item.jobFolderPath, item.payload?.docType ?? "match");
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
      title: "第 1 步：新建/导入简历",
      desc: "你可以二选一：导入 PDF 简历，或手动填写 /简历/主简历.json。后续生成会自动优先参考导入简历文本。",
      done: guideState.hasImportedExtract || guideState.hasMainResume,
      action: async () => runActionItem({ id: "guide-open-resume", title: "", description: "", source: "resume", priority: 1, status: "pending", actionType: "open_resume" }),
      actionLabel: "立即去做",
    },
    {
      id: "guide-step-2",
      title: "第 2 步：新建岗位并录入 JD",
      desc: "新建岗位后在岗位目录填写 jd.md，后续匹配分析与准备包都会基于 JD 生成。",
      done: guideState.hasJob && guideState.hasJd,
      action: openOrCreateJobForm,
      actionLabel: "立即去做",
    },
    {
      id: "guide-step-3",
      title: "第 3 步：生成面试准备包",
      desc: "在岗位目录点击“生成面试准备包”，得到高频题、追问点和行动清单。",
      done: guideState.hasPrep,
      action: async () => {
        if (!guideState.latestJob) return openOrCreateJobForm();
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
      actionLabel: "立即去做",
    },
    {
      id: "guide-step-4",
      title: "第 4 步：录入面试原文",
      desc: "每次面试后将问答原文粘贴到 /面试复盘/{公司-岗位}/{轮次}/面试原文.md，复盘质量会明显提升。",
      done: guideState.hasInterviewText,
      action: async () => {
        if (guideState.latestInterview) {
          const ok = await openFilePath(`${guideState.latestInterview.path}/面试原文.md`);
          if (ok) return;
        }
        if (!guideState.latestJob) return openOrCreateJobForm();
        await createInterviewRecord(guideState.latestJob.path, "一面");
      },
      actionLabel: "立即去做",
    },
    {
      id: "guide-step-5",
      title: "第 5 步：生成面试复盘",
      desc: "录入原文后点击“生成复盘报告”，系统会沉淀行动项并反哺下一次准备包。",
      done: guideState.hasReview,
      action: async () => {
        if (!guideState.latestInterview) {
          if (!guideState.latestJob) return openOrCreateJobForm();
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
      actionLabel: "立即去做",
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
    <div className="h-full overflow-auto p-3">
      {shouldShowGuideCard ? (
        <div className="mb-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">新手使用指引</h3>
            <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => setGuideCollapsed((v) => !v)}>
              {guideCollapsed ? "展开" : "收起"}
            </button>
          </div>
          {!guideCollapsed ? (
            <div className="mt-2 space-y-2">
              {guideSteps.map((step) => (
                <div key={step.id} className="rounded border border-zinc-200 p-2 dark:border-zinc-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">{step.title}</div>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${step.done ? "text-emerald-600" : "text-amber-600"}`}>
                      {step.done ? "已完成" : "待执行"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">{step.desc}</div>
                  <div className="mt-2">
                    <button
                      type="button"
                      disabled={Boolean(runningActionId)}
                      className="rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void step.action()}
                    >
                      {step.actionLabel}
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
            className="rounded border px-2 py-1 text-xs text-zinc-600"
            onClick={() => {
              setGuideForceShow(true);
              setGuideCollapsed(false);
            }}
          >
            重新查看指引
          </button>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">下一步行动</h3>
        <span className="text-xs text-zinc-500">{actions.length} 项</span>
      </div>

      {actions.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700">
          当前没有待办行动。你可以先新建岗位并录入 JD。
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={Boolean(runningActionId)}
              className="w-full rounded-md border border-zinc-200 bg-white p-3 text-left transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              onClick={() => void runActionItem(item)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{item.title}</div>
                <span className="rounded border px-1.5 py-0.5 text-[10px] text-zinc-500">{SOURCE_LABEL[item.source]}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{item.description}</div>
              <div className="mt-2 text-[11px]">
                {item.status === "running" ? <span className="text-blue-600">执行中...</span> : null}
                {item.status === "done" ? <span className="text-emerald-600">已完成</span> : null}
                {item.status === "error" ? <span className="text-red-600">{errorById[item.id] ?? "执行失败"}</span> : null}
                {item.status === "pending" ? <span className="text-zinc-500">点击后立即执行</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
