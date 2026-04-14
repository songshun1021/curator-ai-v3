import { sendMessage } from "@/lib/ai-engine";
import { mapPdfError } from "@/lib/pdf-extract-core";
import { deleteFile, readFile, upsertFile } from "@/lib/file-system";
import {
  extractMarkdownFromPdfFile,
  type PdfExtractChannel,
  type PdfExtractQuality,
  type PdfExtractor,
} from "@/lib/pdf-import";
import { RESUME_TEXT_MIN_VISIBLE_CHARS, RESUME_TEXT_OK_VISIBLE_CHARS } from "@/lib/resume-text-thresholds";
import { LlmConfig, ResumeData, VirtualFile } from "@/types";

export const RESUME_MAIN_JSON_PATH = "/简历/主简历.json";
export const RESUME_PDF_PATH = "/简历/个人简历.pdf";
export const RESUME_MARKDOWN_PATH = "/简历/个人简历.md";
export const RESUME_LEGACY_EXTRACT_PATH = "/简历/个人简历.提取.md";

export type ResumeImportStage =
  | "pdf_saved"
  | "extract_ok"
  | "extract_failed"
  | "prefill_ok"
  | "prefill_failed"
  | "removed"
  | "error";

export type ResumeMarkdownState = "usable" | "low" | "draft" | "missing";

export type ResumeMarkdownMetadata = {
  source: "pdf";
  extractChannel: PdfExtractChannel | "template";
  extractQuality: PdfExtractQuality | "failed";
  extractor?: PdfExtractor;
  warning?: string;
  visibleChars?: number;
  updatedAt: string;
};

export type ResumeActionMessage = {
  type: "success" | "warning" | "error";
  stage: ResumeImportStage;
  text: string;
};

export type ResumeMarkdownGenerationResult = {
  canceled?: boolean;
  markdownContent?: string;
  markdownState?: ResumeMarkdownState;
  extractQuality?: PdfExtractQuality | "template";
  extractChannel?: PdfExtractChannel | "template";
  extractor?: PdfExtractor;
  extractVisibleChars?: number;
  extractResponseStatus?: PdfExtractQuality | "failed";
  message?: ResumeActionMessage;
};

export type ResumeJsonPrefillResult = {
  canceled?: boolean;
  blocked?: boolean;
  resume?: ResumeData;
  incompleteSections?: string[];
  message?: ResumeActionMessage;
};

type ConfirmOverwriteFn = (message: string) => boolean | Promise<boolean>;

const RESUME_MARKDOWN_TEMPLATE = `# 个人简历（请粘贴正文）

请将你的个人简历正文粘贴到下方，建议至少包含：个人信息、教育经历、实习经历、项目经历、校园经历、技能。

## 个人信息
- 姓名：
- 手机：
- 邮箱：
- 微信（可选）：
- 目标岗位（可选）：

## 教育经历
- 学校 / 学位 / 专业 / 时间 / GPA（可选）

## 实习经历
- 公司 / 岗位 / 时间
- 关键工作与成果（尽量量化）

## 项目经历
- 项目名称 / 角色 / 技术栈 / 结果

## 校园经历（可选）
- 组织 / 角色 / 时间 / 贡献

## 技能
- 专业技能：
- 语言能力：
- 证书：
- 工具：`;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export function normalizeResumeData(input: unknown): ResumeData {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const profile = source.profile && typeof source.profile === "object" ? (source.profile as Record<string, unknown>) : {};
  const skills = source.skills && typeof source.skills === "object" ? (source.skills as Record<string, unknown>) : {};

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : "main-resume",
    profile: {
      name: typeof profile.name === "string" ? profile.name : "",
      phone: typeof profile.phone === "string" ? profile.phone : "",
      email: typeof profile.email === "string" ? profile.email : "",
      wechat: typeof profile.wechat === "string" ? profile.wechat : "",
      targetRole: typeof profile.targetRole === "string" ? profile.targetRole : "",
    },
    education: Array.isArray(source.education)
      ? source.education.map((item) => {
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
    internships: Array.isArray(source.internships)
      ? source.internships.map((item) => {
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
    campusExperience: Array.isArray(source.campusExperience)
      ? source.campusExperience.map((item) => {
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
    projects: Array.isArray(source.projects)
      ? source.projects.map((item) => {
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

export function isResumeDataEmpty(data: ResumeData) {
  const profile = data.profile ?? { name: "", phone: "", email: "", wechat: "", targetRole: "" };
  const hasProfile = Boolean(
    profile.name?.trim() ||
      profile.phone?.trim() ||
      profile.email?.trim() ||
      profile.wechat?.trim() ||
      profile.targetRole?.trim(),
  );
  return !(
    hasProfile ||
    (data.education?.length ?? 0) > 0 ||
    (data.internships?.length ?? 0) > 0 ||
    (data.projects?.length ?? 0) > 0 ||
    (data.campusExperience?.length ?? 0) > 0
  );
}

export function isResumeContentMeaningful(content: string) {
  if (!content.trim()) return false;
  try {
    return !isResumeDataEmpty(normalizeResumeData(JSON.parse(content)));
  } catch {
    return false;
  }
}

export function hasConfiguredModel(config: LlmConfig) {
  return Boolean(config.model?.trim() && config.baseURL?.trim() && config.apiKey?.trim());
}

function unwrapJsonEnvelope(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1] ?? "";
  const tripleQuoted = trimmed.match(/^'''(?:json)?\s*([\s\S]*?)\s*'''$/i);
  if (tripleQuoted) return tripleQuoted[1] ?? "";
  return trimmed;
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripMarkdownNoise(text: string) {
  return normalizeWhitespace(text).replace(/[#>*`~_\-\s:：\\/()\[\]{}.,，。;；!！?？"'|]/g, "");
}

function hasSectionSignal(markdown: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(markdown));
}

function detectExpectedResumeSections(markdownContent: string) {
  const markdown = normalizeWhitespace(markdownContent);
  return {
    education: hasSectionSignal(markdown, [/##?\s*教育经历/, /学校|学院|专业|学位|学历/, /\beducation\b/i]),
    internships: hasSectionSignal(markdown, [/##?\s*实习经历/, /实习|公司|岗位|职责|成果/, /\bintern(ship)?s?\b/i]),
    campusExperience: hasSectionSignal(markdown, [/##?\s*校园经历/, /社团|学生会|校园|组织|志愿者/, /\bcampus\b/i]),
    projects: hasSectionSignal(markdown, [/##?\s*项目经历/, /项目名称|技术栈|项目背景|项目成果/, /\bprojects?\b/i]),
    skills: hasSectionSignal(markdown, [/##?\s*技能/, /专业技能|语言能力|证书|工具/, /\bskills?\b/i]),
  };
}

function getIncompleteStructuredSections(markdownContent: string, resume: ResumeData) {
  const expected = detectExpectedResumeSections(markdownContent);
  const missing: string[] = [];

  if (expected.education && (resume.education?.length ?? 0) === 0) missing.push("教育经历");
  if (expected.internships && (resume.internships?.length ?? 0) === 0) missing.push("实习经历");
  if (expected.campusExperience && (resume.campusExperience?.length ?? 0) === 0) missing.push("校园经历");
  if (expected.projects && (resume.projects?.length ?? 0) === 0) missing.push("项目经历");
  const hasAnySkills =
    (resume.skills?.professional?.length ?? 0) > 0 ||
    (resume.skills?.languages?.length ?? 0) > 0 ||
    (resume.skills?.certificates?.length ?? 0) > 0 ||
    (resume.skills?.tools?.length ?? 0) > 0;
  if (expected.skills && !hasAnySkills) missing.push("技能");

  return missing;
}

function countResumeSignals(text: string) {
  const normalized = normalizeWhitespace(text);
  const signals = [
    /@/i,
    /\b1[3-9]\d{9}\b/,
    /姓名|电话|手机|邮箱|微信|求职意向|目标岗位/,
    /教育|学校|学院|专业|学历|学位/,
    /实习|公司|岗位|项目|校园|经历|职责|成果/,
    /skill|experience|education|project|intern/i,
  ];
  return signals.reduce((count, pattern) => (pattern.test(normalized) ? count + 1 : count), 0);
}

function hasNonTemplateResumeText(content: string) {
  const normalized = normalizeWhitespace(content);
  if (!normalized) return false;
  if (normalized === normalizeWhitespace(RESUME_MARKDOWN_TEMPLATE)) return false;
  const visibleChars = stripMarkdownNoise(normalized).length;
  return visibleChars > 0;
}

async function confirmIfNeeded(confirmFn: ConfirmOverwriteFn | undefined, message: string) {
  if (!confirmFn) return true;
  return await confirmFn(message);
}

function buildResumeMarkdownMetadata(metadata: ResumeMarkdownMetadata) {
  return JSON.stringify(metadata);
}

function formatResumeExtractorLabel(extractor?: PdfExtractor, lowQuality?: boolean) {
  if (extractor === "pdfjs") return lowQuality ? "PDF 文本提取（信息较少）" : "PDF 文本提取";
  if (extractor === "markitdown") return lowQuality ? "PDF 文本提取（信息较少）" : "PDF 文本提取";
  return lowQuality ? "文本提取（信息较少）" : "文本提取";
}

export function parseResumeMarkdownMetadata(file?: Pick<VirtualFile, "metadata"> | null): ResumeMarkdownMetadata | null {
  if (!file?.metadata) return null;
  try {
    const parsed = JSON.parse(file.metadata) as Partial<ResumeMarkdownMetadata>;
    if (parsed.source !== "pdf") return null;
    return {
      source: "pdf",
      extractChannel: parsed.extractChannel ?? "template",
      extractQuality: parsed.extractQuality ?? "failed",
      extractor: parsed.extractor === "pdfjs" || parsed.extractor === "markitdown" ? parsed.extractor : undefined,
      warning: typeof parsed.warning === "string" ? parsed.warning : undefined,
      visibleChars: typeof parsed.visibleChars === "number" ? parsed.visibleChars : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeResumeMarkdown(content: string, metadata?: ResumeMarkdownMetadata) {
  await upsertFile({
    path: RESUME_MARKDOWN_PATH,
    name: "个人简历.md",
    parentPath: "/简历",
    contentType: "md",
    content,
    metadata: metadata ? buildResumeMarkdownMetadata(metadata) : undefined,
  });
}

export function buildResumeMarkdown(text: string) {
  return normalizeWhitespace(text);
}

export function getResumeMarkdownTemplate() {
  return RESUME_MARKDOWN_TEMPLATE;
}

export function getResumeMarkdownState(content?: string): ResumeMarkdownState {
  const text = normalizeWhitespace(content ?? "");
  if (!text) return "missing";
  if (text === normalizeWhitespace(RESUME_MARKDOWN_TEMPLATE)) return "draft";

  const visibleChars = stripMarkdownNoise(text).length;
  const signalCount = countResumeSignals(text);

  if (visibleChars >= RESUME_TEXT_OK_VISIBLE_CHARS || signalCount >= 3) return "usable";
  if (visibleChars >= RESUME_TEXT_MIN_VISIBLE_CHARS || signalCount >= 1) return "low";
  return "draft";
}

export function isResumeMarkdownDraft(content?: string) {
  const state = getResumeMarkdownState(content);
  return state === "draft" || state === "missing";
}

export function isResumeMarkdownUsable(content: string) {
  const state = getResumeMarkdownState(content);
  return state === "usable" || state === "low";
}

export async function ensureResumeMarkdownFromLegacy() {
  const markdown = await readFile(RESUME_MARKDOWN_PATH);
  if (markdown?.content.trim()) return markdown.content;

  const legacy = await readFile(RESUME_LEGACY_EXTRACT_PATH);
  if (!legacy?.content.trim()) return "";

  const migratedContent = hasNonTemplateResumeText(legacy.content) ? buildResumeMarkdown(legacy.content) : getResumeMarkdownTemplate();
  await writeResumeMarkdown(migratedContent);
  return migratedContent;
}

export async function removeResumeMarkdownAndLegacy() {
  await deleteFile(RESUME_MARKDOWN_PATH);
  await deleteFile(RESUME_LEGACY_EXTRACT_PATH);
}

export function resumeDataUrlToFile(dataUrl: string, name: string) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("PDF 内容无效，请重新导入。");

  const header = dataUrl.slice(0, commaIndex);
  const data = dataUrl.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch || !mimeMatch[1].toLowerCase().includes("pdf")) {
    throw new Error("当前内容不是 PDF 文件。");
  }

  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name, { type: "application/pdf" });
}

export async function extractResumeMarkdownFromPdfFile(file: File) {
  const extraction = await extractMarkdownFromPdfFile(file);
  return {
    markdown: buildResumeMarkdown(extraction.markdown),
    extractQuality: extraction.quality,
    extractChannel: extraction.channel,
    extractor: extraction.extractor,
    warning: extraction.warning,
    diagnostics: extraction.diagnostics,
  };
}

export async function generateResumeMarkdownFromPdf(args: {
  file: File;
  confirmOverwriteMarkdown?: ConfirmOverwriteFn;
}): Promise<ResumeMarkdownGenerationResult> {
  const existingMarkdown = await readFile(RESUME_MARKDOWN_PATH);
  if (existingMarkdown?.content.trim()) {
    const confirmed = await confirmIfNeeded(args.confirmOverwriteMarkdown, "已存在个人简历.md，确认覆盖吗？");
    if (!confirmed) return { canceled: true };
  }

  try {
    const extraction = await extractResumeMarkdownFromPdfFile(args.file);
    const extractVisibleChars = extraction.diagnostics?.visibleChars ?? extraction.markdown.replace(/\s/g, "").length;
    await writeResumeMarkdown(extraction.markdown, {
      source: "pdf",
      extractChannel: extraction.extractChannel,
      extractQuality: extraction.extractQuality,
      extractor: extraction.extractor,
      warning: extraction.warning,
      visibleChars: extractVisibleChars,
      updatedAt: new Date().toISOString(),
    });

    const markdownState = getResumeMarkdownState(extraction.markdown);
    const isLow = markdownState === "low" || extraction.extractQuality === "low";
    console.info("[resume-import]", {
      extract_response_status: extraction.extractQuality,
      extractor: extraction.extractor ?? "unknown",
      visibleChars: extractVisibleChars,
      markdown_written_length: extraction.markdown.replace(/\s/g, "").length,
      markdown_state: markdownState,
    });
    return {
      markdownContent: extraction.markdown,
      markdownState,
      extractQuality: extraction.extractQuality,
      extractChannel: extraction.extractChannel,
      extractor: extraction.extractor,
      extractVisibleChars,
      extractResponseStatus: extraction.extractQuality,
      message: {
        type: isLow ? "warning" : "success",
        stage: "extract_ok",
        text: isLow
          ? `已通过 ${formatResumeExtractorLabel(extraction.extractor, true)} 生成 /简历/个人简历.md。当前内容偏少，建议先检查并补充后再生成主简历 JSON。`
          : `已通过 ${formatResumeExtractorLabel(extraction.extractor, false)} 生成 /简历/个人简历.md。下一步建议先检查内容，再生成主简历 JSON。`,
      },
    };
  } catch (error) {
    const mapped = mapPdfError(error);
    const templateContent = getResumeMarkdownTemplate();
    await writeResumeMarkdown(templateContent, {
      source: "pdf",
      extractChannel: "template",
      extractQuality: "failed",
      visibleChars: 0,
      updatedAt: new Date().toISOString(),
    });
    return {
      markdownContent: templateContent,
      markdownState: "draft",
      extractQuality: "template",
      extractChannel: "template",
      extractResponseStatus: "failed",
      message: {
        type: "warning",
        stage: "extract_failed",
        text:
          mapped.errorCode === "no_meaningful_markdown"
            ? "PDF 已保存，但当前没有提取出可用正文。请直接打开 /简历/个人简历.md 手动补充内容，或重新上传一份可复制文本的 PDF。"
            : mapped.errorCode === "convert_failed"
              ? "PDF 已保存，但当前文本提取器本身没有正常工作。这不是你的 PDF 内容问题，请先打开 /简历/个人简历.md 手动补充，或稍后重试。"
              : `PDF 已保存，但未能生成可用的 Markdown（${mapped.error || "未知原因"}）。请先补充 /简历/个人简历.md。`,
      },
    };
  }
}

export async function generateMainResumeFromMd(args: {
  markdownContent: string;
  llmConfig: LlmConfig;
}) {
  if (!hasConfiguredModel(args.llmConfig)) {
    throw new Error("请先在 /AI配置/模型配置.json 中完成模型配置。");
  }

  if (!isResumeMarkdownUsable(args.markdownContent)) {
    throw new Error("个人简历.md 内容不足，请先补充完整简历正文后再生成主简历 JSON。");
  }

  const result = await sendMessage({
    provider: args.llmConfig.provider,
    model: args.llmConfig.model,
    baseURL: args.llmConfig.baseURL,
    apiKey: args.llmConfig.apiKey,
    messages: [
      {
        role: "system",
        content:
          "你是简历结构化助手。你必须仅输出一个合法 JSON 对象，字段结构与 ResumeData 一致。禁止解释、标题、Markdown 代码块。你的任务不是概括，而是尽可能完整地抽取原始简历中的结构化信息：教育经历、实习经历、校园经历、项目经历、技能都要逐项提取。只要 Markdown 中出现了相关经历，就不要轻易输出空数组。缺失字段请补空字符串或空数组。",
      },
      {
        role: "user",
        content: `请把下面的 Markdown 简历结构化为 ResumeData JSON。\n\n输出要求：\n1. 只输出合法 JSON 对象，不要输出任何解释、标题、Markdown 代码块。\n2. 字段必须包含：id、profile{name,phone,email,wechat,targetRole}、education[]、internships[]、campusExperience[]、projects[]、skills{professional,languages,certificates,tools}。\n3. education：尽可能提取学校、学位、专业、起止时间、GPA。\n4. internships：只要出现公司/岗位/时间/职责成果，就要拆成独立实习条目；descriptions 保留 2-6 条关键 bullet。\n5. campusExperience：学生组织、社团、学生会、志愿活动等，都归入 campusExperience。\n6. projects：项目名称、角色、技术栈、结果要尽量拆出来；techStack 尽量填常见工具/技术关键词。\n7. skills：将技能按 professional、languages、certificates、tools 分类；不要把所有技能都挤进同一个数组。\n8. 只要 Markdown 明显包含教育/实习/项目/校园/技能段落，就不要返回对应空数组，除非原文真的没有内容。\n9. 严禁编造原文中不存在的经历；若某字段原文缺失，可留空字符串，但该条目本身应保留。\n\n简历 Markdown：\n${args.markdownContent}`,
      },
    ],
    usageContext: "resume-import",
    usageLabel: "主简历 JSON 预填",
  });

  const cleaned = unwrapJsonEnvelope(result);
  const parsed = JSON.parse(cleaned);
  const resume = normalizeResumeData(parsed);
  return {
    resume,
    incompleteSections: getIncompleteStructuredSections(args.markdownContent, resume),
  };
}

export async function generateMainResumeFromMarkdown(args: {
  llmConfig: LlmConfig;
  markdownContent?: string;
  confirmOverwriteMainResume?: ConfirmOverwriteFn;
}): Promise<ResumeJsonPrefillResult> {
  if (!hasConfiguredModel(args.llmConfig)) {
    throw new Error("请先在 /AI配置/模型配置.json 中完成模型配置。");
  }

  let markdownContent = args.markdownContent;
  if (!markdownContent) {
    await ensureResumeMarkdownFromLegacy();
    const markdownFile = await readFile(RESUME_MARKDOWN_PATH);
    markdownContent = markdownFile?.content ?? "";

    if (!markdownFile) {
      const templateContent = getResumeMarkdownTemplate();
      await writeResumeMarkdown(templateContent);
      return {
        blocked: true,
        message: {
          type: "warning",
          stage: "prefill_failed",
          text: "已创建 /简历/个人简历.md，请先补充正文，再生成主简历 JSON。",
        },
      };
    }
  }

  const markdownState = getResumeMarkdownState(markdownContent);
  if (markdownState === "draft" || markdownState === "missing") {
    return {
      blocked: true,
      message: {
        type: "warning",
        stage: "prefill_failed",
        text: "个人简历.md 还没有形成可用简历内容，请先检查并补充后再生成主简历 JSON。",
      },
    };
  }

  const existingMainResume = await readFile(RESUME_MAIN_JSON_PATH);
  if (existingMainResume?.content && isResumeContentMeaningful(existingMainResume.content)) {
    const confirmed = await confirmIfNeeded(args.confirmOverwriteMainResume, "主简历已有内容，确认覆盖当前编辑态并重新预填吗？");
    if (!confirmed) return { canceled: true };
  }

  const { resume, incompleteSections } = await generateMainResumeFromMd({
    markdownContent,
    llmConfig: args.llmConfig,
  });

  return {
    resume,
    incompleteSections,
    message: {
      type: markdownState === "low" || (incompleteSections?.length ?? 0) > 0 ? "warning" : "success",
      stage: "prefill_ok",
      text:
        (incompleteSections?.length ?? 0) > 0
          ? `已根据个人简历.md 预填主简历，但这些部分仍未稳定提取：${incompleteSections!.map((item) => `「${item}」`).join("、")}。请先检查 /简历/个人简历.md 或补全后再保存。`
          : markdownState === "low"
            ? "已根据个人简历.md 预填主简历。当前信息偏少，请检查内容后点击“立即保存”。"
            : "已根据个人简历.md 预填主简历，请检查确认后点击“立即保存”。",
    },
  };
}

export async function generateMainResumeFromPdf(args: {
  file: File;
  llmConfig: LlmConfig;
  confirmOverwriteMarkdown?: ConfirmOverwriteFn;
  confirmOverwriteMainResume?: ConfirmOverwriteFn;
}): Promise<ResumeJsonPrefillResult & { markdownResult?: ResumeMarkdownGenerationResult }> {
  const markdownResult = await generateResumeMarkdownFromPdf({
    file: args.file,
    confirmOverwriteMarkdown: args.confirmOverwriteMarkdown,
  });

  if (markdownResult.canceled) {
    return { canceled: true, markdownResult };
  }

  console.info("[resume-import]", {
    pdf_saved: true,
    markdown_generated: Boolean(markdownResult.markdownContent),
    extract_channel: markdownResult.extractChannel ?? "none",
    extractor: markdownResult.extractor ?? "none",
    markdown_state: markdownResult.markdownState ?? "missing",
    extract_quality: markdownResult.extractQuality ?? "unknown",
    markdown_visible_chars: markdownResult.markdownContent?.replace(/\s/g, "").length ?? 0,
  });

  if (!markdownResult.markdownContent || !isResumeMarkdownUsable(markdownResult.markdownContent)) {
    return {
      blocked: true,
      markdownResult,
      message: {
        type: "warning",
        stage: "prefill_failed",
        text: "个人简历.md 已生成，但内容还不足以生成主简历 JSON。请先检查并补充后再继续。",
      },
    };
  }

  console.info("[resume-import]", { json_prefill_started: true });
  try {
    const jsonResult = await generateMainResumeFromMarkdown({
      llmConfig: args.llmConfig,
      markdownContent: markdownResult.markdownContent,
      confirmOverwriteMainResume: args.confirmOverwriteMainResume,
    });
    console.info("[resume-import]", { json_prefill_ok: Boolean(jsonResult.resume) });
    return { ...jsonResult, markdownResult };
  } catch (error) {
    console.info("[resume-import]", {
      json_prefill_failed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export type ResumePrefillFromPdfResult = {
  resume: ResumeData;
  extractedMarkdown: string;
  extractQuality: PdfExtractQuality;
};

export async function generateResumePrefillFromPdfFile(args: {
  file: File;
  llmConfig: LlmConfig;
  extractedMarkdown?: string;
  extractQuality?: PdfExtractQuality;
}): Promise<ResumePrefillFromPdfResult> {
  const extraction =
    args.extractedMarkdown && args.extractedMarkdown.trim()
      ? { extractedMarkdown: args.extractedMarkdown, extractQuality: args.extractQuality ?? "ok" }
      : await (async () => {
          const result = await extractResumeMarkdownFromPdfFile(args.file);
          return {
            extractedMarkdown: result.markdown,
            extractQuality: result.extractQuality,
          };
        })();

  const { resume } = await generateMainResumeFromMd({
    markdownContent: extraction.extractedMarkdown,
    llmConfig: args.llmConfig,
  });

  return {
    resume,
    extractedMarkdown: extraction.extractedMarkdown,
    extractQuality: extraction.extractQuality,
  };
}

