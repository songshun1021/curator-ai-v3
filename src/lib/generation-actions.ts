import { sendMessage } from "@/lib/ai-engine";
import { dispatchReviewGenerated } from "@/lib/action-events";
import { buildContext, getResumeSourceDiagnostics, getResumeSourceReceipt, prewarmResumeSource } from "@/lib/context-builder";
import { db } from "@/lib/db";
import { createFile, fileExists, readFile, upsertFile } from "@/lib/file-system";
import { normalizeMarkdownOutput } from "@/lib/markdown-normalize";
import { useAppStore } from "@/store/app-store";
import { LlmConfig, ResumeData } from "@/types";

type JobDocType = "match" | "boss" | "email" | "custom-resume";
export type GenerationResult =
  | { ok: true; savedPath?: string; message?: string }
  | { ok: false; message: string; canceled?: boolean };

type MarkdownStructureRule = {
  headings?: string[];
  includes?: string[];
};

function getLlmConfig() {
  const raw = useAppStore.getState().llmConfig;
  if (!raw.model || !raw.baseURL || !raw.apiKey) {
    throw new Error("请先在 /AI配置/模型配置.json 中完成模型配置。");
  }
  return raw;
}

async function ensureResumeSourceAvailable(jobFolderPath?: string) {
  const diagnostics = await getResumeSourceDiagnostics(jobFolderPath);
  console.info("[resume-source]", diagnostics);
  if (diagnostics.hasAnyUsableSource) return;

  if (diagnostics.hasImportedPdf && diagnostics.hasResumeMarkdownDraft) {
    await useAppStore.getState().openFilePath("/简历/个人简历.md");
    if (diagnostics.resumeMarkdownState === "missing") {
      throw new Error("已导入个人简历 PDF，但个人简历.md 仍未生成。请先重新提取可复制文本，或手动补充 /简历/个人简历.md。");
    }
    throw new Error("已导入个人简历 PDF，但个人简历.md 仍是模板。请先补充 /简历/个人简历.md 后再继续。");
  }

  if (diagnostics.importedPdfDetectedButNotReadable) {
    await useAppStore.getState().openFilePath("/简历/个人简历.md");
    throw new Error("已导入个人简历 PDF，但还没有可用的个人简历.md。请先检查或补充 /简历/个人简历.md。");
  }

  await useAppStore.getState().openFilePath("/简历/主简历.json");
  throw new Error("未检测到可用简历来源。请先导入 PDF 简历或填写 /简历/主简历.json。");
}

function startGeneration(kind: string) {
  const controller = new AbortController();
  const store = useAppStore.getState();
  store.clearGenerationNotice();
  store.startGeneration(kind, controller);
  return controller;
}

function appendGenerating(chunk: string) {
  useAppStore.getState().appendGenerationChunk(chunk);
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as { name?: string }).name === "AbortError";
}

async function finishGeneration(status: "done" | "error", message?: string) {
  const store = useAppStore.getState();
  if (status === "error") {
    store.setGenerationError(message || "生成失败");
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  store.clearGeneration();
}

function toNameAndParent(path: string) {
  const parts = path.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? "";
  const parentPath = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
  return { name, parentPath };
}

async function writeFileByPath(path: string, contentType: "md" | "json", content: string, options?: { isSystem?: boolean }) {
  const { name, parentPath } = toNameAndParent(path);
  await upsertFile({
    path,
    name,
    parentPath,
    contentType,
    content,
    isGenerated: true,
    isSystem: options?.isSystem,
  });
}

async function addSystemNotice(content: string) {
  const threadId = useAppStore.getState().currentThreadId;
  if (!threadId) return;
  await db.chat_messages.add({
    id: crypto.randomUUID(),
    threadId,
    role: "system",
    content,
    timestamp: new Date().toISOString(),
  });
  await useAppStore.getState().loadMessages(threadId);
}

async function saveDraftOnAbort(path: string, contentType: "md" | "json", content: string) {
  const nextContent = contentType === "md" ? normalizeMarkdownOutput(content) : content.trim();
  if (!nextContent) {
    await finishGeneration("done");
    return;
  }

  await writeFileByPath(path, contentType, nextContent);
  const store = useAppStore.getState();
  await store.reloadTree();
  await store.openFilePath(path);
  store.setGenerationNotice(`已取消并保存草稿：${path}`, path);
  await addSystemNotice(`已取消并保存草稿：${path}`);
  await finishGeneration("done");
}

async function getJobMeta(jobFolderPath: string) {
  const metaFile = await readFile(`${jobFolderPath}/meta.json`);
  if (!metaFile) return null;
  try {
    return JSON.parse(metaFile.content) as { id?: string; company?: string; position?: string; resumeId?: string };
  } catch {
    return null;
  }
}

function getJobDocName(docType: Exclude<JobDocType, "custom-resume">) {
  if (docType === "match") return "匹配度分析";
  if (docType === "boss") return "BOSS招呼语";
  return "求职邮件";
}

function hasMarkdownCodeFence(content: string) {
  return /```|'''/.test(content);
}

function assertMarkdownStructure(label: string, content: string, rule: MarkdownStructureRule) {
  if (!content.trim()) {
    throw new Error(`${label}生成失败：模型返回内容为空，请重试。`);
  }

  if (hasMarkdownCodeFence(content)) {
    throw new Error(`${label}生成失败：输出包含代码块，不符合文件模板要求，请重新生成。`);
  }

  for (const heading of rule.headings ?? []) {
    if (!content.includes(heading)) {
      throw new Error(`${label}生成失败：缺少必需标题「${heading}」，未写入正式文件。`);
    }
  }

  for (const token of rule.includes ?? []) {
    if (!content.includes(token)) {
      throw new Error(`${label}生成失败：缺少关键结构「${token}」，未写入正式文件。`);
    }
  }
}

function validateJobMarkdown(docType: Exclude<JobDocType, "custom-resume">, output: string) {
  if (docType === "match") {
    assertMarkdownStructure("匹配分析", output, {
      headings: [
        "# 岗位匹配分析",
        "## 一、综合判断",
        "## 二、维度评分",
        "## 三、核心匹配证据",
        "## 四、主要风险与补强建议",
        "## 五、投递策略建议",
      ],
      includes: [],
    });

    const scoreTokens = ["**综合评分：**", "综合评分：", "评分："];
    const actionTokens = ["**建议动作：**", "建议动作：", "建议动作"];
    const tableTokens = [
      "| 维度 | 评分 | 依据 |",
      "| 维度 | 评分 | 说明 |",
      "| 维度 | 匹配度 | 依据 |",
    ];

    const warnings: string[] = [];
    if (!scoreTokens.some((token) => output.includes(token))) warnings.push("综合评分");
    if (!actionTokens.some((token) => output.includes(token))) warnings.push("建议动作");
    if (!tableTokens.some((token) => output.includes(token))) warnings.push("维度评分表");
    return warnings;
  }

  if (docType === "boss") {
    assertMarkdownStructure("BOSS招呼语", output, {
      headings: ["# BOSS招呼语"],
    });
    return [];
  }

  assertMarkdownStructure("求职邮件", output, {
    headings: ["# 求职邮件", "## 邮件主题", "## 邮件正文"],
  });
  return [];
}

function validatePrepMarkdown(output: string) {
  assertMarkdownStructure("面试准备包", output, {
    headings: [
      "# 面试准备包",
      "## 一、岗位核心能力拆解",
      "## 二、高频面试题",
      "## 三、简历追问预测",
      "## 四、薄弱点与补强计划",
      "## 五、历史复盘提醒",
      "## 六、面试前行动清单",
    ],
    includes: [],
  });

  const softSections = [
    "行动清单 checklist",
    "自我介绍与动机",
    "项目/实习深挖",
    "专业/业务能力",
    "行为面试",
    "反问面试官",
  ];

  const warnings = softSections.filter((section) => {
    if (section === "行动清单 checklist") {
      return !output.includes("- [ ] ") && !output.includes("- [ ]");
    }
    return !output.includes(section);
  });

  return warnings;
}

function validateReviewMarkdown(output: string) {
  assertMarkdownStructure("复盘报告", output, {
    headings: [
      "# 面试复盘报告",
      "## 一、总体评估",
      "## 二、逐题复盘",
      "## 三、知识盲区清单",
      "## 四、表达与结构问题",
      "## 五、改进行动清单",
      "## 六、下次面试前必看提醒",
      "## 七、亮点回顾",
    ],
    includes: [],
  });

  const scoreTokens = ["**综合评分：**", "综合评分：", "评分："];
  const ratingTokens = ["**总体评级：**", "总体评级：", "评级："];
  const firstQuestionTokens = ["### 问题 1：", "### 问题1：", "### 第一题：", "### 题目 1："];
  const actionTableTokens = ["| 优先级 | 行动项 | 完成标准 | 截止时间 |", "| 优先级 | 行动项 | 完成标准 |", "| 行动项 | 完成标准 |"];
  const checklistTokens = ["- [ ] ", "- [ ]"];

  const warnings: string[] = [];
  if (!scoreTokens.some((token) => output.includes(token))) warnings.push("综合评分");
  if (!ratingTokens.some((token) => output.includes(token))) warnings.push("总体评级");
  if (!firstQuestionTokens.some((token) => output.includes(token))) warnings.push("逐题复盘首题标题");
  if (!actionTableTokens.some((token) => output.includes(token))) warnings.push("改进行动清单表");
  if (!checklistTokens.some((token) => output.includes(token))) warnings.push("下次面试前必看提醒清单");

  return warnings;
}

function validateKnowledgeMarkdown(output: string) {
  assertMarkdownStructure("知识清单", output, {
    headings: ["# 知识清单", "## 必补知识", "## 可选复习", "## 术语与案例"],
    includes: ["- "],
  });
}

function validateMemorySummaryMarkdown(output: string) {
  assertMarkdownStructure("记忆摘要", output, {
    headings: ["# 记忆摘要提炼", "## 下次准备必须关注", "## 知识盲区", "## 表达与策略提醒"],
    includes: ["- "],
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function normalizeResumePayload(input: unknown): ResumeData {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const profile = src.profile && typeof src.profile === "object" ? (src.profile as Record<string, unknown>) : {};
  const skills = src.skills && typeof src.skills === "object" ? (src.skills as Record<string, unknown>) : {};

  return {
    id: typeof src.id === "string" && src.id.trim() ? src.id : "custom-resume",
    profile: {
      name: typeof profile.name === "string" ? profile.name : "",
      phone: typeof profile.phone === "string" ? profile.phone : "",
      email: typeof profile.email === "string" ? profile.email : "",
      wechat: typeof profile.wechat === "string" ? profile.wechat : "",
      targetRole: typeof profile.targetRole === "string" ? profile.targetRole : "",
    },
    education: Array.isArray(src.education)
      ? src.education.map((item) => {
          const edu = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            school: typeof edu.school === "string" ? edu.school : "",
            degree: typeof edu.degree === "string" ? edu.degree : "",
            major: typeof edu.major === "string" ? edu.major : "",
            startDate: typeof edu.startDate === "string" ? edu.startDate : "",
            endDate: typeof edu.endDate === "string" ? edu.endDate : "",
            gpa: typeof edu.gpa === "string" ? edu.gpa : "",
          };
        })
      : [],
    internships: Array.isArray(src.internships)
      ? src.internships.map((item) => {
          const internship = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            company: typeof internship.company === "string" ? internship.company : "",
            position: typeof internship.position === "string" ? internship.position : "",
            startDate: typeof internship.startDate === "string" ? internship.startDate : "",
            endDate: typeof internship.endDate === "string" ? internship.endDate : "",
            descriptions: normalizeStringArray(internship.descriptions),
          };
        })
      : [],
    campusExperience: Array.isArray(src.campusExperience)
      ? src.campusExperience.map((item) => {
          const campus = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            organization: typeof campus.organization === "string" ? campus.organization : "",
            role: typeof campus.role === "string" ? campus.role : "",
            startDate: typeof campus.startDate === "string" ? campus.startDate : "",
            endDate: typeof campus.endDate === "string" ? campus.endDate : "",
            descriptions: normalizeStringArray(campus.descriptions),
          };
        })
      : [],
    projects: Array.isArray(src.projects)
      ? src.projects.map((item) => {
          const project = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            name: typeof project.name === "string" ? project.name : "",
            role: typeof project.role === "string" ? project.role : "",
            descriptions: normalizeStringArray(project.descriptions),
            techStack: normalizeStringArray(project.techStack),
          };
        })
      : [],
    skills: {
      professional: normalizeStringArray(skills.professional),
      languages: normalizeStringArray(skills.languages),
      certificates: normalizeStringArray(skills.certificates),
      tools: normalizeStringArray(skills.tools),
    },
  };
}

function validateAndNormalizeCustomResume(output: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("定制简历生成失败：模型返回内容不是合法 JSON，请重新生成。");
  }
  const normalized = normalizeResumePayload(parsed);
  return JSON.stringify(normalized, null, 2);
}

function isMeaningfulProfile(profile: ResumeData["profile"]) {
  const values = [profile.name, profile.phone, profile.email, profile.wechat ?? "", profile.targetRole ?? ""];
  return values.filter((value) => value?.trim()).length >= 2;
}

function getCustomResumeWarnings(target: ResumeData, source?: ResumeData | null) {
  const warnings: string[] = [];
  const sourceHasEducation = (source?.education?.length ?? 0) > 0;
  const sourceHasInternships = (source?.internships?.length ?? 0) > 0;
  const sourceHasCampus = (source?.campusExperience?.length ?? 0) > 0;
  const sourceHasProjects = (source?.projects?.length ?? 0) > 0;
  const sourceHasSkills =
    (source?.skills?.professional?.length ?? 0) > 0 ||
    (source?.skills?.languages?.length ?? 0) > 0 ||
    (source?.skills?.certificates?.length ?? 0) > 0 ||
    (source?.skills?.tools?.length ?? 0) > 0;

  if (!isMeaningfulProfile(target.profile)) warnings.push("基础信息");
  if (sourceHasEducation && (target.education?.length ?? 0) === 0) warnings.push("教育经历");
  if (sourceHasInternships && (target.internships?.length ?? 0) === 0) warnings.push("实习经历");
  if (sourceHasCampus && (target.campusExperience?.length ?? 0) === 0) warnings.push("校园经历");
  if (sourceHasProjects && (target.projects?.length ?? 0) === 0) warnings.push("项目经历");

  const targetHasSkills =
    (target.skills?.professional?.length ?? 0) > 0 ||
    (target.skills?.languages?.length ?? 0) > 0 ||
    (target.skills?.certificates?.length ?? 0) > 0 ||
    (target.skills?.tools?.length ?? 0) > 0;
  if (sourceHasSkills && !targetHasSkills) warnings.push("技能");

  return warnings;
}

async function readResumeSourceForCustomResume(jobFolderPath: string) {
  const meta = await getJobMeta(jobFolderPath);
  const preferredPath = meta?.resumeId?.trim() || "/简历/主简历.json";
  const preferredFile = await readFile(preferredPath);
  if (preferredFile?.content?.trim()) {
    try {
      return {
        path: preferredPath,
        content: preferredFile.content,
        resume: normalizeResumePayload(JSON.parse(preferredFile.content)),
      };
    } catch {
      // ignore parse error and fall through
    }
  }

  if (preferredPath !== "/简历/主简历.json") {
    const fallback = await readFile("/简历/主简历.json");
    if (fallback?.content?.trim()) {
      try {
        return {
          path: "/简历/主简历.json",
          content: fallback.content,
          resume: normalizeResumePayload(JSON.parse(fallback.content)),
        };
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function generateJobDoc(jobFolderPath: string, docType: JobDocType): Promise<GenerationResult> {
  let controller: AbortController | null = null;
  let streamed = "";
  let savedPath = "";

  const kindLabelMap: Record<JobDocType, string> = {
    match: "匹配度分析",
    boss: "BOSS招呼语",
    email: "求职邮件",
    "custom-resume": "定制简历",
  };

  const instructionMap: Record<JobDocType, string> = {
    match:
      "请严格按固定 Markdown 模板输出匹配分析，必须完整包含这些标题：# 岗位匹配分析、## 一、综合判断、## 二、维度评分、## 三、核心匹配证据、## 四、主要风险与补强建议、## 五、投递策略建议。总体判断中必须包含综合评分与建议动作；维度评分部分必须给出评分表。允许使用自然变体，例如“综合评分：85/100”“建议动作：建议投递”。禁止输出代码块包裹，仅返回 Markdown 正文。",
    boss:
      "请严格按固定 Markdown 模板输出 BOSS 招呼语：先写 # BOSS招呼语，再只写一段 80-120 字正文，正文必须包含当前身份、2-3 个匹配点、表达沟通意愿。禁止输出代码块包裹，仅返回 Markdown 正文。",
    email:
      "请严格按固定 Markdown 模板输出求职邮件，必须完整包含 # 求职邮件、## 邮件主题、## 邮件正文 三个标题，并写出可直接发送的主题与正文。禁止输出代码块包裹，仅返回 Markdown 正文。",
    "custom-resume":
      "你必须仅输出一个合法 JSON 对象，字段结构与主简历一致。禁止任何解释、标题、Markdown 包裹。请基于主简历完整保留真实结构化信息，优先抽取与目标 JD 最相关的教育、实习、校园、项目与技能，不要只留下空壳 profile 或只保留学历字段。",
  };

  try {
    if (!(await fileExists(jobFolderPath))) {
      throw new Error(`岗位目录不存在：${jobFolderPath}`);
    }
    const config = getLlmConfig();
    await ensureResumeSourceAvailable(jobFolderPath);
    await prewarmResumeSource(jobFolderPath);
    const resumeSourceReceipt = await getResumeSourceReceipt(jobFolderPath);
    controller = startGeneration(kindLabelMap[docType]);

    const context = await buildContext({
      mode: "job-docs",
      jobFolderPath,
      userPrompt: instructionMap[docType],
    });
    const customResumeSource = docType === "custom-resume" ? await readResumeSourceForCustomResume(jobFolderPath) : null;
    if (docType === "custom-resume" && customResumeSource?.content) {
      context.messages.push({
        role: "user",
        content:
          `## 定制简历基准（${customResumeSource.path}）\n\n` +
          `下面是当前要裁剪和定制的结构化主简历 JSON。请优先保留其中真实存在的教育、实习、校园、项目和技能字段，不要只返回空壳字段。\n\n` +
          customResumeSource.content,
      });
    }

    const output = await sendMessage({
      ...config,
      provider: config.provider,
      messages: context.messages,
      signal: controller.signal,
      usageContext: "generation",
      usageLabel: kindLabelMap[docType],
      onChunk: (chunk) => {
        streamed += chunk;
        appendGenerating(chunk);
      },
    });

    if (docType === "custom-resume") {
      const meta = await getJobMeta(jobFolderPath);
      const company = meta?.company ?? "未知公司";
      const position = meta?.position ?? "未知岗位";
      const normalizedJson = validateAndNormalizeCustomResume(output);
      const normalizedResume = normalizeResumePayload(JSON.parse(normalizedJson));
      const sourceResume = customResumeSource?.resume ?? null;
      const customWarnings = getCustomResumeWarnings(normalizedResume, sourceResume);
      savedPath = `/简历/定制简历/${company}-${position}.json`;
      await writeFileByPath(savedPath, "json", normalizedJson);

      const store = useAppStore.getState();
      await store.reloadTree();
      await store.openFilePath(savedPath);
      store.setGenerationNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`, savedPath);
      await addSystemNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`);
      if (customWarnings.length > 0) {
        await addSystemNotice(`定制简历已保存，但内容仍偏空：${customWarnings.map((item) => `「${item}」`).join("、")}。建议检查主简历后重新生成。`);
      }
      await finishGeneration("done");
      return { ok: true, savedPath, message: `已保存到：${savedPath}` };
    } else {
      const fileName = `${getJobDocName(docType)}.md`;
      savedPath = `${jobFolderPath}/${fileName}`;
      const normalizedMd = normalizeMarkdownOutput(output);
      const markdownWarnings = validateJobMarkdown(docType, normalizedMd);
      await writeFileByPath(savedPath, "md", normalizedMd);

      const store = useAppStore.getState();
      await store.reloadTree();
      await store.openFilePath(savedPath);
      store.setGenerationNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`, savedPath);
      await addSystemNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`);
      if (markdownWarnings.length > 0) {
        await addSystemNotice(`${kindLabelMap[docType]}已保存，但模板不够完整：缺少 ${markdownWarnings.map((item) => `「${item}」`).join("、")}。建议补充后再继续使用。`);
      }
      await finishGeneration("done");
      return { ok: true, savedPath, message: `已保存到：${savedPath}` };
    }
  } catch (error) {
    if (isAbortError(error)) {
      const meta = await getJobMeta(jobFolderPath);
      const company = meta?.company ?? "未知公司";
      const position = meta?.position ?? "未知岗位";
      const draftPath =
        docType === "custom-resume"
          ? `/简历/定制简历/${company}-${position}.draft.json`
          : `${jobFolderPath}/${getJobDocName(docType as Exclude<JobDocType, "custom-resume">)}.draft.md`;
      await saveDraftOnAbort(draftPath, docType === "custom-resume" ? "json" : "md", streamed);
      return { ok: false, canceled: true, message: "已取消并保存草稿" };
    }

    const message = error instanceof Error ? error.message : "生成失败";
    if (controller) {
      await finishGeneration("error", message);
    }
    window.alert(message);
    return { ok: false, message };
  }
}

export async function generatePrepPack(jobFolderPath: string): Promise<GenerationResult> {
  let controller: AbortController | null = null;
  let streamed = "";
  let prepPath = "";

  try {
    const config = getLlmConfig();
    await ensureResumeSourceAvailable(jobFolderPath);
    await prewarmResumeSource(jobFolderPath);
    const resumeSourceReceipt = await getResumeSourceReceipt(jobFolderPath);
    controller = startGeneration("面试准备包");

    const context = await buildContext({
      mode: "prep-pack",
      jobFolderPath,
      userPrompt:
        "请严格按固定 Markdown 模板输出面试准备包，必须完整包含这些标题：# 面试准备包、## 一、岗位核心能力拆解、## 二、高频面试题、## 三、简历追问预测、## 四、薄弱点与补强计划、## 五、历史复盘提醒、## 六、面试前行动清单；高频面试题下必须覆盖“自我介绍与动机 / 项目实习深挖 / 专业业务能力 / 行为面试 / 反问面试官”。禁止输出代码块包裹，仅返回 Markdown 正文。",
    });

    const output = await sendMessage({
      ...config,
      provider: config.provider,
      messages: context.messages,
      signal: controller.signal,
      usageContext: "generation",
      usageLabel: "面试准备包",
      onChunk: (chunk) => {
        streamed += chunk;
        appendGenerating(chunk);
      },
    });

    const jobMeta = await getJobMeta(jobFolderPath);
    const company = jobMeta?.company ?? "未知公司";
    const position = jobMeta?.position ?? "未知岗位";
    const folderPath = `/面试准备包/${company}-${position}`;

    if (!(await fileExists(folderPath))) {
      await createFile({
        path: folderPath,
        name: `${company}-${position}`,
        type: "folder",
        contentType: "none",
        content: "",
        isSystem: false,
        isGenerated: true,
        parentPath: "/面试准备包",
        metadata: "{}",
      });
    }

    prepPath = `${folderPath}/准备包.md`;
    const normalizedPrep = normalizeMarkdownOutput(output);
    const prepWarnings = validatePrepMarkdown(normalizedPrep);

    await writeFileByPath(prepPath, "md", normalizedPrep);
    await writeFileByPath(
      `${folderPath}/meta.json`,
      "json",
      JSON.stringify(
        {
          jobId: jobMeta?.id ?? "",
          resumeId: jobMeta?.resumeId ?? "",
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    let secondaryWarning: string | null = null;
    try {
      const knowledge = await sendMessage({
        ...config,
        provider: config.provider,
        messages: [
          {
            role: "user",
            content: `请从以下准备包中提取知识清单，并严格按以下 Markdown 结构输出：\n# 知识清单\n\n## 必补知识\n- 条目\n\n## 可选复习\n- 条目\n\n## 术语与案例\n- 条目\n\n禁止输出代码块包裹，仅返回 Markdown 正文。\n\n${normalizedPrep}`,
          },
        ],
        signal: controller.signal,
        usageContext: "generation",
        usageLabel: "知识清单",
      });

      const normalizedKnowledge = normalizeMarkdownOutput(knowledge);
      validateKnowledgeMarkdown(normalizedKnowledge);
      await writeFileByPath(`${folderPath}/知识清单.md`, "md", normalizedKnowledge);
    } catch (secondaryError) {
      secondaryWarning =
        secondaryError instanceof Error
          ? `知识清单未能完整生成：${secondaryError.message}`
          : "知识清单未能完整生成，请稍后重试。";
    }

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(prepPath);
    store.setGenerationNotice(`已保存到：${prepPath}（本次已使用：${resumeSourceReceipt}）`, prepPath);
    await addSystemNotice(`已保存到：${prepPath}（本次已使用：${resumeSourceReceipt}）`);
    if (prepWarnings.length > 0) {
      await addSystemNotice(`面试准备包已保存，但模板不够完整：缺少 ${prepWarnings.map((item) => `「${item}」`).join("、")}。建议补充后再练习。`);
    }
    if (secondaryWarning) {
      await addSystemNotice(`面试准备包主文件已保存，但${secondaryWarning}`);
    }
    await finishGeneration("done");
    return { ok: true, savedPath: prepPath, message: `已保存到：${prepPath}` };
  } catch (error) {
    if (isAbortError(error)) {
      const jobMeta = await getJobMeta(jobFolderPath);
      const company = jobMeta?.company ?? "未知公司";
      const position = jobMeta?.position ?? "未知岗位";
      const folderPath = `/面试准备包/${company}-${position}`;

      if (streamed.trim() && !(await fileExists(folderPath))) {
        await createFile({
          path: folderPath,
          name: `${company}-${position}`,
          type: "folder",
          contentType: "none",
          content: "",
          isSystem: false,
          isGenerated: true,
          parentPath: "/面试准备包",
          metadata: "{}",
        });
      }

      await saveDraftOnAbort(`${folderPath}/准备包.draft.md`, "md", streamed);
      return { ok: false, canceled: true, message: "已取消并保存草稿" };
    }

    const message = error instanceof Error ? error.message : "生成失败";
    if (controller) {
      await finishGeneration("error", message);
    }
    window.alert(message);
    return { ok: false, message };
  }
}

export async function generateInterviewReview(interviewFolderPath: string): Promise<GenerationResult> {
  let controller: AbortController | null = null;
  let streamed = "";
  let reportPath = "";

  try {
    const config = getLlmConfig();
    const metaFile = await readFile(`${interviewFolderPath}/meta.json`);
    if (!metaFile) throw new Error("缺少面试 meta.json");

    const meta = JSON.parse(metaFile.content) as { jobFolderPath?: string; round?: string; company?: string; position?: string };
    const jobFolderPath = meta.jobFolderPath;
    if (!jobFolderPath) throw new Error("meta.json 缺少 jobFolderPath");
    await ensureResumeSourceAvailable(jobFolderPath);
    await prewarmResumeSource(jobFolderPath);
    const resumeSourceReceipt = await getResumeSourceReceipt(jobFolderPath);
    controller = startGeneration("复盘报告");

    const context = await buildContext({
      mode: "interview-review",
      jobFolderPath,
      interviewFolderPath,
      userPrompt:
        "请严格按固定 Markdown 模板输出复盘报告，必须完整包含这些标题：# 面试复盘报告、## 一、总体评估、## 二、逐题复盘、## 三、知识盲区清单、## 四、表达与结构问题、## 五、改进行动清单、## 六、下次面试前必看提醒、## 七、亮点回顾；总体评估必须给出综合评分和总体评级；逐题复盘至少写出 2 个问题。禁止输出代码块包裹，仅返回 Markdown 正文。",
    });

    const report = await sendMessage({
      ...config,
      provider: config.provider,
      messages: context.messages,
      signal: controller.signal,
      usageContext: "generation",
      usageLabel: "复盘报告",
      onChunk: (chunk) => {
        streamed += chunk;
        appendGenerating(chunk);
      },
    });

    reportPath = `${interviewFolderPath}/复盘报告.md`;
    const normalizedReport = normalizeMarkdownOutput(report);
    const reviewWarnings = validateReviewMarkdown(normalizedReport);
    await writeFileByPath(reportPath, "md", normalizedReport);

    let secondaryWarning: string | null = null;
    try {
      const summary = await sendMessage({
        ...config,
        provider: config.provider,
        messages: [
          { role: "system", content: "你是信息提取助手。" },
          {
            role: "user",
            content:
              `请从以下复盘报告中提取能反哺下一轮面试准备的要点，并严格按以下 Markdown 结构输出：\n# 记忆摘要提炼\n\n## 下次准备必须关注\n- 条目\n\n## 知识盲区\n- 条目\n\n## 表达与策略提醒\n- 条目\n\n禁止输出代码块包裹，仅返回 Markdown 正文。\n\n${normalizedReport}`,
          },
        ],
        signal: controller.signal,
        usageContext: "generation",
        usageLabel: "记忆摘要",
      });

      const normalizedSummary = normalizeMarkdownOutput(summary);
      validateMemorySummaryMarkdown(normalizedSummary);

      dispatchReviewGenerated({
        interviewFolderPath,
        jobFolderPath,
        summary: normalizedSummary,
      });

      const memoryFile = await readFile("/AI配置/记忆摘要.md");
      const date = new Date().toISOString().slice(0, 10);
      const sectionTitle = `\n\n---\n\n## ${date} - ${meta.company ?? "未知公司"}-${meta.position ?? "未知岗位"} ${meta.round ?? ""}\n\n`;
      const merged = `${memoryFile?.content ?? "# 记忆摘要"}${sectionTitle}${normalizedSummary}`;
      await writeFileByPath("/AI配置/记忆摘要.md", "md", merged, { isSystem: true });
    } catch (secondaryError) {
      secondaryWarning =
        secondaryError instanceof Error
          ? `记忆摘要未能完整更新：${secondaryError.message}`
          : "记忆摘要未能完整更新，请稍后重试。";
    }

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(reportPath);
    store.setGenerationNotice(`已保存到：${reportPath}（本次已使用：${resumeSourceReceipt}）`, reportPath);
    await addSystemNotice(`已保存到：${reportPath}（本次已使用：${resumeSourceReceipt}）`);
    if (reviewWarnings.length > 0) {
      await addSystemNotice(`复盘报告已保存，但模板不够完整：缺少 ${reviewWarnings.map((item) => `「${item}」`).join("、")}。建议补充后再复习。`);
    }
    if (secondaryWarning) {
      await addSystemNotice(`复盘报告主文件已保存，但${secondaryWarning}`);
    }

    const threadId = store.currentThreadId;
    if (threadId && !secondaryWarning) {
      await db.chat_messages.add({
        id: crypto.randomUUID(),
        threadId,
        role: "system",
        content: "复盘要点已写入记忆摘要，会在下次面试准备中自动参考。",
        timestamp: new Date().toISOString(),
      });
      await store.loadMessages(threadId);
    }

    await finishGeneration("done");
    return { ok: true, savedPath: reportPath, message: `已保存到：${reportPath}` };
  } catch (error) {
    if (isAbortError(error)) {
      await saveDraftOnAbort(`${interviewFolderPath}/复盘报告.draft.md`, "md", streamed);
      return { ok: false, canceled: true, message: "已取消并保存草稿" };
    }

    const message = error instanceof Error ? error.message : "生成失败";
    if (controller) {
      await finishGeneration("error", message);
    }
    window.alert(message);
    return { ok: false, message };
  }
}
