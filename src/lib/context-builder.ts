import { readFile } from "@/lib/file-system";
import {
  ensureResumeMarkdownFromLegacy,
  getResumeMarkdownState,
  parseResumeMarkdownMetadata,
  RESUME_LEGACY_EXTRACT_PATH,
  RESUME_MAIN_JSON_PATH,
  RESUME_MARKDOWN_PATH,
  RESUME_PDF_PATH,
  type ResumeMarkdownState,
} from "@/lib/resume-import";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";
import { BuiltContext, ContextMode } from "@/types";

function hasStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyStringArray(value: unknown) {
  return Array.isArray(value) && value.some((item) => hasStringValue(item));
}

function isUsableResumeJsonContent(content: string) {
  if (!content.trim()) return false;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const profile = (parsed.profile ?? {}) as Record<string, unknown>;

    const hasProfile =
      hasStringValue(profile.name) ||
      hasStringValue(profile.phone) ||
      hasStringValue(profile.email) ||
      hasStringValue(profile.wechat) ||
      hasStringValue(profile.targetRole);

    const hasSections =
      (Array.isArray(parsed.education) && parsed.education.length > 0) ||
      (Array.isArray(parsed.internships) && parsed.internships.length > 0) ||
      (Array.isArray(parsed.projects) && parsed.projects.length > 0) ||
      (Array.isArray(parsed.campusExperience) && parsed.campusExperience.length > 0);

    const skills = (parsed.skills ?? {}) as Record<string, unknown>;
    const hasSkills =
      hasNonEmptyStringArray(skills.professional) ||
      hasNonEmptyStringArray(skills.languages) ||
      hasNonEmptyStringArray(skills.certificates) ||
      hasNonEmptyStringArray(skills.tools);

    return hasProfile || hasSections || hasSkills;
  } catch {
    return false;
  }
}

function makeUserBlock(title: string, content: string) {
  return `## ${title}\n\n${content || "(空)"}`;
}

async function readSystemContent(primaryPath: string, legacyPath?: string) {
  const current = await readFile(primaryPath);
  if (current?.content) return current.content;
  if (!legacyPath) return "";
  return (await readFile(legacyPath))?.content ?? "";
}

async function resolveRequestedResumePath(jobMetaContent?: string) {
  if (!jobMetaContent) return RESUME_MAIN_JSON_PATH;
  try {
    const parsed = JSON.parse(jobMetaContent) as { resumeId?: string };
    if (typeof parsed.resumeId === "string" && parsed.resumeId.trim()) {
      return parsed.resumeId.trim();
    }
  } catch {
    // ignore parse error
  }
  return RESUME_MAIN_JSON_PATH;
}

async function buildResumeBlocks(jobMetaContent?: string) {
  const requestedResumePath = await resolveRequestedResumePath(jobMetaContent);
  let resumePath = requestedResumePath;
  let resumeFile = await readFile(requestedResumePath);
  const requestedUsableStructured = Boolean(resumeFile?.content && isUsableResumeJsonContent(resumeFile.content));

  if (!requestedUsableStructured && requestedResumePath !== RESUME_MAIN_JSON_PATH) {
    const mainResumeFile = await readFile(RESUME_MAIN_JSON_PATH);
    if (mainResumeFile?.content && isUsableResumeJsonContent(mainResumeFile.content)) {
      resumePath = RESUME_MAIN_JSON_PATH;
      resumeFile = mainResumeFile;
    }
  }

  await ensureResumeMarkdownFromLegacy();
  const resumeMdFile = (await readFile(RESUME_MARKDOWN_PATH)) ?? (await readFile(RESUME_LEGACY_EXTRACT_PATH));
  const importedResumePdf = await readFile(RESUME_PDF_PATH);

  return {
    requestedResumePath,
    resumePath,
    resumeFile,
    resumeMdFile,
    importedResumePdf,
  };
}

export type ResumeSourceDiagnostics = {
  resumePath: string;
  hasImportedPdf: boolean;
  resumeMarkdownState: ResumeMarkdownState;
  resumeMarkdownChannel: "server" | "template" | "unknown";
  resumeMarkdownExtractor: "pdfjs" | "markitdown" | "none";
  hasUsableResumeMarkdown: boolean;
  hasLowQualityResumeMarkdown: boolean;
  hasResumeMarkdownDraft: boolean;
  hasUsableStructuredResume: boolean;
  hasAnyUsableSource: boolean;
  importedPdfDetectedButNotReadable: boolean;
  activeResumeSource: "bound-json" | "resume-markdown" | "resume-markdown-low" | "main-json" | "none";
};

export async function getResumeSourceDiagnostics(jobFolderPath?: string): Promise<ResumeSourceDiagnostics> {
  const metaFile = jobFolderPath ? await readFile(`${jobFolderPath}/meta.json`) : undefined;
  const { requestedResumePath, resumePath, resumeFile, resumeMdFile, importedResumePdf } = await buildResumeBlocks(metaFile?.content);

  const resumeMarkdownState = getResumeMarkdownState(resumeMdFile?.content);
  const resumeMarkdownMetadata = parseResumeMarkdownMetadata(resumeMdFile);
  const hasUsableResumeMarkdown = resumeMarkdownState === "usable" || resumeMarkdownState === "low";
  const hasLowQualityResumeMarkdown = resumeMarkdownState === "low";
  const hasResumeMarkdownDraft = resumeMarkdownState === "draft" || resumeMarkdownState === "missing";
  const hasImportedPdf = Boolean(importedResumePdf?.content.trim());
  const hasUsableStructuredResume = Boolean(resumeFile?.content && isUsableResumeJsonContent(resumeFile.content));
  const hasAnyUsableSource = hasUsableResumeMarkdown || hasUsableStructuredResume;

  let activeResumeSource: ResumeSourceDiagnostics["activeResumeSource"] = "none";
  if (requestedResumePath !== RESUME_MAIN_JSON_PATH && resumePath === requestedResumePath && hasUsableStructuredResume) {
    activeResumeSource = "bound-json";
  } else if (resumeMarkdownState === "usable") {
    activeResumeSource = "resume-markdown";
  } else if (resumeMarkdownState === "low") {
    activeResumeSource = "resume-markdown-low";
  } else if (hasUsableStructuredResume) {
    activeResumeSource = "main-json";
  }

  return {
    resumePath,
    hasImportedPdf,
    resumeMarkdownState,
    resumeMarkdownChannel: resumeMarkdownMetadata?.extractChannel ?? "unknown",
    resumeMarkdownExtractor: resumeMarkdownMetadata?.extractor ?? "none",
    hasUsableResumeMarkdown,
    hasLowQualityResumeMarkdown,
    hasResumeMarkdownDraft,
    hasUsableStructuredResume,
    hasAnyUsableSource,
    importedPdfDetectedButNotReadable: hasImportedPdf && resumeMarkdownState === "missing" && !hasUsableStructuredResume,
    activeResumeSource,
  };
}

export async function prewarmResumeSource(jobFolderPath?: string) {
  const diagnostics = await getResumeSourceDiagnostics(jobFolderPath);
  console.info("[resume-source]", diagnostics);
}

export async function hasAnyResumeSource(jobFolderPath?: string) {
  const diagnostics = await getResumeSourceDiagnostics(jobFolderPath);
  return diagnostics.hasAnyUsableSource;
}

export async function getResumeSourceReceipt(jobFolderPath?: string) {
  const diagnostics = await getResumeSourceDiagnostics(jobFolderPath);
  const { resumePath, activeResumeSource } = diagnostics;

  if (activeResumeSource === "bound-json") {
    return `绑定简历JSON（${resumePath}）`;
  }
  if (activeResumeSource === "resume-markdown") {
    if (diagnostics.resumeMarkdownExtractor === "pdfjs") return "个人简历.md（PDF 文本提取）";
    if (diagnostics.resumeMarkdownExtractor === "markitdown") return "个人简历.md（markitdown）";
    return "个人简历.md";
  }
  if (activeResumeSource === "resume-markdown-low") {
    if (diagnostics.resumeMarkdownExtractor === "pdfjs") return "个人简历.md（PDF 文本提取，信息较少）";
    if (diagnostics.resumeMarkdownExtractor === "markitdown") return "个人简历.md（信息较少）";
    return "个人简历.md（信息较少）";
  }
  if (activeResumeSource === "main-json") {
    return "主简历JSON";
  }
  if (diagnostics.hasImportedPdf && diagnostics.hasResumeMarkdownDraft) {
    return "已导入个人简历 PDF，但个人简历.md 仍需补充";
  }
  if (diagnostics.hasImportedPdf) {
    return "已导入个人简历 PDF，但尚未形成可用的个人简历.md";
  }
  return "未检测到可用简历来源";
}

function pushResumeEvidence(
  messages: BuiltContext["messages"],
  args: {
    requestedResumePath: string;
    resumePath: string;
    resumeFile?: { path: string; content: string } | null;
    resumeMdFile?: { path: string; content: string } | null;
  },
) {
  const markdownState = getResumeMarkdownState(args.resumeMdFile?.content);
  const hasUsableStructured = Boolean(args.resumeFile?.content?.trim() && isUsableResumeJsonContent(args.resumeFile.content));
  const hasBoundStructured =
    args.requestedResumePath !== RESUME_MAIN_JSON_PATH && args.resumePath === args.requestedResumePath && hasUsableStructured;

  if (hasBoundStructured) {
    messages.push({
      role: "user",
      content: makeUserBlock(`结构化简历（${args.resumeFile?.path || args.resumePath}）`, args.resumeFile?.content ?? ""),
    });
    return;
  }

  if (markdownState === "usable" || markdownState === "low") {
    messages.push({
      role: "user",
      content: makeUserBlock(`个人简历文本（${RESUME_MARKDOWN_PATH}）`, args.resumeMdFile?.content ?? ""),
    });
    if (markdownState === "low") {
      messages.push({
        role: "user",
        content: makeUserBlock(
          "简历证据说明",
          "当前个人简历文本较短，请基于已有事实生成，并明确指出信息有限的部分，不要编造经历或结果。",
        ),
      });
    }
    return;
  }

  if (hasUsableStructured) {
    messages.push({
      role: "user",
      content: makeUserBlock(`结构化简历（${args.resumeFile?.path || args.resumePath}）`, args.resumeFile?.content ?? ""),
    });
  }
}

export async function buildContext(args: {
  mode: ContextMode;
  currentFilePath?: string;
  jobFolderPath?: string;
  interviewFolderPath?: string;
  userPrompt?: string;
}): Promise<BuiltContext> {
  const systemPrompt =
    (await readSystemContent(SYSTEM_FILE_PATHS.global.prompt, SYSTEM_FILE_PATHS.global.legacyPrompt)) || "你是求职助手";
  const systemAgent = await readSystemContent(SYSTEM_FILE_PATHS.global.agent);

  const messages: BuiltContext["messages"] = [{ role: "system", content: systemPrompt }];
  if (systemAgent) {
    messages.push({ role: "user", content: makeUserBlock("系统执行策略", systemAgent) });
  }

  const memory = (await readFile("/AI配置/记忆摘要.md"))?.content ?? "";

  if (args.currentFilePath) {
    const current = await readFile(args.currentFilePath);
    if (current) {
      messages.push({
        role: "user",
        content: makeUserBlock(`当前文件（${current.path}）`, current.content),
      });
    }
  }

  if (args.jobFolderPath) {
    const jd = await readFile(`${args.jobFolderPath}/jd.md`);
    const meta = await readFile(`${args.jobFolderPath}/meta.json`);
    const jobPrompt = await readSystemContent(SYSTEM_FILE_PATHS.job.prompt, SYSTEM_FILE_PATHS.job.legacyPrompt);
    const jobAgent = await readSystemContent(SYSTEM_FILE_PATHS.job.agent, SYSTEM_FILE_PATHS.job.legacyAgent);

    if (jobPrompt) messages.push({ role: "user", content: makeUserBlock("岗位模块指令", jobPrompt) });
    if (jobAgent) messages.push({ role: "user", content: makeUserBlock("岗位模块执行策略", jobAgent) });
    if (jd) messages.push({ role: "user", content: makeUserBlock("JD 原文", jd.content) });
    if (meta) messages.push({ role: "user", content: makeUserBlock("岗位元信息", meta.content) });

    const resumeBlocks = await buildResumeBlocks(meta?.content);
    pushResumeEvidence(messages, resumeBlocks);
  }

  if (args.mode === "prep-pack") {
    const prepPrompt = await readSystemContent(SYSTEM_FILE_PATHS.prep.prompt, SYSTEM_FILE_PATHS.prep.legacyPrompt);
    const prepAgent = await readSystemContent(SYSTEM_FILE_PATHS.prep.agent, SYSTEM_FILE_PATHS.prep.legacyAgent);
    if (prepPrompt) messages.push({ role: "user", content: makeUserBlock("准备包模块指令", prepPrompt) });
    if (prepAgent) messages.push({ role: "user", content: makeUserBlock("准备包模块执行策略", prepAgent) });
    messages.push({ role: "user", content: makeUserBlock("记忆摘要", memory) });
  }

  if (args.mode === "interview-review") {
    const reviewPrompt = await readSystemContent(SYSTEM_FILE_PATHS.review.prompt, SYSTEM_FILE_PATHS.review.legacyPrompt);
    const reviewAgent = await readSystemContent(SYSTEM_FILE_PATHS.review.agent, SYSTEM_FILE_PATHS.review.legacyAgent);
    if (reviewPrompt) messages.push({ role: "user", content: makeUserBlock("复盘模块指令", reviewPrompt) });
    if (reviewAgent) messages.push({ role: "user", content: makeUserBlock("复盘模块执行策略", reviewAgent) });
    if (args.interviewFolderPath) {
      const interviewText = await readFile(`${args.interviewFolderPath}/面试原文.md`);
      if (interviewText) messages.push({ role: "user", content: makeUserBlock("面试原文", interviewText.content) });
    }
    messages.push({ role: "user", content: makeUserBlock("记忆摘要", memory) });
  }

  if (args.mode === "resume-polish") {
    const resumePrompt = await readSystemContent(SYSTEM_FILE_PATHS.resume.prompt, SYSTEM_FILE_PATHS.resume.legacyPrompt);
    const resumeAgent = await readSystemContent(SYSTEM_FILE_PATHS.resume.agent, SYSTEM_FILE_PATHS.resume.legacyAgent);
    if (resumePrompt) messages.push({ role: "user", content: makeUserBlock("简历模块指令", resumePrompt) });
    if (resumeAgent) messages.push({ role: "user", content: makeUserBlock("简历模块执行策略", resumeAgent) });
  }

  if (args.userPrompt) {
    messages.push({ role: "user", content: args.userPrompt });
  }

  return { messages };
}
