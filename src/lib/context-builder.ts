import { readFile } from "@/lib/file-system";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";
import { BuiltContext, ContextMode } from "@/types";

const MAIN_RESUME_PATH = "/简历/主简历.json";
const IMPORTED_RESUME_PDF_PATH = "/简历/个人简历.pdf";
const IMPORTED_RESUME_TEXT_PATH = "/简历/个人简历.提取.md";

function makeUserBlock(title: string, content: string) {
  return `## ${title}\n\n${content || "(空)"}`;
}

async function readSystemContent(primaryPath: string, legacyPath?: string) {
  const current = await readFile(primaryPath);
  if (current?.content) return current.content;
  if (!legacyPath) return "";
  return (await readFile(legacyPath))?.content ?? "";
}

async function buildResumeBlocks(jobMetaContent?: string) {
  let resumePath = MAIN_RESUME_PATH;
  if (jobMetaContent) {
    try {
      const parsed = JSON.parse(jobMetaContent) as { resumeId?: string };
      if (typeof parsed.resumeId === "string" && parsed.resumeId.trim()) {
        resumePath = parsed.resumeId.trim();
      }
    } catch {
      // fallback to main resume
    }
  }

  let resumeFile = await readFile(resumePath);
  if (!resumeFile && resumePath !== MAIN_RESUME_PATH) {
    resumeFile = await readFile(MAIN_RESUME_PATH);
  }

  const importedResumeText = await readFile(IMPORTED_RESUME_TEXT_PATH);
  const importedResumePdf = await readFile(IMPORTED_RESUME_PDF_PATH);
  return {
    resumePath,
    resumeFile,
    importedResumeText,
    importedResumePdf,
  };
}

export async function hasAnyResumeSource(jobFolderPath?: string) {
  const importedExtract = await readFile(IMPORTED_RESUME_TEXT_PATH);
  if (importedExtract?.content.trim()) return true;

  if (jobFolderPath) {
    const metaFile = await readFile(`${jobFolderPath}/meta.json`);
    const { resumeFile } = await buildResumeBlocks(metaFile?.content);
    if (resumeFile?.content.trim()) return true;
  }

  const mainResume = await readFile(MAIN_RESUME_PATH);
  return Boolean(mainResume?.content.trim());
}

export async function getResumeSourceReceipt(jobFolderPath?: string) {
  const metaFile = jobFolderPath ? await readFile(`${jobFolderPath}/meta.json`) : undefined;
  const { resumePath, resumeFile, importedResumeText, importedResumePdf } = await buildResumeBlocks(metaFile?.content);

  const hasStructuredResume = Boolean(resumeFile?.content.trim());
  const hasImportedExtract = Boolean(importedResumeText?.content.trim());
  const hasImportedPdf = Boolean(importedResumePdf?.content.trim());

  if (hasImportedExtract && hasStructuredResume) {
    return "导入简历提取文本（优先）+ 主简历JSON";
  }
  if (hasImportedExtract) {
    return "导入简历提取文本（优先）";
  }
  if (hasImportedPdf && hasStructuredResume) {
    return "导入PDF已保存，当前回退主简历JSON";
  }
  if (hasStructuredResume) {
    return resumePath === MAIN_RESUME_PATH ? "主简历JSON" : `绑定简历JSON（${resumePath}）`;
  }
  if (hasImportedPdf) {
    return "导入PDF已保存，但未提取到可用文本";
  }
  return "未检测到简历来源";
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

    const { resumePath, resumeFile, importedResumeText } = await buildResumeBlocks(meta?.content);
    if (resumeFile) {
      messages.push({
        role: "user",
        content: makeUserBlock(`结构化简历（${resumeFile.path || resumePath}）`, resumeFile.content),
      });
    }
    if (importedResumeText?.content) {
      messages.push({
        role: "user",
        content: makeUserBlock(`导入简历提取文本（${IMPORTED_RESUME_TEXT_PATH}）`, importedResumeText.content),
      });
    }
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
