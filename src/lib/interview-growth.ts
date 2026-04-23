export const INTERVIEW_GROWTH_PROFILE_PATH = "/AI配置/面试成长画像.md";

const EMPTY_GROWTH_PROFILE_MARKER = "暂无成长记录";

export type InterviewGrowthOverview = {
  currentStage: string;
  recentImprovements: string[];
  coreGaps: string[];
  nextFocus: string;
};

export type InterviewGrowthSummary = {
  headline: string;
  summaryLines: string[];
  collapsedLine: string;
};

function cleanGrowthSentence(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/^(当前阶段|最近明显提升|当前核心短板|下一轮面试准备重点|高频失分题型|表达与讲故事策略)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clipGrowthSentence(value: string, maxLength: number) {
  const text = cleanGrowthSentence(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeLines(markdown: string) {
  return markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
}

function getSection(lines: string[], heading: string) {
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

function extractBulletLines(section: string[], limit?: number) {
  const lines = section
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean)
    .filter((line) => line !== EMPTY_GROWTH_PROFILE_MARKER);

  return typeof limit === "number" ? lines.slice(0, limit) : lines;
}

export function getInterviewGrowthProfileTemplate() {
  return `# 面试成长画像

> 此文件由系统自动维护，用于沉淀你在多轮面试中的能力变化、当前短板与下一轮策略。

## 当前阶段

${EMPTY_GROWTH_PROFILE_MARKER}

## 最近明显提升

- ${EMPTY_GROWTH_PROFILE_MARKER}

## 当前核心短板

- ${EMPTY_GROWTH_PROFILE_MARKER}

## 高频失分题型

- ${EMPTY_GROWTH_PROFILE_MARKER}

## 表达与讲故事策略

- ${EMPTY_GROWTH_PROFILE_MARKER}

## 下一轮面试准备重点

- ${EMPTY_GROWTH_PROFILE_MARKER}`;
}

export function hasInterviewGrowthProfileContent(content?: string | null) {
  if (!content?.trim()) return false;
  const normalized = content.replace(/\r/g, "").trim();
  if (normalized === getInterviewGrowthProfileTemplate().replace(/\r/g, "").trim()) return false;
  return normalized !== "" && !normalized.includes(`## 当前阶段\n\n${EMPTY_GROWTH_PROFILE_MARKER}`);
}

export function validateInterviewGrowthProfileMarkdown(output: string) {
  const normalized = output.trim();
  const requiredHeadings = [
    "# 面试成长画像",
    "## 当前阶段",
    "## 最近明显提升",
    "## 当前核心短板",
    "## 高频失分题型",
    "## 表达与讲故事策略",
    "## 下一轮面试准备重点",
  ];

  for (const heading of requiredHeadings) {
    if (!normalized.includes(heading)) {
      throw new Error(`面试成长画像缺少必需标题「${heading}」`);
    }
  }

  return normalized;
}

export function parseInterviewGrowthOverview(content?: string | null): InterviewGrowthOverview | null {
  if (!hasInterviewGrowthProfileContent(content)) return null;

  const lines = normalizeLines(content ?? "");
  const currentStage = getSection(lines, "## 当前阶段").find((line) => line && !line.startsWith(">")) ?? "";
  const recentImprovements = extractBulletLines(getSection(lines, "## 最近明显提升"), 3);
  const coreGaps = extractBulletLines(getSection(lines, "## 当前核心短板"), 3);
  const nextFocus = extractBulletLines(getSection(lines, "## 下一轮面试准备重点"), 1)[0] ?? "";

  return {
    currentStage,
    recentImprovements,
    coreGaps,
    nextFocus,
  };
}

export function buildInterviewGrowthSummary(overview: InterviewGrowthOverview): InterviewGrowthSummary {
  const headline = clipGrowthSentence(overview.currentStage || "已经不再是完全生疏的新手，但还没有稳定到让面试官完全放心。", 30);
  const summaryLines: string[] = [];

  if (overview.recentImprovements[0]) {
    summaryLines.push(`已经能稳住：${clipGrowthSentence(overview.recentImprovements[0], 28)}`);
  }

  if (overview.nextFocus) {
    summaryLines.push(`下一轮先补：${clipGrowthSentence(overview.nextFocus, 28)}`);
  } else if (overview.coreGaps[0]) {
    summaryLines.push(`还会让人犹豫：${clipGrowthSentence(overview.coreGaps[0], 26)}`);
  }

  while (summaryLines.length < 2 && overview.coreGaps.length > 0) {
    const nextGap = overview.coreGaps.find((item) => {
      const cleaned = clipGrowthSentence(item, 26);
      return !summaryLines.some((line) => line.includes(cleaned));
    });
    if (!nextGap) break;
    summaryLines.push(`还会让人犹豫：${clipGrowthSentence(nextGap, 26)}`);
  }

  const collapsedLine = overview.nextFocus
    ? `下一轮先补：${clipGrowthSentence(overview.nextFocus, 24)}`
    : overview.coreGaps[0]
      ? `还会让人犹豫：${clipGrowthSentence(overview.coreGaps[0], 22)}`
      : clipGrowthSentence(overview.currentStage || overview.recentImprovements[0] || "打开画像查看完整成长状态", 26);

  return {
    headline,
    summaryLines: summaryLines.slice(0, 2),
    collapsedLine,
  };
}

export function buildAdaptiveInterviewStrategy(profileContent?: string | null) {
  const overview = parseInterviewGrowthOverview(profileContent);
  if (!overview) return "";

  const lines = [
    "当前用户成长策略：",
    overview.currentStage ? `- 当前阶段：${overview.currentStage}` : "",
    ...overview.recentImprovements.map((item) => `- 已明显提升：${item}`),
    ...overview.coreGaps.map((item) => `- 当前仍需补强：${item}`),
    overview.nextFocus ? `- 本轮最优先准备：${overview.nextFocus}` : "",
    "- 请基于这些成长信号动态调整建议强度：不要再把用户当成完全没有经验的新手，也不要忽略仍反复出现的短板。",
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildInterviewGrowthProfilePrompt(args: {
  reviewReport: string;
  existingProfile?: string;
}) {
  return `请基于“已有面试成长画像”和“本轮复盘报告”，增量更新用户的全局面试成长画像。

输出要求：
1. 只输出 Markdown 正文，禁止代码块与额外解释。
2. 必须严格保留以下标题：
# 面试成长画像
## 当前阶段
## 最近明显提升
## 当前核心短板
## 高频失分题型
## 表达与讲故事策略
## 下一轮面试准备重点
3. 这是全局画像，不按具体公司单独拆分；要体现用户随着多轮面试的整体成长。
4. “当前阶段”必须像资深 HR 在评价候选人成熟度，只写 1 句话，不要写过程汇报，不要出现“系统/画像/更新”等词。
5. “最近明显提升 / 当前核心短板 / 高频失分题型 / 表达与讲故事策略 / 下一轮面试准备重点”都用简短 bullet 输出，优先写真正会影响通过率的判断。
6. 若某能力已明显提升，不要在“当前核心短板”里继续重复同样批评；要体现阶段变化。
7. “下一轮面试准备重点”必须只有 1 条，而且是单一、可执行、优先级最高的训练重点。
8. 不得编造用户没有表现过的问题或优势，只能基于已有画像和本轮复盘报告更新。禁止复述字段名式表达，例如“最近明显提升：xxx”“当前核心短板：xxx”。要像专业 HR 的自然判断句。

已有面试成长画像：
${args.existingProfile?.trim() || getInterviewGrowthProfileTemplate()}

本轮复盘报告：
${args.reviewReport}`;
}
