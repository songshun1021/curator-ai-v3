import { pickLatestInterviewRound } from "@/lib/interview-paths";
import { canUseAnyLlm } from "@/lib/llm-access";
import {
  getResumeMarkdownState,
  isResumeContentMeaningful,
  parseResumeMarkdownMetadata,
  RESUME_LEGACY_EXTRACT_PATH,
  RESUME_MAIN_JSON_PATH,
  RESUME_MARKDOWN_PATH,
  RESUME_PDF_PATH,
} from "@/lib/resume-import";
import { isHiddenSystemPath } from "@/lib/system-files";
import { LlmConfig, TrialStatus, VirtualFile } from "@/types";

export const JOB_ROOT = "/岗位";
export const PREP_ROOT = "/面试准备包";
export const REVIEW_ROOT = "/面试复盘";
export const JOB_CREATE_FORM_PATH = `${JOB_ROOT}/_新建岗位.json`;
export const MODEL_CONFIG_PATH = "/AI配置/模型配置.json";

type ReadinessMap = Record<string, VirtualFile>;

export type WorkspaceReadiness = {
  hasAvailableLlm: boolean;
  hasMainResume: boolean;
  hasResumeSource: boolean;
  hasAnyJob: boolean;
  hasJobWithJd: boolean;
  latestJobPath: string | null;
  shouldShowLaunchpad: boolean;
};

export type WorkspaceGuideState = {
  hasMainResume: boolean;
  hasImportedPdf: boolean;
  hasImportedExtract: boolean;
  latestJobPath: string | null;
  hasJob: boolean;
  hasJd: boolean;
  latestPrepPackPath: string | null;
  hasPrep: boolean;
  latestInterviewPath: string | null;
  hasInterviewText: boolean;
  latestReviewPath: string | null;
  hasReview: boolean;
};

export type WorkspaceGuideStep = {
  id: "resume" | "job" | "prep" | "review";
  title: string;
  description: string;
  actionLabel: string;
  done: boolean;
};

const JD_PLACEHOLDER_LINES = new Set([
  "# jd",
  "请粘贴岗位描述。",
  "请粘贴岗位描述原文",
]);

function normalizeLine(line: string) {
  return line.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasReadableResumeMarkdown(fileCache: ReadinessMap) {
  const resumeMarkdown = fileCache[RESUME_MARKDOWN_PATH] ?? fileCache[RESUME_LEGACY_EXTRACT_PATH];
  const metadata = parseResumeMarkdownMetadata(resumeMarkdown);
  const state = getResumeMarkdownState(resumeMarkdown?.content, metadata);
  return state === "usable" || state === "low";
}

function getLatestFilePath(files: VirtualFile[], predicate: (file: VirtualFile) => boolean) {
  return files
    .filter((file) => file.type === "file" && predicate(file))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]?.path ?? null;
}

export function getRealJobFolders(files: VirtualFile[]) {
  return files
    .filter((file) => file.type === "folder" && file.parentPath === JOB_ROOT)
    .filter((file) => !file.isSystem && !isHiddenSystemPath(file.path))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getLatestRealJobFolder(files: VirtualFile[]) {
  return getRealJobFolders(files)[0] ?? null;
}

function hasAnyRealJobWithMeaningfulJd(fileCache: ReadinessMap) {
  return getRealJobFolders(Object.values(fileCache)).some((folder) => hasMeaningfulJd(fileCache[`${folder.path}/jd.md`]?.content));
}

export function hasMeaningfulJd(content: string | null | undefined) {
  if (!content?.trim()) return false;

  const meaningfulLines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !JD_PLACEHOLDER_LINES.has(normalizeLine(line)));

  if (meaningfulLines.length === 0) return false;

  const meaningfulText = meaningfulLines.join(" ").replace(/\s+/g, "");
  return meaningfulText.length >= 12;
}

export function getWorkspaceGuideState(fileCache: ReadinessMap): WorkspaceGuideState {
  const files = Object.values(fileCache);
  const latestJob = getLatestRealJobFolder(files);
  const latestInterview = pickLatestInterviewRound(files);
  const latestPrepPackPath = getLatestFilePath(
    files,
    (file) => file.path.startsWith(`${PREP_ROOT}/`) && file.path.endsWith("/准备包.md"),
  );
  const latestReviewPath = getLatestFilePath(
    files,
    (file) => file.path.startsWith(`${REVIEW_ROOT}/`) && file.path.endsWith("/复盘报告.md"),
  );

  const latestInterviewTranscript = latestInterview ? fileCache[`${latestInterview.path}/面试原文.md`] : null;
  const hasInterviewText = Boolean(
    latestInterviewTranscript?.content
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line !== "# 面试原文")
      .filter((line) => !line.includes("请将面试听写文本粘贴到下方"))
      .filter((line) => !line.includes("尽量按问答格式整理")).length,
  );

  const latestJobJd = latestJob ? fileCache[`${latestJob.path}/jd.md`] : null;

  return {
    hasMainResume: Boolean(
      fileCache[RESUME_MAIN_JSON_PATH]?.content && isResumeContentMeaningful(fileCache[RESUME_MAIN_JSON_PATH].content),
    ),
    hasImportedPdf: Boolean(fileCache[RESUME_PDF_PATH]?.content.trim()),
    hasImportedExtract: hasReadableResumeMarkdown(fileCache),
    latestJobPath: latestJob?.path ?? null,
    hasJob: Boolean(latestJob),
    hasJd: hasMeaningfulJd(latestJobJd?.content),
    latestPrepPackPath,
    hasPrep: Boolean(latestPrepPackPath),
    latestInterviewPath: latestInterview?.path ?? null,
    hasInterviewText,
    latestReviewPath,
    hasReview: Boolean(latestReviewPath),
  };
}

export function getWorkspaceGuideSteps(guideState: WorkspaceGuideState): WorkspaceGuideStep[] {
  return [
    {
      id: "resume",
      title: "个人简历导入",
      description: "先让简历进入可用状态。",
      actionLabel: "打开简历",
      done: guideState.hasImportedExtract || guideState.hasMainResume,
    },
    {
      id: "job",
      title: "岗位 JD 输入",
      description: "补齐目标岗位的 JD。",
      actionLabel: "填写 JD",
      done: guideState.hasJob && guideState.hasJd,
    },
    {
      id: "prep",
      title: "面试准备包生成",
      description: "先拿到题单和行动清单。",
      actionLabel: "生成准备包",
      done: guideState.hasPrep,
    },
    {
      id: "review",
      title: "面试复盘",
      description: "沉淀下一轮的改进点。",
      actionLabel: guideState.hasInterviewText ? "生成复盘" : "处理复盘",
      done: guideState.hasReview,
    },
  ];
}

export function getWorkspaceReadiness(
  fileCache: ReadinessMap,
  llmConfig: LlmConfig,
  trialStatus: TrialStatus | null,
): WorkspaceReadiness {
  const guideState = getWorkspaceGuideState(fileCache);
  const hasMainResume = guideState.hasMainResume;
  const hasResumeSource = hasMainResume || guideState.hasImportedExtract;
  const hasAvailableLlm = canUseAnyLlm(llmConfig, trialStatus);

  return {
    hasAvailableLlm,
    hasMainResume,
    hasResumeSource,
    hasAnyJob: guideState.hasJob,
    hasJobWithJd: hasAnyRealJobWithMeaningfulJd(fileCache),
    latestJobPath: guideState.latestJobPath,
    shouldShowLaunchpad: !(hasMainResume && guideState.hasJd),
  };
}
