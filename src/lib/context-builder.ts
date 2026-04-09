import { readFile } from "@/lib/file-system";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";
import { BuiltContext, ContextMode } from "@/types";

function makeUserBlock(title: string, content: string) {
  return `## ${title}\n\n${content || "(空)"}`;
}

async function readSystemContent(primaryPath: string, legacyPath?: string) {
  const current = await readFile(primaryPath);
  if (current?.content) return current.content;
  if (!legacyPath) return "";
  return (await readFile(legacyPath))?.content ?? "";
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
        content: makeUserBlock(`当前文件: ${current.path}`, current.content),
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
    if (jd) messages.push({ role: "user", content: makeUserBlock("JD原文", jd.content) });
    if (meta) messages.push({ role: "user", content: makeUserBlock("岗位元信息", meta.content) });

    let resumePath = "/简历/主简历.json";
    if (meta) {
      try {
        const parsed = JSON.parse(meta.content) as { resumeId?: string };
        if (typeof parsed.resumeId === "string" && parsed.resumeId.trim()) {
          resumePath = parsed.resumeId.trim();
        }
      } catch {
        // ignore parse error and keep fallback path
      }
    }
    let resumeFile = await readFile(resumePath);
    if (!resumeFile && resumePath !== "/简历/主简历.json") {
      resumeFile = await readFile("/简历/主简历.json");
    }
    if (resumeFile) {
      messages.push({
        role: "user",
        content: makeUserBlock(`绑定简历: ${resumeFile.path}`, resumeFile.content),
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
  }

  if (args.mode === "resume-polish") {
    const resumePrompt = await readSystemContent(SYSTEM_FILE_PATHS.resume.prompt, SYSTEM_FILE_PATHS.resume.legacyPrompt);
    const resumeAgent = await readSystemContent(SYSTEM_FILE_PATHS.resume.agent, SYSTEM_FILE_PATHS.resume.legacyAgent);
    if (resumePrompt) messages.push({ role: "user", content: makeUserBlock("简历润色规则", resumePrompt) });
    if (resumeAgent) messages.push({ role: "user", content: makeUserBlock("简历执行策略", resumeAgent) });
  }

  if (args.userPrompt) {
    messages.push({ role: "user", content: args.userPrompt });
  }

  return { messages };
}
