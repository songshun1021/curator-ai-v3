import { sendMessage } from "@/lib/ai-engine";
import { dispatchReviewGenerated } from "@/lib/action-events";
import { analyzeCustomResumeFit } from "@/lib/custom-resume-analysis";
import { buildContext, getResumeSourceDiagnostics, getResumeSourceReceipt, prewarmResumeSource } from "@/lib/context-builder";
import { db } from "@/lib/db";
import { createFile, fileExists, readFile, upsertFile } from "@/lib/file-system";
import { createId } from "@/lib/id";
import {
  buildInterviewGrowthProfilePrompt,
  INTERVIEW_GROWTH_PROFILE_PATH,
  validateInterviewGrowthProfileMarkdown,
} from "@/lib/interview-growth";
import { normalizeMarkdownOutput } from "@/lib/markdown-normalize";
import {
  ensureResumeMarkdownFromLegacy,
  generateMainResumeFromMd,
  getResumeMarkdownState,
  isResumeContentMeaningful,
  parseResumeMarkdownMetadata,
  RESUME_MARKDOWN_PATH,
} from "@/lib/resume-import";
import { getInvalidUserApiConfigReason, shouldRefreshTrialStatusFromError } from "@/lib/llm-access";
import { useAppStore } from "@/store/app-store";
import { LlmConfig, ResumeData } from "@/types";
import {
  getSparseResumeWarnings,
  hasMeaningfulCampus,
  hasMeaningfulEducation,
  hasMeaningfulInternships,
  hasMeaningfulProjects,
  isMeaningfulProfile,
} from "@/lib/custom-resume-quality";

type JobDocType = "match" | "boss" | "email" | "custom-resume";
type ResumeSourcePurpose = "job-docs/default" | "job-docs/custom-resume" | "prep-pack" | "interview-review";
export type GenerationResult =
  | { ok: true; savedPath?: string; message?: string }
  | { ok: false; message: string; canceled?: boolean };

type CustomResumeValidationFailureReason = "invalid_json" | "schema_mismatch" | "content_regression";

class CustomResumeValidationError extends Error {
  reason: CustomResumeValidationFailureReason;
  preserveRawOutput: boolean;

  constructor(reason: CustomResumeValidationFailureReason, message: string, options?: { preserveRawOutput?: boolean }) {
    super(message);
    this.name = "CustomResumeValidationError";
    this.reason = reason;
    this.preserveRawOutput = options?.preserveRawOutput ?? false;
  }
}

type MarkdownStructureRule = {
  headings?: string[];
  includes?: string[];
};

function countMatches(content: string, pattern: RegExp) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function getLlmConfig() {
  const raw = useAppStore.getState().llmConfig;
  const trialStatus = useAppStore.getState().trialStatus;
  const invalidReason = getInvalidUserApiConfigReason(raw);
  if (invalidReason === "api_key_non_latin1") {
    throw new Error("当前 API Key 中包含中文或全角字符，请检查是否误填了说明文字、示例文本或其它非密钥内容。");
  }
  if (invalidReason === "missing" && !trialStatus?.trialEnabled) {
    throw new Error("请先在 /AI配置/模型配置.json 中完成模型配置。");
  }
  return raw;
}

async function ensureResumeSourceAvailable(
  jobFolderPath: string | undefined,
  purpose: ResumeSourcePurpose,
) {
  const diagnostics = await getResumeSourceDiagnostics(jobFolderPath);
  console.info("[resume-source]", diagnostics);
  const hasSourceForPurpose =
    purpose === "job-docs/custom-resume"
      ? diagnostics.hasUsableResumeMarkdown || diagnostics.hasUsableStructuredResume
      : diagnostics.hasAnyUsableSource;
  if (hasSourceForPurpose) return;

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
  throw new Error("未检测到可用简历来源。请先导入 PDF 并补全 /简历/个人简历.md，或直接填写 /简历/主简历.json。");
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
    id: createId(),
    threadId,
    role: "system",
    content,
    timestamp: new Date().toISOString(),
  });
  await useAppStore.getState().loadMessages(threadId);
}

async function updateInterviewGrowthProfile(args: {
  llmConfig: LlmConfig;
  reviewReport: string;
  existingProfile?: string;
  signal?: AbortSignal;
}) {
  const output = await sendMessage({
    ...args.llmConfig,
    provider: args.llmConfig.provider,
    messages: [
      {
        role: "user",
        content: buildInterviewGrowthProfilePrompt({
          reviewReport: args.reviewReport,
          existingProfile: args.existingProfile,
        }),
      },
    ],
    signal: args.signal,
    usageContext: "generation",
    usageLabel: "面试成长画像",
  });

  const normalized = normalizeMarkdownOutput(output);
  return validateInterviewGrowthProfileMarkdown(normalized);
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

function extractBossBody(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "# BOSS招呼语");
  return lines.join("\n");
}

function validateBossMarkdown(output: string) {
  const warnings: string[] = [];
  const body = extractBossBody(output);
  const bodyLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const compactBody = body.replace(/\s+/g, "");

  if (bodyLines.length !== 1) warnings.push("正文应保持单段");
  if (/^[-*•]|^\d+[.)、]/m.test(body)) warnings.push("不要写成列表或分点");
  if (/^>/m.test(body)) warnings.push("不要保留模板说明或引用块");
  if (compactBody.length < 55 || compactBody.length > 110) warnings.push("字数建议控制在 55-110 字");
  if (!/^(您好[，,]?)?(我是|我目前是|我现在是|我叫)/.test(bodyLines[0] ?? "")) warnings.push("开头缺少明确身份");
  if (!/(\d+(?:\.\d+)?%|\d+(?:个|段|次|场|篇|周|月|天)|实习|项目|活动|产品|运营|增长|用户|数据|调研|分析|策划|转化|内容|校园)/.test(body)) {
    warnings.push("缺少具体经历或结果锚点");
  }
  if (!/(想和您聊聊|想进一步沟通|方便的话.*沟通|若岗位仍在招聘.*想进一步沟通|想投递该岗位|想进一步了解)/.test(body)) {
    warnings.push("结尾缺少自然沟通动作");
  }

  const aiTonePatterns: Array<[RegExp, string]> = [
    [/认真阅读了.*JD/, "出现“认真阅读了 JD”模板腔"],
    [/了解到.*岗位/, "出现“了解到岗位”模板腔"],
    [/非常荣幸|十分希望|真诚期待/, "礼貌套话偏重"],
    [/具备较强的学习能力(?:和沟通能力)?|具备良好的沟通能力/, "空泛自夸较多"],
    [/您好[，,]?(?:我想应聘|冒昧打扰)/, "开头像通用投递模板"],
    [/若有机会|如果有机会/, "结尾偏模板化"],
  ];

  for (const [pattern, label] of aiTonePatterns) {
    if (pattern.test(body)) warnings.push(label);
  }

  return warnings;
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
    if (countMatches(output, /^## /gm) < 5) warnings.push("章节展开不足");
    if (output.length < 420) warnings.push("内容偏短");
    if (!/风险|补强|差距|短板/.test(output)) warnings.push("风险与补强信息偏弱");
    return warnings;
  }

  if (docType === "boss") {
    assertMarkdownStructure("BOSS招呼语", output, {
      headings: ["# BOSS招呼语"],
    });
    return validateBossMarkdown(output);
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
      "## 先看这 5 分钟",
      "## 一、岗位高概率提问地图",
      "## 二、重点题回答框架",
      "## 三、重点题完整回答示例",
      "## 四、简历追问预测",
      "## 五、当前短板与避坑提醒",
      "## 六、面试前行动清单",
    ],
    includes: [],
  });

  const warnings: string[] = [];
  const quickViewTokens = [
    "### 本轮最可能出现的 3 个问题",
    "### 本轮最容易失分的 2 个点",
    "### 今天最该优先练的 1 个动作",
  ];
  const frameworkSections = [
    "### 1. 自我介绍与动机题",
    "### 2. 项目 / 实习深挖题",
    "### 3. 岗位理解 / 业务分析题",
    "### 4. 行为面试题",
    "### 5. 压力 / 追问题",
  ];

  for (const token of quickViewTokens) {
    if (!output.includes(token)) warnings.push(token.replace(/^###\s*/, ""));
  }

  for (const section of frameworkSections) {
    if (!output.includes(section)) warnings.push(section.replace(/^###\s*\d+\.\s*/, ""));
  }

  if (countMatches(output, /^### 重点题 \d+：/gm) < 5) warnings.push("重点题完整回答示例数量不足");
  if (countMatches(output, /^- 问题 \d+：/gm) < 3) warnings.push("5分钟作战卡问题数量不足");
  if (countMatches(output, /^- 失分点 \d+：/gm) < 2) warnings.push("5分钟作战卡失分点数量不足");
  if (!output.includes("- 动作：")) warnings.push("5分钟作战卡优先动作缺失");
  if (countMatches(output, /\*\*STAR 拆解：\*\*/gm) < 5) warnings.push("STAR 拆解数量不足");
  if (countMatches(output, /\*\*完整回答示例：\*\*/gm) < 5) warnings.push("完整回答示例数量不足");
  const probabilityQuestionRows = countMatches(output, /^\| 问题 \d+ \|/gm);
  if (probabilityQuestionRows < 8) warnings.push("岗位高概率提问地图数量不足");
  const resumeFollowupRows = countMatches(output, /^\| 经历点 \d+ \|/gm);
  if (resumeFollowupRows < 3) warnings.push("简历追问预测数量不足");
  const gapRows = countMatches(output, /^\| 风险 \d+ \|/gm);
  if (gapRows < 3) warnings.push("当前短板与避坑提醒数量不足");
  const checklistCount = countMatches(output, /^- \[ \]/gm);
  if (checklistCount < 4) warnings.push("行动清单数量不足");
  if (!output.includes("为什么会问")) warnings.push("高概率原因说明偏弱");
  if (!output.includes("回答骨架")) warnings.push("回答框架字段缺失");
  if (output.length < 3200) warnings.push("准备包内容偏短");

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
  if (countMatches(output, /^### /gm) < 2) warnings.push("逐题复盘数量不足");
  if (countMatches(output, /^\| P[0-9]/gm) < 2) warnings.push("行动项数量不足");
  if (countMatches(output, /^- /gm) < 4) warnings.push("提醒与亮点信息偏少");

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function hasNonEmptyStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function countMeaningfulRawEntryFields(entry: Record<string, unknown>) {
  return Object.values(entry).filter((value) => {
    if (hasNonEmptyStringValue(value)) return true;
    if (Array.isArray(value)) {
      return value.some((item) => hasNonEmptyStringValue(item));
    }
    return false;
  }).length;
}

function hasMeaningfulRawProfile(value: unknown) {
  if (!isPlainObject(value)) return false;
  return countMeaningfulRawEntryFields(value) >= 2;
}

function hasMeaningfulRawEntryArray(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((item) => isPlainObject(item) && countMeaningfulRawEntryFields(item) >= 2);
}

function hasMeaningfulRawSkills(value: unknown) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).some((item) => {
    if (hasNonEmptyStringValue(item)) return true;
    if (Array.isArray(item)) return item.some((entry) => hasNonEmptyStringValue(entry));
    return false;
  });
}

function getCustomResumeTopLevelShapeIssues(parsed: Record<string, unknown>) {
  const missingKeys = ["profile", "education", "internships", "campusExperience", "projects", "skills"].filter((key) => !(key in parsed));
  const typeIssues: string[] = [];

  if ("profile" in parsed && !isPlainObject(parsed.profile)) typeIssues.push("profile 必须是对象");
  if ("education" in parsed && !Array.isArray(parsed.education)) typeIssues.push("education 必须是数组");
  if ("internships" in parsed && !Array.isArray(parsed.internships)) typeIssues.push("internships 必须是数组");
  if ("campusExperience" in parsed && !Array.isArray(parsed.campusExperience)) typeIssues.push("campusExperience 必须是数组");
  if ("projects" in parsed && !Array.isArray(parsed.projects)) typeIssues.push("projects 必须是数组");
  if ("skills" in parsed && !isPlainObject(parsed.skills)) typeIssues.push("skills 必须是对象");

  return { missingKeys, typeIssues };
}

function getCustomResumeSchemaLossWarnings(parsed: Record<string, unknown>, normalized: ResumeData) {
  const warnings: string[] = [];

  if (hasMeaningfulRawProfile(parsed.profile) && !isMeaningfulProfile(normalized.profile)) warnings.push("基础信息");
  if (hasMeaningfulRawEntryArray(parsed.education) && !hasMeaningfulEducation(normalized.education ?? [])) warnings.push("教育经历");
  if (hasMeaningfulRawEntryArray(parsed.internships) && !hasMeaningfulInternships(normalized.internships ?? [])) warnings.push("实习经历");
  if (hasMeaningfulRawEntryArray(parsed.campusExperience) && !hasMeaningfulCampus(normalized.campusExperience ?? [])) warnings.push("校园经历");
  if (hasMeaningfulRawEntryArray(parsed.projects) && !hasMeaningfulProjects(normalized.projects ?? [])) warnings.push("项目经历");
  if (hasMeaningfulRawSkills(parsed.skills) && getSparseResumeWarnings(normalized).includes("技能")) warnings.push("技能");

  return warnings;
}

function validateAndNormalizeCustomResume(output: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new CustomResumeValidationError("invalid_json", "定制简历生成失败：模型返回内容不是合法 JSON。正式文件未保存，已保留原始输出供检查。", {
      preserveRawOutput: true,
    });
  }

  if (!isPlainObject(parsed)) {
    throw new CustomResumeValidationError(
      "schema_mismatch",
      "定制简历生成失败：模型返回的顶层结构不是 JSON 对象。正式文件未保存，已保留原始输出供检查。",
      { preserveRawOutput: true },
    );
  }

  const { missingKeys, typeIssues } = getCustomResumeTopLevelShapeIssues(parsed);
  if (missingKeys.length > 0 || typeIssues.length > 0) {
    const problems = [
      missingKeys.length > 0 ? `缺少顶层字段：${missingKeys.join("、")}` : "",
      typeIssues.length > 0 ? `结构错误：${typeIssues.join("；")}` : "",
    ]
      .filter(Boolean)
      .join("；");

    throw new CustomResumeValidationError(
      "schema_mismatch",
      `定制简历生成失败：输出结构不符合 ResumeData 要求（${problems}）。正式文件未保存，已保留原始输出供检查。`,
      { preserveRawOutput: true },
    );
  }

  const normalized = normalizeResumePayload(parsed);
  const schemaLossWarnings = getCustomResumeSchemaLossWarnings(parsed, normalized);
  if (schemaLossWarnings.length > 0) {
    throw new CustomResumeValidationError(
      "schema_mismatch",
      `定制简历生成失败：模型返回了 JSON，但这些模块在归一化后无法被稳定识别：${schemaLossWarnings
        .map((item) => `「${item}」`)
        .join("、")}。请严格使用 ResumeData 的字段名与结构重新生成；正式文件未保存，已保留原始输出供检查。`,
      { preserveRawOutput: true },
    );
  }

  return {
    normalizedJson: JSON.stringify(normalized, null, 2),
    normalizedResume: normalized,
  };
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
  if (sourceHasEducation && !hasMeaningfulEducation(target.education ?? [])) warnings.push("教育经历");
  if (sourceHasInternships && !hasMeaningfulInternships(target.internships ?? [])) warnings.push("实习经历");
  if (sourceHasCampus && !hasMeaningfulCampus(target.campusExperience ?? [])) warnings.push("校园经历");
  if (sourceHasProjects && !hasMeaningfulProjects(target.projects ?? [])) warnings.push("项目经历");

  const targetHasSkills =
    (target.skills?.professional?.length ?? 0) > 0 ||
    (target.skills?.languages?.length ?? 0) > 0 ||
    (target.skills?.certificates?.length ?? 0) > 0 ||
    (target.skills?.tools?.length ?? 0) > 0;
  if (sourceHasSkills && !targetHasSkills) warnings.push("技能");

  return warnings;
}

function formatQuotedList(items: string[]) {
  return items.map((item) => `「${item}」`).join("、");
}

function normalizeKeyPart(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

type CustomResumeRegression = {
  section: "教育经历" | "实习经历" | "校园经历";
  label: string;
  missingFields: string[];
};

function findMatchingEducationEntry(sourceEntry: ResumeData["education"][number], targetEntries: ResumeData["education"]) {
  const schoolKey = normalizeKeyPart(sourceEntry.school);
  const majorKey = normalizeKeyPart(sourceEntry.major);
  const degreeKey = normalizeKeyPart(sourceEntry.degree);

  return targetEntries.find((entry) => {
    if (!schoolKey || normalizeKeyPart(entry.school) !== schoolKey) return false;
    if (majorKey && normalizeKeyPart(entry.major) === majorKey) return true;
    if (degreeKey && normalizeKeyPart(entry.degree) === degreeKey) return true;
    return true;
  });
}

function findMatchingInternshipEntry(
  sourceEntry: ResumeData["internships"][number],
  targetEntries: ResumeData["internships"],
) {
  const companyKey = normalizeKeyPart(sourceEntry.company);
  const positionKey = normalizeKeyPart(sourceEntry.position);

  return targetEntries.find((entry) => {
    if (!companyKey || normalizeKeyPart(entry.company) !== companyKey) return false;
    if (positionKey && normalizeKeyPart(entry.position) === positionKey) return true;
    return true;
  });
}

function findMatchingCampusEntry(
  sourceEntry: ResumeData["campusExperience"][number],
  targetEntries: ResumeData["campusExperience"],
) {
  const organizationKey = normalizeKeyPart(sourceEntry.organization);
  const roleKey = normalizeKeyPart(sourceEntry.role);

  return targetEntries.find((entry) => {
    if (!organizationKey || normalizeKeyPart(entry.organization) !== organizationKey) return false;
    if (roleKey && normalizeKeyPart(entry.role) === roleKey) return true;
    return true;
  });
}

function getCustomResumeRegressions(source: ResumeData | null | undefined, target: ResumeData) {
  if (!source) return [];

  const regressions: CustomResumeRegression[] = [];

  for (const entry of source.education ?? []) {
    const matching = findMatchingEducationEntry(entry, target.education ?? []);
    if (!matching) continue;

    const missingFields: string[] = [];
    if (hasValue(entry.startDate) && !hasValue(matching.startDate)) missingFields.push("开始时间");
    if (hasValue(entry.endDate) && !hasValue(matching.endDate)) missingFields.push("结束时间");
    if (hasValue(entry.gpa) && !hasValue(matching.gpa)) missingFields.push("GPA");

    if (missingFields.length > 0) {
      regressions.push({
        section: "教育经历",
        label: entry.school || entry.major || "未命名教育经历",
        missingFields,
      });
    }
  }

  for (const entry of source.internships ?? []) {
    const matching = findMatchingInternshipEntry(entry, target.internships ?? []);
    if (!matching) continue;

    const missingFields: string[] = [];
    if (hasValue(entry.startDate) && !hasValue(matching.startDate)) missingFields.push("开始时间");
    if (hasValue(entry.endDate) && !hasValue(matching.endDate)) missingFields.push("结束时间");

    if (missingFields.length > 0) {
      regressions.push({
        section: "实习经历",
        label: entry.company || entry.position || "未命名实习经历",
        missingFields,
      });
    }
  }

  for (const entry of source.campusExperience ?? []) {
    const matching = findMatchingCampusEntry(entry, target.campusExperience ?? []);
    if (!matching) continue;

    const missingFields: string[] = [];
    if (hasValue(entry.startDate) && !hasValue(matching.startDate)) missingFields.push("开始时间");
    if (hasValue(entry.endDate) && !hasValue(matching.endDate)) missingFields.push("结束时间");

    if (missingFields.length > 0) {
      regressions.push({
        section: "校园经历",
        label: entry.organization || entry.role || "未命名校园经历",
        missingFields,
      });
    }
  }

  return regressions;
}

function formatCustomResumeRegressionMessage(regressions: CustomResumeRegression[]) {
  const sample = regressions
    .slice(0, 3)
    .map((item) => `${item.section}「${item.label}」缺少${item.missingFields.join("、")}`)
    .join("；");
  const suffix = regressions.length > 3 ? "；还有更多条目未保住时间字段" : "";
  return `定制简历生成失败：结果没有保住源主简历里的关键时间字段。${sample}${suffix}。请重新生成。`;
}

async function readResumeSourceForCustomResume(jobFolderPath: string) {
  const meta = await getJobMeta(jobFolderPath);
  const preferredPath = meta?.resumeId?.trim() || "/简历/主简历.json";
  const preferredFile = await readFile(preferredPath);
  if (preferredFile?.content?.trim() && isResumeContentMeaningful(preferredFile.content)) {
    try {
      return {
        path: preferredPath,
        content: preferredFile.content,
        resume: normalizeResumePayload(JSON.parse(preferredFile.content)),
        sourceKind: "json" as const,
      };
    } catch {
      // ignore parse error and fall through
    }
  }

  if (preferredPath !== "/简历/主简历.json") {
    const fallback = await readFile("/简历/主简历.json");
    if (fallback?.content?.trim() && isResumeContentMeaningful(fallback.content)) {
      try {
        return {
          path: "/简历/主简历.json",
          content: fallback.content,
          resume: normalizeResumePayload(JSON.parse(fallback.content)),
          sourceKind: "json" as const,
        };
      } catch {
        return null;
      }
    }
  }

  await ensureResumeMarkdownFromLegacy();
  const markdownFile = await readFile(RESUME_MARKDOWN_PATH);
  const markdownState = getResumeMarkdownState(markdownFile?.content, parseResumeMarkdownMetadata(markdownFile));
  if (markdownFile?.content?.trim() && (markdownState === "usable" || markdownState === "low")) {
    return {
      path: RESUME_MARKDOWN_PATH,
      content: markdownFile.content,
      resume: null,
      sourceKind: "markdown" as const,
    };
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
      "请严格按固定 Markdown 模板输出 BOSS 招呼语：先写 # BOSS招呼语，再只写 1 段 60-90 字正文。正文必须自然完成三件事：1）先交代当前身份；2）只挑 1-2 个最贴 JD 的真实证据点，优先写实习/项目/数据结果；3）最后用一句自然的话表达想进一步沟通。整体要像真人直接发给 HR 的开场，不要写成求职信、自我评价或总结报告。禁止列点、禁止多段、禁止解释说明、禁止代码块。禁止出现“认真阅读了贵司JD”“了解到贵司岗位”“非常荣幸”“十分希望”“真诚期待”“具备较强的学习能力和沟通能力”“若有机会”等模板腔。若缺少强证据，不要编造，改用学校/专业/相关项目事实保持真实。",
    email:
      "请严格按固定 Markdown 模板输出求职邮件，必须完整包含 # 求职邮件、## 邮件主题、## 邮件正文 三个标题，并写出可直接发送的主题与正文。禁止输出代码块包裹，仅返回 Markdown 正文。",
    "custom-resume":
      "你必须仅输出一个合法 JSON 对象，且字段名必须与 ResumeData 完全一致：id、profile、education、internships、campusExperience、projects、skills。禁止任何解释、标题、Markdown 包裹，也禁止把 internships / campusExperience / projects / skills 换成任何同义字段名。profile 必须是对象；education、internships、campusExperience、projects 必须是数组；skills 必须是对象。定制简历必须基于岗位 JD + 个人简历.md/主简历.json 共同生成：如果两类简历证据都存在，必须同时参考 Markdown 原文事实和结构化 JSON 基线，不得只依赖其中一份。先从 JD 提炼 3-5 个核心能力或职责信号，再回到已有事实里逐条找证据，然后按相关性重排经历。你只能做这些事情：重写 bullet 表述、重排顺序、合并/拆分已有描述、压缩低相关内容、强化 JD 相关关键词和结果表达。你不能新增原简历里没有的职责、结果、项目、技能或业务场景；也不能改时间、公司名、岗位名、项目名、学校名、学历、GPA。教育经历只做轻微排序和目标岗位对齐；实习和项目经历必须做中高强度贴岗改写；校园经历只保留能补位 JD 的部分且整体降权。保真优先于裁剪：如果保留了某条教育/实习/校园经历，且源简历中已有 startDate/endDate/gpa，就不得删掉这些字段；只有整条低相关经历被移除时，才允许对应字段一起消失。如果原经历没有体现某项 JD 能力，不得凭空补出该能力。",
  };

  try {
    if (!(await fileExists(jobFolderPath))) {
      throw new Error(`岗位目录不存在：${jobFolderPath}`);
    }
    const config = getLlmConfig();
    await ensureResumeSourceAvailable(
      jobFolderPath,
      docType === "custom-resume" ? "job-docs/custom-resume" : "job-docs/default",
    );
    await prewarmResumeSource(jobFolderPath);
    const resumeSourceReceipt = await getResumeSourceReceipt(jobFolderPath);
    controller = startGeneration(kindLabelMap[docType]);
    const customResumeSource = docType === "custom-resume" ? await readResumeSourceForCustomResume(jobFolderPath) : null;
    let sourceResumeBaseline = customResumeSource?.resume ?? null;
    const sourceKind = customResumeSource?.sourceKind ?? "none";

    const context = await buildContext({
      mode: "job-docs",
      jobFolderPath,
      userPrompt: instructionMap[docType],
      resumeEvidenceMode: docType === "custom-resume" ? "custom-resume" : "default",
    });
    if (docType === "custom-resume" && customResumeSource?.sourceKind === "markdown" && customResumeSource.content.trim()) {
      try {
        const { resume } = await generateMainResumeFromMd({
          markdownContent: customResumeSource.content,
          llmConfig: config,
          runSource: "markdown",
        });
        sourceResumeBaseline = resume;
        context.messages.push({
          role: "user",
          content: `## 自动结构化简历基线（由个人简历.md提炼）\n\n${JSON.stringify(resume, null, 2)}`,
        });
      } catch (error) {
        console.warn("[custom-resume] markdown pre-structuring failed", error instanceof Error ? error.message : String(error));
      }
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
      const jdFile = await readFile(`${jobFolderPath}/jd.md`);
      const { normalizedJson, normalizedResume } = validateAndNormalizeCustomResume(output);
      const sourceResume = sourceResumeBaseline;
      const customWarnings = getCustomResumeWarnings(normalizedResume, sourceResume);
      if (customWarnings.length >= 4) {
        throw new CustomResumeValidationError(
          "schema_mismatch",
          `定制简历生成失败：模型返回了 JSON，但归一化后核心模块仍明显缺失：${customWarnings
            .map((item) => `「${item}」`)
            .join("、")}。正式文件未保存，已保留原始输出供检查。`,
          { preserveRawOutput: true },
        );
      }
      const regressions = getCustomResumeRegressions(sourceResume, normalizedResume);
      const fitAnalysis = analyzeCustomResumeFit({
        sourceResume,
        targetResume: normalizedResume,
        jdContent: jdFile?.content ?? "",
      });
      if (regressions.length > 0) {
        throw new CustomResumeValidationError("content_regression", formatCustomResumeRegressionMessage(regressions));
      }
      savedPath = `/简历/定制简历/${company}-${position}.json`;
      await writeFileByPath(savedPath, "json", normalizedJson);

      const store = useAppStore.getState();
      await store.reloadTree();
      await store.openFilePath(savedPath);
      await store.loadTrialStatus();
      store.setGenerationNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`, savedPath);
      await addSystemNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`);
      if (customWarnings.length > 0) {
        const resumeHint =
          sourceKind === "markdown"
            ? "建议检查个人简历.md后重新生成。"
            : sourceKind === "json"
              ? "建议检查个人简历.md；若没有 Markdown，再检查主简历后重新生成。"
              : "建议先补个人简历.md或主简历后重新生成。";
        await addSystemNotice(`定制简历已保存，但内容仍偏空：${formatQuotedList(customWarnings)}。${resumeHint}`);
      }
      if (fitAnalysis.fitWarnings.length > 0 || fitAnalysis.supplementSuggestions.length > 0) {
        const warningText =
          fitAnalysis.fitWarnings.length > 0
            ? `当前还差：${formatQuotedList(fitAnalysis.fitWarnings)}。`
            : "当前还有继续打磨空间。";
        const suggestionText =
          fitAnalysis.supplementSuggestions.length > 0
            ? `建议优先补这些事实：${fitAnalysis.supplementSuggestions.map((item) => `1. ${item}`).join(" ")}`
            : "建议补 1-2 条更贴 JD 的事实后再重新生成。";
        await addSystemNotice(`定制简历已保存，但离“更容易拿面试”还差一点：${warningText}${suggestionText}`);
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
      await store.loadTrialStatus();
      store.setGenerationNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`, savedPath);
      await addSystemNotice(`已保存到：${savedPath}（本次已使用：${resumeSourceReceipt}）`);
      if (markdownWarnings.length > 0) {
        if (docType === "boss") {
          await addSystemNotice(`BOSS招呼语已保存，但这版仍偏像模板稿：${markdownWarnings.map((item) => `「${item}」`).join("、")}。建议先微调或重生成后再发给 HR。`);
        } else {
          await addSystemNotice(`${kindLabelMap[docType]}已保存，但模板不够完整：缺少 ${markdownWarnings.map((item) => `「${item}」`).join("、")}。建议补充后再继续使用。`);
        }
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
    if (shouldRefreshTrialStatusFromError(message)) {
      await useAppStore.getState().loadTrialStatus();
    }
    let preservedOutputPath: string | null = null;
    if (docType === "custom-resume" && error instanceof CustomResumeValidationError && error.preserveRawOutput) {
      const meta = await getJobMeta(jobFolderPath);
      const company = meta?.company ?? "未知公司";
      const position = meta?.position ?? "未知岗位";
      preservedOutputPath = `/简历/定制简历/${company}-${position}.invalid.json`;
      const rawOutput = streamed.trim();
      if (rawOutput) {
        await writeFileByPath(preservedOutputPath, "json", rawOutput);
      }
    }
    if (controller) await finishGeneration("error", message);
    if (preservedOutputPath) {
      const store = useAppStore.getState();
      await store.reloadTree();
      await store.openFilePath(preservedOutputPath);
      store.setGenerationNotice(`正式文件未保存，已保留原始输出：${preservedOutputPath}`, preservedOutputPath);
      await addSystemNotice(`正式文件未保存，已保留原始输出：${preservedOutputPath}`);
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
    await ensureResumeSourceAvailable(jobFolderPath, "prep-pack");
    await prewarmResumeSource(jobFolderPath);
    const resumeSourceReceipt = await getResumeSourceReceipt(jobFolderPath);
    controller = startGeneration("面试准备包");

    const context = await buildContext({
      mode: "prep-pack",
      jobFolderPath,
      userPrompt:
        "请严格按固定 Markdown 模板输出面试准备包，必须完整包含这些标题：# 面试准备包、## 先看这 5 分钟、## 一、岗位高概率提问地图、## 二、重点题回答框架、## 三、重点题完整回答示例、## 四、简历追问预测、## 五、当前短板与避坑提醒、## 六、面试前行动清单。重点要求：1）先看这 5 分钟必须给出“本轮最可能出现的 3 个问题 / 本轮最容易失分的 2 个点 / 今天最该优先练的 1 个动作”，且保持首屏可快速扫完；2）岗位高概率提问地图至少列 8 个高概率问题，每题必须写清“为什么会问 / 更可能从哪里切入 / 你应重点准备什么”；3）重点题回答框架必须覆盖“自我介绍与动机题 / 项目实习深挖题 / 岗位理解业务分析题 / 行为面试题 / 压力追问题”；4）重点题完整回答示例必须固定输出 5 个重点题，每题都要包含“为什么这题高概率出现 / STAR 拆解 / 完整回答示例”；5）经历类问题默认使用 STAR；6）完整示例必须口语化、基于真实简历证据、能直接拿去练，控制在 60-90 秒可说完；7）不要输出空泛建议，内容必须能直接帮助用户练题。禁止输出代码块包裹，仅返回 Markdown 正文。",
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
    await store.loadTrialStatus();
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
    if (shouldRefreshTrialStatusFromError(message)) {
      await useAppStore.getState().loadTrialStatus();
    }
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
    await ensureResumeSourceAvailable(jobFolderPath, "interview-review");
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

    let memoryWarning: string | null = null;
    let growthWarning: string | null = null;
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
      memoryWarning =
        secondaryError instanceof Error
          ? `记忆摘要未能完整更新：${secondaryError.message}`
          : "记忆摘要未能完整更新，请稍后重试。";
    }

    try {
      const growthProfileFile = await readFile(INTERVIEW_GROWTH_PROFILE_PATH);
      const normalizedGrowthProfile = await updateInterviewGrowthProfile({
        llmConfig: config,
        reviewReport: normalizedReport,
        existingProfile: growthProfileFile?.content,
        signal: controller.signal,
      });
      await writeFileByPath(INTERVIEW_GROWTH_PROFILE_PATH, "md", normalizedGrowthProfile, { isSystem: false });
    } catch (growthError) {
      growthWarning =
        growthError instanceof Error
          ? `面试成长画像未能完整更新：${growthError.message}`
          : "面试成长画像未能完整更新，请稍后重试。";
    }

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(reportPath);
    await store.loadTrialStatus();
    store.setGenerationNotice(`已保存到：${reportPath}（本次已使用：${resumeSourceReceipt}）`, reportPath);
    await addSystemNotice(`已保存到：${reportPath}（本次已使用：${resumeSourceReceipt}）`);
    if (reviewWarnings.length > 0) {
      await addSystemNotice(`复盘报告已保存，但模板不够完整：缺少 ${reviewWarnings.map((item) => `「${item}」`).join("、")}。建议补充后再复习。`);
    }
    if (memoryWarning) {
      await addSystemNotice(`复盘报告主文件已保存，但${memoryWarning}`);
    }
    if (growthWarning) {
      await addSystemNotice(`复盘报告主文件已保存，但${growthWarning}`);
    }

    const threadId = store.currentThreadId;
    if (threadId && !memoryWarning && !growthWarning) {
      await db.chat_messages.add({
        id: createId(),
        threadId,
        role: "system",
        content: "复盘要点已写入记忆摘要和面试成长画像，会在下次面试准备与复盘中自动参考。",
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
    if (shouldRefreshTrialStatusFromError(message)) {
      await useAppStore.getState().loadTrialStatus();
    }
    if (controller) {
      await finishGeneration("error", message);
    }
    window.alert(message);
    return { ok: false, message };
  }
}
