import { normalizeResumeData } from "@/lib/resume-import";
import { ResumeData } from "@/types";

type JdSignals = {
  metrics: boolean;
  project: boolean;
  business: boolean;
  product: boolean;
  operations: boolean;
};

type TargetCoverage = {
  hasMetrics: boolean;
  hasProjectScope: boolean;
  hasBusinessContext: boolean;
  hasProductEvidence: boolean;
  hasOperationsEvidence: boolean;
  hasReadableLeadExperience: boolean;
  hasActionResultBullets: boolean;
  hasTargetRole: boolean;
};

export type CustomResumeFitAnalysis = {
  fitWarnings: string[];
  supplementSuggestions: string[];
};

function normalizeText(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseResumeDataContent(content: string | undefined) {
  if (!content?.trim()) return null;
  try {
    return normalizeResumeData(JSON.parse(content));
  } catch {
    return null;
  }
}

function collectDescriptionEntries(resume: ResumeData) {
  return [
    ...(resume.internships ?? []).map((entry) => ({
      section: "internships" as const,
      descriptions: entry.descriptions ?? [],
    })),
    ...((resume.projects ?? []).map((entry) => ({
      section: "projects" as const,
      descriptions: entry.descriptions ?? [],
    })) ?? []),
    ...(resume.campusExperience ?? []).map((entry) => ({
      section: "campusExperience" as const,
      descriptions: entry.descriptions ?? [],
    })),
  ];
}

function flattenNormalizedDescriptions(resume: ResumeData) {
  return collectDescriptionEntries(resume)
    .flatMap((entry) => entry.descriptions)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function countChangedDescriptionRatio(source: ResumeData | null | undefined, target: ResumeData) {
  if (!source) return 1;
  const sourceLines = flattenNormalizedDescriptions(source);
  const targetLines = flattenNormalizedDescriptions(target);
  if (targetLines.length === 0) return 0;
  let unchanged = 0;
  for (const line of targetLines) {
    if (sourceLines.includes(line)) unchanged += 1;
  }
  return (targetLines.length - unchanged) / targetLines.length;
}

function countMeaningfulExperienceEntries(resume: ResumeData) {
  let count = 0;
  for (const entry of resume.internships ?? []) {
    const base = [entry.company, entry.position, entry.startDate, entry.endDate].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    if (base >= 2 || descriptions >= 2) count += 1;
  }
  for (const entry of resume.projects ?? []) {
    const base = [entry.name, entry.role].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    if (base >= 1 && descriptions >= 1) count += 1;
  }
  for (const entry of resume.campusExperience ?? []) {
    const base = [entry.organization, entry.role].filter((value) => value?.trim()).length;
    const descriptions = (entry.descriptions ?? []).filter((item) => item.trim()).length;
    if (base >= 2 || descriptions >= 1) count += 1;
  }
  return count;
}

function collectLeadDescriptions(resume: ResumeData) {
  return [
    ...(resume.internships?.[0]?.descriptions ?? []),
    ...(resume.projects?.[0]?.descriptions ?? []),
    ...(resume.campusExperience?.[0]?.descriptions ?? []),
  ]
    .map((line) => String(line ?? "").trim())
    .filter(Boolean);
}

function getJdSignals(jdContent: string): JdSignals {
  const jd = normalizeText(jdContent);
  return {
    metrics: /(增长|转化|留存|gmv|roi|sql|数据分析|指标|分析)/.test(jd),
    project: /(项目|推进|落地|协同|跨部门|执行|跟进)/.test(jd),
    business: /(用户|业务|商家|客户|场景|市场|运营)/.test(jd),
    product: /(需求|原型|prd|竞品|用户研究|访谈|产品)/.test(jd),
    operations: /(运营|活动|拉新|转化|留存|社群|内容|渠道|增长)/.test(jd),
  };
}

function getTargetSignalCoverage(target: ResumeData): TargetCoverage {
  const descriptions = flattenNormalizedDescriptions(target);
  const text = descriptions.join(" ");
  const leadDescriptions = collectLeadDescriptions(target);
  const actionResultBulletCount = descriptions.filter((line) =>
    /(\d|%|w|万|千|提升|增长|转化|留存|降低|完成|推动|上线|落地|优化|复盘|分析)/.test(line),
  ).length;

  return {
    hasMetrics: /(\d|%|w|万|千|提升|增长|转化|留存|gmv|roi|用户数|下载量|点击率)/.test(text),
    hasProjectScope: /(负责|主导|推进|协调|落地|对接|跟进|统筹|拆解)/.test(text),
    hasBusinessContext: /(用户|业务|场景|客户|商家|市场|运营|校园|社群|内容)/.test(text),
    hasProductEvidence: /(需求|原型|prd|竞品|访谈|产品|分析|埋点|流程)/.test(text),
    hasOperationsEvidence: /(运营|活动|拉新|转化|留存|社群|内容|渠道|增长|私域)/.test(text),
    hasReadableLeadExperience: leadDescriptions.length >= 2 && leadDescriptions.some((line) => line.length >= 12),
    hasActionResultBullets: actionResultBulletCount >= 2,
    hasTargetRole: Boolean(target.profile?.targetRole?.trim()),
  };
}

function pushSuggestion(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

export function analyzeCustomResumeFit(args: {
  sourceResume?: ResumeData | null;
  targetResume: ResumeData;
  jdContent?: string;
}): CustomResumeFitAnalysis {
  const fitWarnings: string[] = [];
  const supplementSuggestions: string[] = [];
  const rewriteRatio = countChangedDescriptionRatio(args.sourceResume, args.targetResume);
  const meaningfulEntries = countMeaningfulExperienceEntries(args.targetResume);
  const jdSignals = getJdSignals(args.jdContent ?? "");
  const targetCoverage = getTargetSignalCoverage(args.targetResume);

  if (rewriteRatio < 0.35) {
    fitWarnings.push("贴岗改写仍偏弱");
    pushSuggestion(supplementSuggestions, "把最相关实习或项目改得更贴 JD，别只做同义替换");
  }

  if (meaningfulEntries < 2) {
    fitWarnings.push("高相关经历展开不足");
    pushSuggestion(supplementSuggestions, "补 1 段最相关经历，写清你做了什么、结果怎样");
  }

  if (!targetCoverage.hasReadableLeadExperience) {
    fitWarnings.push("首屏经历不够好扫");
    pushSuggestion(supplementSuggestions, "把最相关实习或项目展开成 2-3 条 bullet，别只留岗位名");
  }

  if (!targetCoverage.hasActionResultBullets) {
    fitWarnings.push("结果导向表述偏少");
    pushSuggestion(supplementSuggestions, "把 bullet 改成“动作 + 结果”句式，至少补 1 条结果");
  }

  if (!targetCoverage.hasTargetRole) {
    fitWarnings.push("求职方向不够明确");
    pushSuggestion(supplementSuggestions, "在简历抬头写清目标岗位，方便 HR 快速判断");
  }

  if (jdSignals.metrics && !targetCoverage.hasMetrics) {
    fitWarnings.push("量化结果偏少");
    pushSuggestion(supplementSuggestions, "补 1 条量化结果，如转化率、用户数、GMV、活动参与数");
  }

  if (jdSignals.project && !targetCoverage.hasProjectScope) {
    fitWarnings.push("负责范围不够具体");
    pushSuggestion(supplementSuggestions, "补你负责的范围：主导了什么，协同到哪一步");
  }

  if (jdSignals.business && !targetCoverage.hasBusinessContext) {
    fitWarnings.push("业务场景证据偏弱");
    pushSuggestion(supplementSuggestions, "补业务场景：服务对象、业务目标、使用场景或客户类型");
  }

  if (jdSignals.product && !targetCoverage.hasProductEvidence) {
    fitWarnings.push("产品动作证据偏弱");
    pushSuggestion(supplementSuggestions, "补产品动作，如需求分析、用户研究、原型、PRD 或数据复盘");
  }

  if (jdSignals.operations && !targetCoverage.hasOperationsEvidence) {
    fitWarnings.push("运营动作证据偏弱");
    pushSuggestion(supplementSuggestions, "补运营动作，如拉新、转化、留存、活动、社群或内容运营");
  }

  return {
    fitWarnings: Array.from(new Set(fitWarnings)).slice(0, 5),
    supplementSuggestions: Array.from(new Set(supplementSuggestions)).slice(0, 4),
  };
}

export function parseResumeDataForAnalysis(content: string | undefined) {
  return parseResumeDataContent(content);
}
