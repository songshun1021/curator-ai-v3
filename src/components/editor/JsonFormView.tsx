"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteFile, readFile, upsertFile } from "@/lib/file-system";
import { registerResumeDraftController } from "@/lib/resume-draft-sync";
import { LlmConfig, LlmUsageRecord, ResumeData } from "@/types";
import { useAppStore } from "@/store/app-store";
import { sendMessage } from "@/lib/ai-engine";
import { dispatchResumeSaved } from "@/lib/action-events";
import {
  generateMainResumeFromMarkdown,
  generateResumeMarkdownFromPdf,
  getResumeMarkdownState,
  hasConfiguredModel,
  isResumeContentMeaningful,
  parseResumeMarkdownMetadata,
  removeResumeMarkdownAndLegacy,
  RESUME_LEGACY_EXTRACT_PATH,
  RESUME_MAIN_JSON_PATH,
  RESUME_MARKDOWN_PATH,
  RESUME_PDF_PATH,
} from "@/lib/resume-import";
import type { ResumeImportStage } from "@/lib/resume-import";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";
import { createJobFolderWithJD } from "@/lib/workspace-actions";
import { isLikelyPdfFile, pdfFileToDataUrl } from "@/lib/pdf-import";

const providerCatalog: Array<{
  key: string;
  label: string;
  baseURL: string;
  defaultModel: string;
  models: string[];
  hint: string;
}> = [
  {
    key: "DeepSeek",
    label: "DeepSeek（推荐）",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    hint: "可在 DeepSeek 开放平台创建 API Key。",
  },
  {
    key: "火山引擎",
    label: "火山引擎（豆包）",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-1.5-pro-32k",
    models: ["doubao-1.5-pro-32k", "doubao-1.5-lite-32k"],
    hint: "可在火山方舟控制台创建 API Key。",
  },
  {
    key: "通义千问",
    label: "通义千问（阿里云）",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    hint: "可在阿里云 DashScope 控制台申请 API Key。",
  },
  {
    key: "智谱AI",
    label: "智谱 AI",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-plus"],
    hint: "可在智谱开放平台创建 API Key。",
  },
  {
    key: "OpenAI",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
    hint: "需可访问 OpenAI 服务后再配置 API Key。",
  },
  {
    key: "自定义",
    label: "自定义",
    baseURL: "",
    defaultModel: "",
    models: [],
    hint: "填写兼容 OpenAI Chat Completions 的 baseURL 与模型名。",
  },
];

const defaultLlmConfig: LlmConfig = {
  provider: "",
  model: "",
  baseURL: "",
  apiKey: "",
  storageMode: "session-only",
};

const AUTO_SAVE_DELAY_MS = 800;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type DraftTextMap = Record<string, string>;
type JsonViewMode = "render" | "raw";
type ResumeFlowStage = "missing" | "pdf_saved" | "markdown_ready" | "json_prefilled" | "json_saved";
const JSON_VIEW_MODE_KEY = "curator-editor-json-view-mode";
const CUSTOM_RESUME_VIEW_MODE_KEY = "curator-editor-custom-resume-view-mode";
const TOKEN_FOCUS_EVENT = "curator:focus-token-usage";
const SYSTEM_PROMPT_FOCUS_EVENT = "curator:focus-system-prompts";

const emptyResume: ResumeData = {
  id: "main-resume",
  profile: { name: "", phone: "", email: "", wechat: "", targetRole: "" },
  education: [],
  internships: [],
  campusExperience: [],
  projects: [],
  skills: { professional: [], languages: [], certificates: [], tools: [] },
};

type JobCreateForm = {
  company: string;
  position: string;
  jdText: string;
};

const defaultJobCreateForm: JobCreateForm = {
  company: "",
  position: "",
  jdText: "",
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function normalizeResume(input: unknown): ResumeData {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const profile = src.profile && typeof src.profile === "object" ? (src.profile as Record<string, unknown>) : {};
  const skills = src.skills && typeof src.skills === "object" ? (src.skills as Record<string, unknown>) : {};

  return {
    id: typeof src.id === "string" && src.id ? src.id : "main-resume",
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

function serializeResume(resume: ResumeData): string {
  return JSON.stringify(normalizeResume(resume), null, 2);
}

function linesToArray(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines;
}

function arrayToLines(values: string[] | undefined): string {
  return (values ?? []).join("\n");
}

function chipsFromInput(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function isResumeDataEmpty(data: ResumeData) {
  const profile = data.profile ?? { name: "", phone: "", email: "", wechat: "", targetRole: "" };
  const hasProfile = Boolean(profile.name?.trim() || profile.phone?.trim() || profile.email?.trim() || profile.wechat?.trim() || profile.targetRole?.trim());
  const hasEducation = (data.education?.length ?? 0) > 0;
  const hasInternships = (data.internships?.length ?? 0) > 0;
  const hasProjects = (data.projects?.length ?? 0) > 0;
  const hasCampus = (data.campusExperience?.length ?? 0) > 0;
  return !(hasProfile || hasEducation || hasInternships || hasProjects || hasCampus);
}

function getSparseResumeWarnings(data: ResumeData) {
  const warnings: string[] = [];
  const profileFilledCount = [
    data.profile.name,
    data.profile.phone,
    data.profile.email,
    data.profile.wechat ?? "",
    data.profile.targetRole ?? "",
  ].filter((value) => value?.trim()).length;

  if (profileFilledCount <= 1) warnings.push("基础信息");
  if ((data.education?.length ?? 0) === 0) warnings.push("教育经历");
  if ((data.internships?.length ?? 0) === 0) warnings.push("实习经历");
  if ((data.campusExperience?.length ?? 0) === 0) warnings.push("校园经历");
  if ((data.projects?.length ?? 0) === 0) warnings.push("项目经历");

  const hasSkills =
    (data.skills.professional?.length ?? 0) > 0 ||
    (data.skills.languages?.length ?? 0) > 0 ||
    (data.skills.certificates?.length ?? 0) > 0 ||
    (data.skills.tools?.length ?? 0) > 0;
  if (!hasSkills) warnings.push("技能");

  return warnings;
}

function formatSavedAt(timestamp: string | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getApiKeyStorageKey(provider: string) {
  return `curator-ai-api-key:${provider || "default"}`;
}

function getResumeImportStageLabel(stage: ResumeImportStage) {
  if (stage === "pdf_saved") return "状态：PDF 已保存";
  if (stage === "extract_ok") return "状态：文本提取成功";
  if (stage === "extract_failed") return "状态：文本提取失败";
  if (stage === "prefill_ok") return "状态：AI 预填成功";
  if (stage === "prefill_failed") return "状态：AI 预填失败";
  if (stage === "removed") return "状态：已删除导入简历";
  return "状态：导入失败";
}

function getResumeFlowStageLabel(stage: ResumeFlowStage) {
  if (stage === "missing") return "未导入";
  if (stage === "pdf_saved") return "已导入 PDF";
  if (stage === "markdown_ready") return "已生成 Markdown";
  if (stage === "json_prefilled") return "已预填 JSON 待保存";
  return "主简历已保存";
}

function getResumeFlowStageDescription(stage: ResumeFlowStage) {
  if (stage === "missing") return "从 PDF 导入开始，先生成个人简历.md，再整理为主简历 JSON。";
  if (stage === "pdf_saved") return "PDF 已保存，下一步先检查并补充个人简历.md。";
  if (stage === "markdown_ready") return "个人简历.md 已就绪，适合继续生成主简历 JSON。";
  if (stage === "json_prefilled") return "AI 已完成预填，检查无误后点击保存，主简历才会正式生效。";
  return "主简历已完成保存，可以继续绑定岗位并生成文书。";
}

function getResumeFlowStep(stage: ResumeFlowStage) {
  if (stage === "missing") return 0;
  if (stage === "pdf_saved") return 1;
  if (stage === "markdown_ready") return 2;
  return 3;
}

function ResumeFlowDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`h-2.5 w-8 rounded-full transition-colors ${
            current >= step ? "bg-sky-500" : "bg-white/70"
          }`}
        />
      ))}
    </div>
  );
}

function getInitialJsonMode(key: string): JsonViewMode {
  if (typeof window === "undefined") return "render";
  const value = window.localStorage.getItem(key);
  return value === "raw" ? "raw" : "render";
}

function formatTokenCount(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("zh-CN");
}

function formatUsageTime(timestamp: string) {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function FieldLabel({ children }: { children: string }) {
  return <label className="block text-xs text-zinc-500">{children}</label>;
}

function SaveBar({
  title,
  isDirty,
  status,
  lastSavedAt,
  onSave,
}: {
  title: string;
  isDirty: boolean;
  status: SaveStatus;
  lastSavedAt: string | null;
  onSave: () => Promise<void>;
}) {
  const text =
    status === "saving"
      ? "保存中..."
      : status === "error"
        ? "保存失败"
        : isDirty
          ? "未保存"
          : lastSavedAt
            ? `已保存 ${formatSavedAt(lastSavedAt)}`
            : "已保存";

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/95 px-3 py-2 text-xs backdrop-blur dark:bg-zinc-950/95">
      <span className="text-zinc-500">{title} · {text}</span>
      <button
        type="button"
        className="curator-button-secondary px-3 py-1 text-xs"
        onClick={() => void onSave()}
        disabled={status === "saving"}
      >
        立即保存
      </button>
    </div>
  );
}

function ChipEditor({
  title,
  values,
  onChange,
}: {
  title: string;
  values: string[] | undefined;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const items = values ?? [];

  return (
    <div className="space-y-2">
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span key={`${item}-${idx}`} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
            {item}
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-700"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border p-2 text-sm"
          value={input}
          placeholder="输入后回车或点击添加（支持逗号分隔）"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const next = [...items, ...chipsFromInput(input)];
            if (next.length === items.length) return;
            onChange(next);
            setInput("");
          }}
        />
        <button
          type="button"
          className="rounded-md border px-3 text-sm"
          onClick={() => {
            const next = [...items, ...chipsFromInput(input)];
            if (next.length === items.length) return;
            onChange(next);
            setInput("");
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}

export function JsonFormView({ path }: { path: string }) {
  const setLlmConfig = useAppStore((s) => s.setLlmConfig);
  const openFilePath = useAppStore((s) => s.openFilePath);
  const resumePrefillPayload = useAppStore((s) => s.resumePrefillPayload);
  const clearResumePrefillPayload = useAppStore((s) => s.clearResumePrefillPayload);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const llmUsageRecords = useAppStore((s) => s.llmUsageRecords);
  const loadLlmUsageRecords = useAppStore((s) => s.loadLlmUsageRecords);
  const fileCache = useAppStore((s) => s.fileCache);
  const [raw, setRaw] = useState("{}");
  const [resume, setResume] = useState<ResumeData>(emptyResume);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonSaveStatus, setJsonSaveStatus] = useState<SaveStatus>("idle");
  const [jsonLastSavedAt, setJsonLastSavedAt] = useState<string | null>(null);
  const [draftTextByField, setDraftTextByField] = useState<DraftTextMap>({});
  const [modelConfig, setModelConfig] = useState<LlmConfig>(defaultLlmConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [modelConfigStatus, setModelConfigStatus] = useState<SaveStatus>("idle");
  const [modelConfigDirty, setModelConfigDirty] = useState(false);
  const [modelConfigLastSavedAt, setModelConfigLastSavedAt] = useState<string | null>(null);
  const [jobCreateForm, setJobCreateForm] = useState<JobCreateForm>(defaultJobCreateForm);
  const [jobCreateStatus, setJobCreateStatus] = useState<SaveStatus>("idle");
  const [jobCreateDirty, setJobCreateDirty] = useState(false);
  const [jobCreateLastSavedAt, setJobCreateLastSavedAt] = useState<string | null>(null);
  const [jobCreateMessage, setJobCreateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [jsonViewMode, setJsonViewMode] = useState<JsonViewMode>(() => getInitialJsonMode(JSON_VIEW_MODE_KEY));
  const [customResumeViewMode, setCustomResumeViewMode] = useState<JsonViewMode>(() =>
    getInitialJsonMode(CUSTOM_RESUME_VIEW_MODE_KEY),
  );
  const [resumeImporting, setResumeImporting] = useState(false);
  const [resumeImportMessage, setResumeImportMessage] = useState<{
    type: "success" | "warning" | "error";
    stage: ResumeImportStage;
    text: string;
  } | null>(null);
  const [resumeImportStep, setResumeImportStep] = useState<string | null>(null);
  const [resumeImportProgress, setResumeImportProgress] = useState<1 | 2 | 3>(1);
  const [showEmptyResumeForm, setShowEmptyResumeForm] = useState(false);
  const [requireManualResumeSave, setRequireManualResumeSave] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<ResumeData>(emptyResume);
  const hydratedRef = useRef(false);
  const resumePdfInputRef = useRef<HTMLInputElement | null>(null);
  const tokenUsageSectionRef = useRef<HTMLDivElement | null>(null);
  const systemPromptSectionRef = useRef<HTMLDivElement | null>(null);

  const isModelConfig = path.endsWith("模型配置.json");
  const isResume = path.endsWith("主简历.json");
  const isJobCreateConfig = path === "/岗位/_新建岗位.json";
  const isCustomResumeJson = path.startsWith("/简历/定制简历/") && path.endsWith(".json");
  const isResumeEmpty = useMemo(() => isResumeDataEmpty(resume), [resume]);
  const resumePdfFile = fileCache[RESUME_PDF_PATH];
  const resumeMarkdownFile = fileCache[RESUME_MARKDOWN_PATH] ?? fileCache[RESUME_LEGACY_EXTRACT_PATH];
  const resumeMarkdownMeta = useMemo(() => parseResumeMarkdownMetadata(resumeMarkdownFile), [resumeMarkdownFile]);
  const resumeSourceStatus = useMemo<"md-ready" | "md-low-quality" | "md-draft" | "pdf-only" | "json-only" | "missing">(() => {
    const hasImportedPdf = Boolean(resumePdfFile?.content.trim());
    const resumeMdContent = resumeMarkdownFile?.content ?? "";
    const markdownState = getResumeMarkdownState(resumeMdContent);
    const hasMainResume = Boolean(
      fileCache[RESUME_MAIN_JSON_PATH]?.content.trim() && isResumeContentMeaningful(fileCache[RESUME_MAIN_JSON_PATH]?.content ?? ""),
    );
    if (markdownState === "usable") return "md-ready";
    if (markdownState === "low") return "md-low-quality";
    if (markdownState === "draft") return "md-draft";
    if (hasImportedPdf) return "pdf-only";
    if (hasMainResume) return "json-only";
    return "missing";
  }, [fileCache, resumeMarkdownFile, resumePdfFile]);
  const resumeFlowStage = useMemo<ResumeFlowStage>(() => {
    const hasMeaningfulMainResume = Boolean(
      fileCache[RESUME_MAIN_JSON_PATH]?.content.trim() && isResumeContentMeaningful(fileCache[RESUME_MAIN_JSON_PATH]?.content ?? ""),
    );
    if (requireManualResumeSave) return "json_prefilled";
    if (hasMeaningfulMainResume) return "json_saved";
    if (resumeSourceStatus === "md-ready" || resumeSourceStatus === "md-low-quality") return "markdown_ready";
    if (resumeSourceStatus === "pdf-only" || resumeSourceStatus === "md-draft") return "pdf_saved";
    return "missing";
  }, [fileCache, requireManualResumeSave, resumeSourceStatus]);

  const selectedProvider = useMemo(
    () => providerCatalog.find((item) => item.key === modelConfig.provider),
    [modelConfig.provider],
  );
  const modelOptions = selectedProvider?.models ?? [];
  const modelLookup = useMemo(() => {
    const map = new Map<string, Array<{ provider: string; baseURL: string }>>();
    for (const provider of providerCatalog) {
      for (const model of provider.models) {
        const current = map.get(model) ?? [];
        current.push({ provider: provider.key, baseURL: provider.baseURL });
        map.set(model, current);
      }
    }
    return map;
  }, []);

  const usageSummary = useMemo(() => {
    const availableRecords = llmUsageRecords.filter((item) => item.usageSource === "provider");
    const unavailableCount = llmUsageRecords.length - availableRecords.length;
    const promptTotal = availableRecords.reduce((sum, item) => sum + (item.promptTokens ?? 0), 0);
    const completionTotal = availableRecords.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0);
    const total = availableRecords.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0);
    return {
      promptTotal,
      completionTotal,
      total,
      unavailableCount,
      availableCount: availableRecords.length,
      latest: llmUsageRecords.slice(0, 8),
    };
  }, [llmUsageRecords]);

  useEffect(() => {
    hydratedRef.current = false;
    setIsDirty(false);
    setSaveStatus("idle");
    setJsonDirty(false);
    setJsonSaveStatus("idle");
    setDraftTextByField({});
    setModelConfig(defaultLlmConfig);
    setShowApiKey(false);
    setVerifyLoading(false);
    setVerifyMessage(null);
    setModelConfigStatus("idle");
    setModelConfigDirty(false);
    setJobCreateForm(defaultJobCreateForm);
    setJobCreateStatus("idle");
    setJobCreateDirty(false);
    setJobCreateLastSavedAt(null);
    setJobCreateMessage(null);
    setResumeImporting(false);
    setResumeImportMessage(null);
    setResumeImportStep(null);
    setResumeImportProgress(1);
    setShowEmptyResumeForm(false);
    setRequireManualResumeSave(false);
    if (resumePdfInputRef.current) {
      resumePdfInputRef.current.value = "";
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    readFile(path).then((f) => {
      const content = f?.content ?? "{}";
      setRaw(content);
      if (isModelConfig) {
        try {
          const parsed = JSON.parse(content) as Partial<LlmConfig>;
          const merged: LlmConfig = {
            ...defaultLlmConfig,
            ...parsed,
          };
          const storageKey = getApiKeyStorageKey(merged.provider);
          const persistedKey =
            merged.storageMode === "localStorage"
              ? window.localStorage.getItem(storageKey)
              : window.sessionStorage.getItem(storageKey);
          if (persistedKey) merged.apiKey = persistedKey;
          setModelConfig(merged);
          setLlmConfig(merged);
        } catch {
          setModelConfig(defaultLlmConfig);
        }
      }
      if (isResume) {
        try {
          const normalized = normalizeResume(JSON.parse(content));
          setResume(normalized);
          resumeRef.current = normalized;
        } catch {
          setResume(emptyResume);
          resumeRef.current = emptyResume;
        }
      }
      if (isJobCreateConfig) {
        try {
          const parsed = JSON.parse(content) as Partial<JobCreateForm>;
          setJobCreateForm({
            company: typeof parsed.company === "string" ? parsed.company : "",
            position: typeof parsed.position === "string" ? parsed.position : "",
            jdText: typeof parsed.jdText === "string" ? parsed.jdText : "",
          });
        } catch {
          setJobCreateForm(defaultJobCreateForm);
        }
      }
      hydratedRef.current = true;
    });
  }, [isJobCreateConfig, isModelConfig, isResume, path, setLlmConfig]);

  useEffect(() => {
    if (!isModelConfig) return;
    void loadLlmUsageRecords();
  }, [isModelConfig, loadLlmUsageRecords]);

  useEffect(() => {
    if (!isModelConfig) return;

    const focusTokenUsage = () => {
      tokenUsageSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const focusSystemPrompts = () => {
      systemPromptSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };

    window.addEventListener(TOKEN_FOCUS_EVENT, focusTokenUsage);
    window.addEventListener(SYSTEM_PROMPT_FOCUS_EVENT, focusSystemPrompts);
    return () => {
      window.removeEventListener(TOKEN_FOCUS_EVENT, focusTokenUsage);
      window.removeEventListener(SYSTEM_PROMPT_FOCUS_EVENT, focusSystemPrompts);
    };
  }, [isModelConfig]);

  useEffect(() => {
    if (!isResume) return;
    if (!resumePrefillPayload) return;

    setShowEmptyResumeForm(true);
    setResumeImportMessage(resumePrefillPayload.message);
    if (resumePrefillPayload.resume) {
      saveResumeToState(resumePrefillPayload.resume, { requireManualSave: true });
    }
    clearResumePrefillPayload();
  }, [clearResumePrefillPayload, isResume, resumePrefillPayload]);

  function markModelConfigDirty(next: LlmConfig) {
    setModelConfig(next);
    setModelConfigDirty(true);
    setModelConfigStatus("dirty");
    setVerifyMessage(null);
  }

  function markJobCreateDirty(next: JobCreateForm) {
    setJobCreateForm(next);
    setJobCreateDirty(true);
    setJobCreateStatus("dirty");
    setJobCreateMessage(null);
  }

  async function openSystemPrompt(pathToOpen: string, label: string) {
    const ok = await openFilePath(pathToOpen);
    if (!ok) {
      window.alert(`打开${label}失败，请重试。`);
    }
  }

  async function saveJobCreateTemplate(next?: JobCreateForm) {
    const payload = next ?? jobCreateForm;
    setJobCreateStatus("saving");
    try {
      await saveRaw(JSON.stringify(payload, null, 2));
      setJobCreateDirty(false);
      setJobCreateStatus("saved");
      setJobCreateLastSavedAt(new Date().toISOString());
    } catch {
      setJobCreateStatus("error");
    }
  }

  async function submitJobCreate() {
    const payload: JobCreateForm = {
      company: jobCreateForm.company.trim(),
      position: jobCreateForm.position.trim(),
      jdText: jobCreateForm.jdText.trim(),
    };
    if (!payload.company || !payload.position || !payload.jdText) {
      setJobCreateMessage({ type: "error", text: "请完整填写公司、职位和 JD 文本。" });
      return;
    }
    setJobCreateStatus("saving");
    setJobCreateMessage(null);
    try {
      const { folderPath } = await createJobFolderWithJD(payload);
      await saveJobCreateTemplate(payload);
      setJobCreateMessage({ type: "success", text: `岗位已创建：${folderPath}` });
    } catch (error) {
      setJobCreateStatus("error");
      setJobCreateMessage({ type: "error", text: error instanceof Error ? error.message : "创建岗位失败" });
    }
  }

  async function openResumeImportForJobCreate() {
    if (jobCreateDirty) {
      await saveJobCreateTemplate();
    }
    await openFilePath(RESUME_MAIN_JSON_PATH);
  }

  async function saveModelConfig() {
    setModelConfigStatus("saving");
    const next = {
      ...modelConfig,
      provider: modelConfig.provider.trim(),
      model: modelConfig.model.trim(),
      baseURL: modelConfig.baseURL.trim(),
      apiKey: modelConfig.apiKey.trim(),
    };
    try {
      await saveRaw(JSON.stringify(next, null, 2));
      const storageKey = getApiKeyStorageKey(next.provider);
      if (next.storageMode === "localStorage") {
        window.localStorage.setItem(storageKey, next.apiKey);
        window.sessionStorage.removeItem(storageKey);
      } else {
        window.sessionStorage.setItem(storageKey, next.apiKey);
        window.localStorage.removeItem(storageKey);
      }
      setLlmConfig(next);
      setModelConfig(next);
      setModelConfigDirty(false);
      setModelConfigStatus("saved");
      setModelConfigLastSavedAt(new Date().toISOString());
    } catch {
      setModelConfigStatus("error");
    }
  }

  async function verifyConnection() {
    if (!modelConfig.model.trim() || !modelConfig.baseURL.trim() || !modelConfig.apiKey.trim()) {
      setVerifyMessage({ type: "error", text: "请先填写模型名、API Base URL 和 API Key。" });
      return;
    }
    setVerifyLoading(true);
    setVerifyMessage(null);
    try {
      const result = await sendMessage({
        provider: modelConfig.provider,
        model: modelConfig.model.trim(),
        baseURL: modelConfig.baseURL.trim(),
        apiKey: modelConfig.apiKey.trim(),
        messages: [{ role: "user", content: "你好，这是一条测试消息，请回复OK" }],
        usageContext: "verify",
        usageLabel: "模型连接验证",
      });
      if (result.trim().length === 0) {
        setVerifyMessage({ type: "error", text: "连接失败：未收到有效回复。" });
      } else {
        setVerifyMessage({ type: "success", text: "连接成功！模型可用。" });
      }
    } catch (error) {
      setVerifyMessage({
        type: "error",
        text: `连接失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setVerifyLoading(false);
    }
  }

  async function importResumeFromPdf(file: File) {
    if (!isResume) return;

    setResumeImporting(true);
    setResumeImportMessage(null);
    setResumeImportProgress(1);
    setResumeImportStep("正在保存 PDF 文件...");
    try {
      const isPdf = await isLikelyPdfFile(file);
      if (!isPdf) {
        setResumeImportMessage({
          type: "error",
          stage: "error",
          text: "导入失败：请选择 .pdf 文件。",
        });
        return;
      }

      const existingPdf = fileCache[RESUME_PDF_PATH];
      if (existingPdf) {
        const shouldOverwrite = window.confirm("已存在个人简历 PDF，确认覆盖吗？兼容回退用的个人简历.md 可能会被重新生成。");
        if (!shouldOverwrite) return;
      }

      const pdfDataUrl = await pdfFileToDataUrl(file);
      await upsertFile({
        path: RESUME_PDF_PATH,
        name: "个人简历.pdf",
        parentPath: "/简历",
        contentType: "pdf",
        content: pdfDataUrl,
      });
      await useAppStore.getState().reloadTree();
      console.info("[resume-import]", {
        pdf_saved: true,
        file_name: file.name,
        file_size: file.size,
      });
      setResumeImportMessage({
        type: "success",
        stage: "pdf_saved",
        text: "导入成功：PDF 已保存到 /简历/个人简历.pdf。",
      });
      setShowEmptyResumeForm(true);

      if (!hasConfiguredModel(llmConfig)) {
        setResumeImportMessage({
          type: "success",
          stage: "pdf_saved",
          text: "PDF 已保存。下一步请先生成并检查 /简历/个人简历.md；完成模型配置后，可继续生成主简历 JSON。",
        });
      }

      setResumeImportProgress(2);
      setResumeImportStep("正在生成个人简历.md...");
      const markdownResult = await generateResumeMarkdownFromPdf({ file });
      await useAppStore.getState().reloadTree();
      const persistedMarkdownFile =
        (await readFile(RESUME_MARKDOWN_PATH)) ?? (await readFile(RESUME_LEGACY_EXTRACT_PATH));
      const persistedMarkdownContent = persistedMarkdownFile?.content ?? "";
      const persistedMarkdownState = getResumeMarkdownState(persistedMarkdownContent);
      const effectiveMarkdownContent = persistedMarkdownContent || markdownResult.markdownContent || "";
      console.info("[resume-import]", {
        pdf_saved: true,
        extract_response_status: markdownResult.extractResponseStatus ?? "unknown",
        extractor: markdownResult.extractor ?? "none",
        visibleChars: markdownResult.extractVisibleChars ?? 0,
        markdown_written_length: effectiveMarkdownContent.replace(/\s/g, "").length,
        markdown_state: persistedMarkdownState,
        active_resume_source:
          persistedMarkdownState === "usable"
            ? "resume-markdown"
            : persistedMarkdownState === "low"
              ? "resume-markdown-low"
              : "resume-markdown-draft",
      });

      if (markdownResult.message) {
        setResumeImportMessage(markdownResult.message);
      }

      if (hasConfiguredModel(llmConfig) && persistedMarkdownState === "usable") {
        setResumeImportProgress(3);
        setResumeImportStep("正在基于个人简历.md 预填主简历 JSON...");
        console.info("[resume-import]", { main_resume_prefill_started: true, source: "resume-markdown" });
        const prefillResult = await generateMainResumeFromMarkdown({
          llmConfig,
          markdownContent: effectiveMarkdownContent,
          confirmOverwriteMainResume: (message) => window.confirm(message),
        });

        if (prefillResult.resume) {
          saveResumeToState(prefillResult.resume, { requireManualSave: true });
          setShowEmptyResumeForm(true);
        }

        if (prefillResult.message) {
          setResumeImportMessage(prefillResult.message);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "PDF 导入失败，请稍后重试。";
      const retryHint = reason.includes("PDF 解析组件加载失败") ? " 请刷新页面后重试，若仍失败请重启应用后再试。" : "";
      setResumeImportMessage({
        type: "error",
        stage: "error",
        text: `导入失败：${reason}${retryHint}`,
      });
    } finally {
      setResumeImporting(false);
      setResumeImportStep(null);
      if (resumePdfInputRef.current) {
        resumePdfInputRef.current.value = "";
      }
    }
  }

  async function removeImportedResumePdf() {
    if (!isResume) return;
    const hasPdf = Boolean(fileCache[RESUME_PDF_PATH]);
    const hasResumeMd = Boolean(fileCache[RESUME_MARKDOWN_PATH] || fileCache[RESUME_LEGACY_EXTRACT_PATH]);
    if (!hasPdf && !hasResumeMd) {
      setResumeImportMessage({ type: "error", stage: "error", text: "当前没有可删除的个人简历 PDF。" });
      return;
    }

    const ok = window.confirm("确认删除个人简历 PDF 与个人简历.md吗？此操作不会删除主简历 JSON。");
    if (!ok) return;

    try {
      await deleteFile(RESUME_PDF_PATH);
      await removeResumeMarkdownAndLegacy();
      await useAppStore.getState().reloadTree();
      setResumeImportMessage({
        type: "success",
        stage: "removed",
        text: "已删除个人简历 PDF 与个人简历.md，当前将回退使用主简历 JSON。",
      });
    } catch (error) {
      setResumeImportMessage({
        type: "error",
        stage: "error",
        text: `删除失败：${error instanceof Error ? error.message : "请重试"}`,
      });
    }
  }

  async function generateMainResumeFromMarkdownAction() {
    if (!isResume) return;
    if (!hasConfiguredModel(llmConfig)) {
      setResumeImportMessage({
        type: "error",
        stage: "prefill_failed",
        text: "请先在 /AI配置/模型配置.json 中完成模型配置。",
      });
      await openFilePath("/AI配置/模型配置.json");
      return;
    }

    try {
      setResumeImporting(true);
      setResumeImportProgress(3);
      setResumeImportStep("正在基于个人简历.md 生成主简历 JSON...");
      const result = await generateMainResumeFromMarkdown({
        llmConfig,
        confirmOverwriteMainResume: (message) => window.confirm(message),
      });

      if (result.canceled) return;
      if (!result.resume) {
        if (result.message) {
          setResumeImportMessage(result.message);
        }
        await openFilePath(result.blocked ? RESUME_MARKDOWN_PATH : RESUME_MAIN_JSON_PATH);
        return;
      }

      saveResumeToState(result.resume, { requireManualSave: true });
      setShowEmptyResumeForm(true);
      if (result.message) {
        setResumeImportMessage(result.message);
      }
    } catch (error) {
      setResumeImportMessage({
        type: "error",
        stage: "prefill_failed",
        text: `从个人简历.md 生成主简历失败：${error instanceof Error ? error.message : "请稍后重试"}`,
      });
    } finally {
      setResumeImporting(false);
      setResumeImportStep(null);
    }
  }

  const saveRaw = useCallback(
    async (next: string) => {
      setRaw(next);
      await upsertFile({
        path,
        name: path.split("/").pop() || "",
        parentPath: path.split("/").slice(0, -1).join("/") || "/",
        contentType: "json",
        content: next,
      });
    },
    [path],
  );

  const persistResume = useCallback(
    async (snapshot?: ResumeData) => {
      if (!isResume) return;
      const base = snapshot ?? resumeRef.current;
      const merged: ResumeData = {
        ...base,
        internships: base.internships.map((item, index) => {
          const draft = draftTextByField[makeDraftKey("internships", index)];
          return draft === undefined ? item : { ...item, descriptions: linesToArray(draft) };
        }),
        campusExperience: base.campusExperience.map((item, index) => {
          const draft = draftTextByField[makeDraftKey("campusExperience", index)];
          return draft === undefined ? item : { ...item, descriptions: linesToArray(draft) };
        }),
        projects: (base.projects ?? []).map((item, index) => {
          const draft = draftTextByField[makeDraftKey("projects", index)];
          return draft === undefined ? item : { ...item, descriptions: linesToArray(draft) };
        }),
      };
      const target = normalizeResume(merged);
      const content = serializeResume(target);

      setSaveStatus("saving");
      try {
        await saveRaw(content);
        await useAppStore.getState().refreshCurrentFile();
        setResume(target);
        resumeRef.current = target;
        setIsDirty(false);
        setRequireManualResumeSave(false);
        setSaveStatus("saved");
        setLastSavedAt(new Date().toISOString());
        dispatchResumeSaved({ path });
      } catch {
        setSaveStatus("error");
      }
    },
    [draftTextByField, isResume, path, saveRaw],
  );

  const persistGenericJson = useCallback(async () => {
    if (isResume || isModelConfig || isJobCreateConfig) return;
    setJsonSaveStatus("saving");
    try {
      await saveRaw(raw);
      setJsonDirty(false);
      setJsonSaveStatus("saved");
      setJsonLastSavedAt(new Date().toISOString());
    } catch {
      setJsonSaveStatus("error");
    }
  }, [isJobCreateConfig, isModelConfig, isResume, raw, saveRaw]);

  useEffect(() => {
    if (!isResume) return;
    const unregister = registerResumeDraftController(path, {
      getSnapshot: () => normalizeResume(resumeRef.current),
      flush: async () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        await persistResume(resumeRef.current);
      },
    });

    return unregister;
  }, [isResume, path, persistResume]);

  useEffect(() => {
    if (!isResume || !hydratedRef.current || !isDirty || requireManualResumeSave) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void persistResume(resumeRef.current);
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isDirty, isResume, persistResume, requireManualResumeSave, resume]);

  useEffect(() => {
    if (!isResume) return;

    const flush = () => {
      if (!isDirty || requireManualResumeSave) return;
      void persistResume(resumeRef.current);
    };

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [isDirty, isResume, persistResume, requireManualResumeSave]);

  function saveResumeToState(next: ResumeData, options?: { requireManualSave?: boolean }) {
    setResume(next);
    resumeRef.current = next;
    setIsDirty(true);
    setSaveStatus("dirty");
    if (options?.requireManualSave) {
      setRequireManualResumeSave(true);
    }
  }

  function makeDraftKey(section: "internships" | "campusExperience" | "projects", index: number) {
    return `${section}-${index}-descriptions`;
  }

  function setDraftText(section: "internships" | "campusExperience" | "projects", index: number, text: string) {
    const key = makeDraftKey(section, index);
    setDraftTextByField((prev) => ({ ...prev, [key]: text }));
  }

  function clearDraftTextsBySection(section: "internships" | "campusExperience" | "projects") {
    setDraftTextByField((prev) => {
      const next: DraftTextMap = {};
      for (const [key, value] of Object.entries(prev)) {
        if (!key.startsWith(`${section}-`)) next[key] = value;
      }
      return next;
    });
  }

  function getDraftText(
    section: "internships" | "campusExperience" | "projects",
    index: number,
    fallback: string[],
  ) {
    const key = makeDraftKey(section, index);
    return draftTextByField[key] ?? arrayToLines(fallback);
  }

  function updateEducation(index: number, key: "school" | "degree" | "major" | "startDate" | "endDate" | "gpa", value: string) {
    const next = [...resume.education];
    next[index] = { ...next[index], [key]: value };
    saveResumeToState({ ...resume, education: next });
  }

  function updateInternship(index: number, key: "company" | "position" | "startDate" | "endDate" | "descriptions", value: string) {
    const next = [...resume.internships];
    if (key === "descriptions") {
      next[index] = { ...next[index], descriptions: linesToArray(value) };
      setDraftText("internships", index, value);
    } else {
      next[index] = { ...next[index], [key]: value };
    }
    saveResumeToState({ ...resume, internships: next });
  }

  function updateCampus(index: number, key: "organization" | "role" | "startDate" | "endDate" | "descriptions", value: string) {
    const next = [...resume.campusExperience];
    if (key === "descriptions") {
      next[index] = { ...next[index], descriptions: linesToArray(value) };
      setDraftText("campusExperience", index, value);
    } else {
      next[index] = { ...next[index], [key]: value };
    }
    saveResumeToState({ ...resume, campusExperience: next });
  }

  function updateProject(index: number, key: "name" | "role" | "descriptions" | "techStack", value: string) {
    const projects = [...(resume.projects ?? [])];
    if (key === "descriptions") {
      projects[index] = { ...projects[index], descriptions: linesToArray(value) };
      setDraftText("projects", index, value);
    } else if (key === "techStack") {
      projects[index] = { ...projects[index], techStack: chipsFromInput(value) };
    } else {
      projects[index] = { ...projects[index], [key]: value };
    }
    saveResumeToState({ ...resume, projects });
  }

  if (isModelConfig) {
    return (
      <div className="h-full overflow-auto">
        <SaveBar title="AI 模型配置" isDirty={modelConfigDirty} status={modelConfigStatus} lastSavedAt={modelConfigLastSavedAt} onSave={saveModelConfig} />
        <div className="space-y-5 p-5">
          <div ref={tokenUsageSectionRef} className="glass-panel rounded-[24px] border border-white/80 bg-white/80 p-5">
            <p className="text-sm font-medium text-zinc-800">模型与代理配置</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              用于所有聊天与生成链路。这里也会展示最近请求返回的真实 token 用量；如果上游供应商不返回 usage，会明确标记为“暂不可得”。
            </p>
          </div>

          <div>
            <FieldLabel>供应商</FieldLabel>
            <select
              value={modelConfig.provider}
              className="curator-input-surface mt-1 w-full p-2 text-sm"
              onChange={(e) => {
                const provider = e.target.value;
                const meta = providerCatalog.find((item) => item.key === provider);
                const next: LlmConfig = {
                  ...modelConfig,
                  provider,
                  baseURL: meta?.baseURL ?? "",
                  model: meta?.defaultModel ?? "",
                };
                markModelConfigDirty(next);
              }}
            >
              <option value="">请选择供应商</option>
              {providerCatalog.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            {selectedProvider?.hint ? <p className="mt-1 text-xs text-zinc-500">{selectedProvider.hint}</p> : null}
          </div>

          <div>
            <FieldLabel>模型名称（推荐可选，也可手输）</FieldLabel>
            <div className="mt-1 grid grid-cols-1 gap-2">
              <select
                value={modelOptions.includes(modelConfig.model) ? modelConfig.model : ""}
                className="curator-input-surface w-full p-2 text-sm"
                onChange={(e) => {
                  const selectedModel = e.target.value;
                  if (!selectedModel) return;
                  const matchedProviders = modelLookup.get(selectedModel) ?? [];
                  const preferred =
                    matchedProviders.find((item) => item.provider === modelConfig.provider) ??
                    matchedProviders[0];

                  if (!preferred) {
                    markModelConfigDirty({ ...modelConfig, model: selectedModel });
                    return;
                  }

                  markModelConfigDirty({
                    ...modelConfig,
                    model: selectedModel,
                    provider: preferred.provider,
                    baseURL: preferred.baseURL,
                  });
                }}
              >
                <option value="">选择推荐模型（可选）</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <input
                className="curator-input-surface w-full p-2 text-sm"
                value={modelConfig.model}
                placeholder="可手动输入模型名"
                onChange={(e) => markModelConfigDirty({ ...modelConfig, model: e.target.value })}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">已自动匹配服务商与 API Base URL，可手动修改。</p>
          </div>

          <div>
            <FieldLabel>API Base URL</FieldLabel>
            <input
              className="curator-input-surface mt-1 w-full p-2 text-sm"
              value={modelConfig.baseURL}
              placeholder="https://api.example.com/v1"
              onChange={(e) => markModelConfigDirty({ ...modelConfig, baseURL: e.target.value })}
            />
          </div>

          <div>
            <FieldLabel>API Key</FieldLabel>
            <div className="mt-1 flex gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                className="curator-input-surface w-full p-2 text-sm"
                value={modelConfig.apiKey}
                placeholder="请输入 API Key"
                onChange={(e) => markModelConfigDirty({ ...modelConfig, apiKey: e.target.value })}
              />
              <button type="button" className="curator-button-secondary" onClick={() => setShowApiKey((v) => !v)}>
                {showApiKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">API Key 仅保存在浏览器本地，不会写入服务端持久化存储。</p>
          </div>

          <div>
            <FieldLabel>存储模式</FieldLabel>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              <label className="glass-soft flex items-center gap-2 px-3 py-3 text-zinc-700">
                <input
                  type="radio"
                  checked={modelConfig.storageMode === "session-only"}
                  onChange={() => markModelConfigDirty({ ...modelConfig, storageMode: "session-only" })}
                />
                仅当前会话（sessionStorage）
              </label>
              <label className="glass-soft flex items-center gap-2 px-3 py-3 text-zinc-700">
                <input
                  type="radio"
                  checked={modelConfig.storageMode === "localStorage"}
                  onChange={() => markModelConfigDirty({ ...modelConfig, storageMode: "localStorage" })}
                />
                记住在此浏览器（localStorage）
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="curator-button-secondary" onClick={() => void verifyConnection()} disabled={verifyLoading}>
              {verifyLoading ? "验证中..." : "验证连接"}
            </button>
            <button type="button" className="curator-button-primary" onClick={() => void saveModelConfig()} disabled={modelConfigStatus === "saving"}>
              保存配置
            </button>
          </div>

          <div className="glass-panel rounded-[24px] border border-white/80 bg-white/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">Token 使用概览</p>
                <p className="mt-1 text-xs text-zinc-500">仅统计当前代理链路实际返回的 usage；若上游不返回，则会明确标记为“暂不可得”。</p>
              </div>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void loadLlmUsageRecords()}>
                刷新记录
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="glass-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">输入 Token</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatTokenCount(usageSummary.promptTotal)}</p>
              </div>
              <div className="glass-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">输出 Token</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatTokenCount(usageSummary.completionTotal)}</p>
              </div>
              <div className="glass-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">总计 Token</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatTokenCount(usageSummary.total)}</p>
              </div>
              <div className="glass-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">不可得</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{usageSummary.unavailableCount}</p>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-[20px] border border-white/80">
              {usageSummary.latest.length === 0 ? (
                <div className="px-4 py-5 text-sm text-zinc-500">还没有 usage 记录。先做一次验证连接、聊天或文书生成后，这里会出现真实统计。</div>
              ) : (
                <div className="divide-y divide-zinc-100 bg-white/80">
                  {usageSummary.latest.map((record: LlmUsageRecord) => (
                    <div key={record.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1.1fr_1fr_1fr_auto] md:items-center">
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{record.label}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {record.provider || "未标注供应商"} · {record.model || "未标注模型"} · {formatUsageTime(record.timestamp)}
                        </p>
                      </div>
                      <div className="text-xs text-zinc-500">
                        输入 {formatTokenCount(record.promptTokens)} / 输出 {formatTokenCount(record.completionTokens)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        总计 {formatTokenCount(record.totalTokens)} · {record.inputChars} 字输入 / {record.outputChars} 字输出
                      </div>
                      <div className="justify-self-start md:justify-self-end">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${record.usageSource === "provider" ? "bg-sky-50 text-sky-700" : "bg-zinc-100 text-zinc-500"}`}>
                          {record.usageSource === "provider" ? "真实 usage" : "暂不可得"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div ref={systemPromptSectionRef} className="rounded-md border p-3">
            <p className="text-sm font-medium">高级：编辑系统提示词</p>
            <p className="mt-1 text-xs text-zinc-500">
              系统文件默认隐藏。你可以从这里进入各模块 prompt/agent 进行优化。
              文书/报告请仅输出 Markdown 正文（禁止 ``` 或 &#39;&#39;&#39; 包裹）；结构化资产仅输出合法 JSON。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.global.prompt, "全局 Prompt")}>全局 Prompt</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.global.agent, "全局 Agent")}>全局 Agent</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.job.prompt, "岗位 Prompt")}>岗位 Prompt</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.job.agent, "岗位 Agent")}>岗位 Agent</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.resume.prompt, "简历 Prompt")}>简历 Prompt</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.resume.agent, "简历 Agent")}>简历 Agent</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.prep.prompt, "准备包 Prompt")}>准备包 Prompt</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.prep.agent, "准备包 Agent")}>准备包 Agent</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.review.prompt, "复盘 Prompt")}>复盘 Prompt</button>
              <button type="button" className="curator-button-secondary px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.review.agent, "复盘 Agent")}>复盘 Agent</button>
            </div>
            <div className="mt-3 border-t pt-3">
              <p className="text-sm font-medium">新手引导</p>
              <p className="mt-1 text-xs text-zinc-500">引导已统一在右侧 5 步流程面板中，可随时展开查看并一键执行。</p>
              <button
                type="button"
                className="curator-button-secondary mt-2 px-3 py-1 text-xs"
                onClick={() => window.dispatchEvent(new Event("curator:focus-guide"))}
              >
                定位右侧引导
              </button>
            </div>
          </div>

          {verifyMessage ? (
            <p className={`text-sm ${verifyMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
              {verifyMessage.text}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (isJobCreateConfig) {
    return (
      <div className="h-full overflow-auto">
        <SaveBar title="新建岗位" isDirty={jobCreateDirty} status={jobCreateStatus} lastSavedAt={jobCreateLastSavedAt} onSave={() => saveJobCreateTemplate()} />
        <div className="space-y-5 p-5">
          <div className="glass-panel rounded-[24px] border border-white/80 bg-white/80 p-5">
            <p className="text-sm leading-6 text-zinc-600">
              填写后点击“保存并创建岗位”，系统将自动创建岗位目录与 `jd.md`。岗位默认绑定主简历，如需更新，请先导入并保存主简历。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="curator-button-secondary" onClick={() => void openResumeImportForJobCreate()}>
                导入简历
              </button>
              <span className="rounded-full border border-white/80 bg-white/75 px-3 py-2 text-xs text-zinc-500">
                将打开主简历导入页，完成后再回到这里继续建档。
              </span>
            </div>
          </div>
          <div>
            <FieldLabel>公司（必填）</FieldLabel>
            <input
              className="curator-input-surface mt-1 w-full p-2 text-sm"
              value={jobCreateForm.company}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, company: e.target.value })}
              placeholder="例如：字节跳动"
            />
          </div>
          <div>
            <FieldLabel>职位（必填）</FieldLabel>
            <input
              className="curator-input-surface mt-1 w-full p-2 text-sm"
              value={jobCreateForm.position}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, position: e.target.value })}
              placeholder="例如：产品经理"
            />
          </div>
          <div>
            <FieldLabel>JD 文本（必填）</FieldLabel>
            <textarea
              className="curator-input-surface mt-1 min-h-[220px] w-full p-2 text-sm"
              value={jobCreateForm.jdText}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, jdText: e.target.value })}
              placeholder="粘贴完整岗位描述..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="curator-button-primary" onClick={() => void submitJobCreate()} disabled={jobCreateStatus === "saving"}>
              保存并创建岗位
            </button>
            <button type="button" className="curator-button-secondary" onClick={() => void saveJobCreateTemplate()} disabled={jobCreateStatus === "saving"}>
              仅保存表单
            </button>
          </div>
          {jobCreateMessage ? (
            <p className={`text-sm ${jobCreateMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
              {jobCreateMessage.text}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (isCustomResumeJson) {
    let parsed: unknown = null;
    let parseError = "";
    try {
      parsed = JSON.parse(raw);
    } catch {
      parseError = "当前 JSON 格式有误，请先切换到原始模式修正。";
    }
    const resumeModel = normalizeResume(parsed);
    const sparseWarnings = parseError ? [] : getSparseResumeWarnings(resumeModel);

    return (
      <div className="h-full overflow-auto">
        <SaveBar title="定制简历 JSON" isDirty={jsonDirty} status={jsonSaveStatus} lastSavedAt={jsonLastSavedAt} onSave={persistGenericJson} />
        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-zinc-500">
          <span>默认可视化阅读，可切换原始 JSON 编辑</span>
          <div className="flex gap-1">
            <button
              type="button"
              className={`rounded border px-2 py-0.5 ${customResumeViewMode === "render" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : ""}`}
              onClick={() => {
                setCustomResumeViewMode("render");
                window.localStorage.setItem(CUSTOM_RESUME_VIEW_MODE_KEY, "render");
              }}
            >
              可视化
            </button>
            <button
              type="button"
              className={`rounded border px-2 py-0.5 ${customResumeViewMode === "raw" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : ""}`}
              onClick={() => {
                setCustomResumeViewMode("raw");
                window.localStorage.setItem(CUSTOM_RESUME_VIEW_MODE_KEY, "raw");
              }}
            >
              原始 JSON
            </button>
          </div>
        </div>
        {customResumeViewMode === "render" ? (
          <div className="p-4">
            {!parseError && sparseWarnings.length >= 4 ? (
              <div className="mb-4 rounded-[20px] border border-amber-200 bg-amber-50/85 px-4 py-3 text-sm text-amber-800 shadow-[0_14px_28px_rgba(251,191,36,0.08)]">
                <p className="font-medium">这份定制简历已经保存，但当前抽取结果仍不完整</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  目前缺少：{sparseWarnings.map((item) => `「${item}」`).join("、")}。建议先检查主简历内容，再重新生成定制简历。
                </p>
                <div className="mt-3">
                  <button type="button" className="curator-button-secondary px-3 py-1.5 text-xs" onClick={() => void openFilePath(RESUME_MAIN_JSON_PATH)}>
                    打开主简历
                  </button>
                </div>
              </div>
            ) : null}
            {parseError ? <p className="text-sm text-red-600">{parseError}</p> : <ResumeReadonlyView data={resumeModel} />}
          </div>
        ) : (
          <div className="p-4">
            <textarea
              className="h-[calc(100vh-200px)] w-full rounded-md border p-3 font-mono text-xs"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setJsonDirty(true);
                setJsonSaveStatus("dirty");
              }}
              onBlur={() => {
                if (!jsonDirty) return;
                void persistGenericJson();
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (isResume) {
    const step = getResumeFlowStep(resumeFlowStage);
    const markdownQualityLabel =
      resumeSourceStatus === "md-low-quality"
        ? "需先补充 Markdown"
        : resumeSourceStatus === "md-ready"
          ? "Markdown 已就绪"
          : resumeSourceStatus === "md-draft"
            ? "Markdown 待补充"
            : resumePdfFile
              ? "已导入 PDF"
              : "尚未导入";
    const extractorLabel =
      resumeMarkdownMeta?.extractQuality === "failed"
        ? "文本提取失败"
        : resumeMarkdownMeta?.extractor === "pdfjs"
          ? "PDF 文本提取"
          : resumeMarkdownMeta?.extractor
            ? "文本提取"
            : null;
    const statusTone =
      resumeImportMessage?.type === "success"
        ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
        : resumeImportMessage?.type === "warning"
          ? "border-amber-200 bg-amber-50/90 text-amber-700"
          : "border-rose-200 bg-rose-50/90 text-rose-700";

    if (isResumeEmpty && !showEmptyResumeForm) {
      return (
        <div className="flex h-full items-center justify-center overflow-auto p-6">
          <div className="glass-panel glow-panel w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/80 bg-white/75 shadow-[0_30px_80px_rgba(148,163,184,0.16)] backdrop-blur-xl">
            <div className="border-b border-white/70 bg-gradient-to-br from-sky-100/80 via-white/80 to-blue-50/70 px-8 py-8">
              <div className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-sky-700">
                RESUME IMPORT FLOW
              </div>
              <h3 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900">从 PDF 开始整理你的主简历</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                先上传 PDF，系统会生成一份可编辑的 <span className="font-medium text-zinc-900">个人简历.md</span>。你检查内容后，再一键预填主简历 JSON。
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1">1. 上传 PDF</span>
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1">2. 检查个人简历.md</span>
                <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1">3. 生成并保存主简历</span>
              </div>
            </div>
            <div className="grid gap-6 px-8 py-8 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="glass-panel rounded-[28px] border border-white/80 bg-white/80 p-7 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">开始导入</p>
                <h4 className="mt-2 text-xl font-semibold text-zinc-900">把已有简历快速接入 Curator AI</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  本轮只支持文本型 PDF。不会增加额外兜底，目标是让主流中文校招简历的导入路径更直接、更透明。
                </p>
                <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="curator-button-functional rounded-full px-5 py-2.5"
                    disabled={resumeImporting}
                    onClick={() => resumePdfInputRef.current?.click()}
                  >
                    {resumeImporting ? "正在导入 PDF..." : "上传 PDF 简历"}
                  </button>
                  <button
                    type="button"
                    className="curator-button-ghost rounded-full px-4 py-2 text-sm"
                    disabled={resumeImporting}
                    onClick={() => setShowEmptyResumeForm(true)}
                  >
                    直接从零开始填写
                  </button>
                </div>
              </div>
              <div className="glass-panel rounded-[28px] border border-white/80 bg-white/70 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.07)] backdrop-blur-xl">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">导入步骤</p>
                <div className="mt-4 space-y-3">
                  {[
                    { index: 1, title: "上传 PDF", desc: "保存原始简历" },
                    { index: 2, title: "检查 Markdown", desc: "确认个人简历.md" },
                    { index: 3, title: "保存主简历", desc: "检查预填结果" },
                  ].map((item) => (
                    <div
                      key={item.index}
                      className={`rounded-2xl border px-4 py-3 ${
                        step >= item.index ? "border-sky-200 bg-sky-50/80" : "border-white/80 bg-white/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                        <span className="rounded-full border border-white/80 bg-white/80 px-2 py-0.5 text-[11px] text-zinc-500">
                          Step {item.index}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <input
              ref={resumePdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void importResumeFromPdf(file);
              }}
            />
            {resumeImporting && resumeImportStep ? (
              <div className="mx-8 mb-4 rounded-[22px] border border-sky-100 bg-sky-50/80 px-5 py-4 text-left text-xs text-zinc-700">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-900">{resumeImportStep}</p>
                    <p className="mt-1 text-zinc-500">当前正在推进简历导入主链路。</p>
                  </div>
                  <ResumeFlowDots current={resumeImportProgress} />
                </div>
              </div>
            ) : null}
            {resumeImportMessage ? (
              <div className={`mx-8 mb-8 rounded-[22px] border px-5 py-4 text-xs ${statusTone}`}>
                <p className="font-medium">{getResumeImportStageLabel(resumeImportMessage.stage)}</p>
                <p className="mt-1 leading-5">{resumeImportMessage.text}</p>
                {resumeImportMessage.type === "warning" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="curator-button-secondary rounded-full px-3 py-1.5 text-[11px]"
                      onClick={() => void openFilePath(RESUME_MARKDOWN_PATH)}
                    >
                      打开个人简历.md
                    </button>
                    <button
                      type="button"
                      className="curator-button-secondary rounded-full px-3 py-1.5 text-[11px]"
                      onClick={() => setShowEmptyResumeForm(true)}
                    >
                      继续填写主简历
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto">
        <SaveBar title="主简历" isDirty={isDirty} status={saveStatus} lastSavedAt={lastSavedAt} onSave={() => persistResume(resumeRef.current)} />

        <div className="space-y-5 p-5">
          <div className="glass-panel rounded-[28px] border border-white/80 bg-white/74 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-medium tracking-[0.16em] text-zinc-500">
                  主简历导入进度
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-900">{getResumeFlowStageLabel(resumeFlowStage)}</h3>
                  <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    {markdownQualityLabel}
                  </span>
                  {extractorLabel ? (
                    <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs text-zinc-500">
                      {extractorLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{getResumeFlowStageDescription(resumeFlowStage)}</p>
                {resumeMarkdownMeta?.visibleChars ? (
                  <p className="mt-2 text-xs text-zinc-500">个人简历.md 当前约 {resumeMarkdownMeta.visibleChars} 个有效字符。</p>
                ) : null}
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/80 px-4 py-4 shadow-[0_16px_36px_rgba(148,163,184,0.12)]">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">三步主流程</p>
                <div className="mt-3 space-y-2">
                  {[
                    { index: 1, title: "上传 PDF", desc: "保存原始简历" },
                    { index: 2, title: "检查 Markdown", desc: "确认个人简历.md" },
                    { index: 3, title: "保存主简历", desc: "检查预填结果" },
                  ].map((item) => (
                    <div key={item.index} className="flex items-start gap-3 rounded-2xl bg-zinc-50/80 px-3 py-3">
                      <div
                        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          step >= item.index ? "bg-sky-500 text-white" : "bg-white text-zinc-400 shadow-sm"
                        }`}
                      >
                        {item.index}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="curator-button-functional"
                  disabled={resumeImporting}
                  onClick={() => resumePdfInputRef.current?.click()}
                >
                  {resumeImporting ? "正在导入 PDF..." : resumePdfFile ? "重新导入 PDF" : "上传 PDF 简历"}
                </button>
                <button
                  type="button"
                  className="curator-button-secondary"
                  disabled={resumeImporting}
                  onClick={() => void openFilePath(RESUME_MARKDOWN_PATH)}
                >
                  打开个人简历.md
                </button>
                <button
                  type="button"
                  className="curator-button-functional"
                  disabled={resumeImporting}
                  onClick={() => void generateMainResumeFromMarkdownAction()}
                >
                  生成主简历 JSON
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">PDF 只作为导入源，后续生成以个人简历.md 为准。</span>
                <button
                  type="button"
                  className="curator-button-danger px-4 py-2 text-xs"
                  disabled={resumeImporting}
                  onClick={() => void removeImportedResumePdf()}
                >
                  删除导入源
                </button>
              </div>
            </div>
            <input
              ref={resumePdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void importResumeFromPdf(file);
              }}
            />
            {resumeImportMessage ? (
              <div className={`mt-4 rounded-[22px] border px-4 py-4 text-xs ${statusTone}`}>
                <p className="font-medium">{getResumeImportStageLabel(resumeImportMessage.stage)}</p>
                <p className="mt-1 leading-5">{resumeImportMessage.text}</p>
              </div>
            ) : null}
            {resumeImportMessage?.type === "warning" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="curator-button-secondary px-3 py-1.5 text-xs"
                  onClick={() => void openFilePath(RESUME_MARKDOWN_PATH)}
                >
                  先检查 Markdown
                </button>
                <button
                  type="button"
                  className="curator-button-secondary px-3 py-1.5 text-xs"
                  onClick={() => setShowEmptyResumeForm(true)}
                >
                  继续填写主简历
                </button>
              </div>
            ) : null}
            {resumeImporting && resumeImportStep ? (
              <div className="mt-4 rounded-[22px] border border-sky-100 bg-sky-50/80 px-4 py-4 text-xs text-zinc-700">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-900">{resumeImportStep}</p>
                    <p className="mt-1 text-zinc-500">正在推进主简历导入链路。</p>
                  </div>
                  <ResumeFlowDots current={resumeImportProgress} />
                </div>
              </div>
            ) : null}
          </div>

          {requireManualResumeSave ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-800 shadow-[0_16px_32px_rgba(251,191,36,0.12)]">
              <p className="font-medium">主简历已预填，但还没有正式保存</p>
              <p className="mt-1 text-xs leading-5 text-amber-700">
                请先快速检查下方字段，然后点击顶部“立即保存”。只有保存后，这份主简历才会作为后续岗位生成的正式基准。
              </p>
            </div>
          ) : null}

          <div className="glass-panel grid grid-cols-2 gap-3 rounded-[24px] border border-white/80 bg-white/72 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <input className="rounded-md border p-2 text-sm" placeholder="姓名" value={resume.profile.name} onChange={(e) => saveResumeToState({ ...resume, profile: { ...resume.profile, name: e.target.value } })} />
            <input className="rounded-md border p-2 text-sm" placeholder="手机" value={resume.profile.phone} onChange={(e) => saveResumeToState({ ...resume, profile: { ...resume.profile, phone: e.target.value } })} />
            <input className="rounded-md border p-2 text-sm" placeholder="邮箱" value={resume.profile.email} onChange={(e) => saveResumeToState({ ...resume, profile: { ...resume.profile, email: e.target.value } })} />
            <input className="rounded-md border p-2 text-sm" placeholder="微信" value={resume.profile.wechat || ""} onChange={(e) => saveResumeToState({ ...resume, profile: { ...resume.profile, wechat: e.target.value } })} />
            <input className="col-span-2 rounded-md border p-2 text-sm" placeholder="目标岗位（可选）" value={resume.profile.targetRole || ""} onChange={(e) => saveResumeToState({ ...resume, profile: { ...resume.profile, targetRole: e.target.value } })} />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">教育经历</p>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => saveResumeToState({ ...resume, education: [...resume.education, { school: "", degree: "", major: "", startDate: "", endDate: "", gpa: "" }] })}>
                添加教育经历
              </button>
            </div>
            {resume.education.length === 0 ? <p className="text-xs text-zinc-500">暂无教育经历</p> : null}
            {resume.education.map((item, idx) => (
              <div key={`edu-${idx}`} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-md border p-2 text-sm" placeholder="学校" value={item.school} onChange={(e) => updateEducation(idx, "school", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="学历" value={item.degree} onChange={(e) => updateEducation(idx, "degree", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="专业" value={item.major} onChange={(e) => updateEducation(idx, "major", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="GPA（可选）" value={item.gpa || ""} onChange={(e) => updateEducation(idx, "gpa", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="开始时间" value={item.startDate} onChange={(e) => updateEducation(idx, "startDate", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="结束时间" value={item.endDate} onChange={(e) => updateEducation(idx, "endDate", e.target.value)} />
                </div>
                <button type="button" className="rounded-md border px-3 py-1 text-xs text-red-600" onClick={() => saveResumeToState({ ...resume, education: resume.education.filter((_, i) => i !== idx) })}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">实习经历</p>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => {
                clearDraftTextsBySection("internships");
                saveResumeToState({ ...resume, internships: [...resume.internships, { company: "", position: "", startDate: "", endDate: "", descriptions: [] }] });
              }}>
                添加实习经历
              </button>
            </div>
            {resume.internships.length === 0 ? <p className="text-xs text-zinc-500">暂无实习经历</p> : null}
            {resume.internships.map((item, idx) => (
              <div key={`intern-${idx}`} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-md border p-2 text-sm" placeholder="公司" value={item.company} onChange={(e) => updateInternship(idx, "company", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="岗位" value={item.position} onChange={(e) => updateInternship(idx, "position", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="开始时间" value={item.startDate} onChange={(e) => updateInternship(idx, "startDate", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="结束时间" value={item.endDate} onChange={(e) => updateInternship(idx, "endDate", e.target.value)} />
                </div>
                <FieldLabel>工作描述（每行一条）</FieldLabel>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={4} value={getDraftText("internships", idx, item.descriptions)} onChange={(e) => updateInternship(idx, "descriptions", e.target.value)} />
                <button type="button" className="rounded-md border px-3 py-1 text-xs text-red-600" onClick={() => {
                  clearDraftTextsBySection("internships");
                  saveResumeToState({ ...resume, internships: resume.internships.filter((_, i) => i !== idx) });
                }}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">校园经历</p>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => {
                clearDraftTextsBySection("campusExperience");
                saveResumeToState({ ...resume, campusExperience: [...resume.campusExperience, { organization: "", role: "", startDate: "", endDate: "", descriptions: [] }] });
              }}>
                添加校园经历
              </button>
            </div>
            {resume.campusExperience.length === 0 ? <p className="text-xs text-zinc-500">暂无校园经历</p> : null}
            {resume.campusExperience.map((item, idx) => (
              <div key={`campus-${idx}`} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-md border p-2 text-sm" placeholder="组织/社团" value={item.organization} onChange={(e) => updateCampus(idx, "organization", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="角色" value={item.role} onChange={(e) => updateCampus(idx, "role", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="开始时间" value={item.startDate} onChange={(e) => updateCampus(idx, "startDate", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="结束时间" value={item.endDate} onChange={(e) => updateCampus(idx, "endDate", e.target.value)} />
                </div>
                <FieldLabel>描述（每行一条）</FieldLabel>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={4} value={getDraftText("campusExperience", idx, item.descriptions)} onChange={(e) => updateCampus(idx, "descriptions", e.target.value)} />
                <button type="button" className="rounded-md border px-3 py-1 text-xs text-red-600" onClick={() => {
                  clearDraftTextsBySection("campusExperience");
                  saveResumeToState({ ...resume, campusExperience: resume.campusExperience.filter((_, i) => i !== idx) });
                }}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">项目经历</p>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => {
                clearDraftTextsBySection("projects");
                saveResumeToState({ ...resume, projects: [...(resume.projects ?? []), { name: "", role: "", descriptions: [], techStack: [] }] });
              }}>
                添加项目经历
              </button>
            </div>
            {(resume.projects ?? []).length === 0 ? <p className="text-xs text-zinc-500">暂无项目经历</p> : null}
            {(resume.projects ?? []).map((item, idx) => (
              <div key={`project-${idx}`} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-md border p-2 text-sm" placeholder="项目名" value={item.name} onChange={(e) => updateProject(idx, "name", e.target.value)} />
                  <input className="rounded-md border p-2 text-sm" placeholder="角色" value={item.role} onChange={(e) => updateProject(idx, "role", e.target.value)} />
                </div>
                <FieldLabel>项目描述（每行一条）</FieldLabel>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={4} value={getDraftText("projects", idx, item.descriptions)} onChange={(e) => updateProject(idx, "descriptions", e.target.value)} />
                <FieldLabel>技术栈（逗号分隔）</FieldLabel>
                <input className="w-full rounded-md border p-2 text-sm" value={(item.techStack ?? []).join(", ")} onChange={(e) => updateProject(idx, "techStack", e.target.value)} />
                <button type="button" className="rounded-md border px-3 py-1 text-xs text-red-600" onClick={() => {
                  clearDraftTextsBySection("projects");
                  saveResumeToState({ ...resume, projects: (resume.projects ?? []).filter((_, i) => i !== idx) });
                }}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-4 rounded-md border p-3">
            <p className="text-sm font-medium">技能</p>
            <ChipEditor title="专业技能" values={resume.skills.professional} onChange={(next) => saveResumeToState({ ...resume, skills: { ...resume.skills, professional: next } })} />
            <ChipEditor title="语言能力" values={resume.skills.languages} onChange={(next) => saveResumeToState({ ...resume, skills: { ...resume.skills, languages: next } })} />
            <ChipEditor title="证书" values={resume.skills.certificates} onChange={(next) => saveResumeToState({ ...resume, skills: { ...resume.skills, certificates: next } })} />
            <ChipEditor title="工具" values={resume.skills.tools} onChange={(next) => saveResumeToState({ ...resume, skills: { ...resume.skills, tools: next } })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <SaveBar title="JSON 文件" isDirty={jsonDirty} status={jsonSaveStatus} lastSavedAt={jsonLastSavedAt} onSave={persistGenericJson} />
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-zinc-500">
        <span>默认渲染视图，可一键切换原始 JSON 编辑</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded border px-2 py-0.5 ${jsonViewMode === "render" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : ""}`}
            onClick={() => {
              setJsonViewMode("render");
              window.localStorage.setItem(JSON_VIEW_MODE_KEY, "render");
            }}
          >
            渲染视图
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 ${jsonViewMode === "raw" ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : ""}`}
            onClick={() => {
              setJsonViewMode("raw");
              window.localStorage.setItem(JSON_VIEW_MODE_KEY, "raw");
            }}
          >
            原始 JSON
          </button>
        </div>
      </div>
      {jsonViewMode === "render" ? (
        <div className="p-4">
          <GenericJsonRenderView raw={raw} />
        </div>
      ) : (
        <div className="p-4">
          <textarea
            className="h-[calc(100vh-200px)] w-full rounded-md border p-3 font-mono text-xs"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setJsonDirty(true);
              setJsonSaveStatus("dirty");
            }}
            onBlur={() => {
              if (!jsonDirty) return;
              void persistGenericJson();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ResumeReadonlyView({ data }: { data: ResumeData }) {
  const sections: Array<{ title: string; items: string[] }> = [
    {
      title: "教育经历",
      items: data.education.map(
        (x) =>
          `${x.school || "未填写"} · ${x.degree || "未填写"} · ${x.major || "未填写"} (${x.startDate || "?"} - ${x.endDate || "?"})${x.gpa ? ` · GPA ${x.gpa}` : ""}`,
      ),
    },
    {
      title: "实习经历",
      items: data.internships.map(
        (x) =>
          `${x.company || "未填写"} · ${x.position || "未填写"} (${x.startDate || "?"} - ${x.endDate || "?"})\n${x.descriptions.join("\n")}`,
      ),
    },
    {
      title: "校园经历",
      items: data.campusExperience.map(
        (x) =>
          `${x.organization || "未填写"} · ${x.role || "未填写"} (${x.startDate || "?"} - ${x.endDate || "?"})\n${x.descriptions.join("\n")}`,
      ),
    },
    {
      title: "项目经历",
      items: (data.projects ?? []).map(
        (x) =>
          `${x.name || "未填写"} · ${x.role || "未填写"}\n${x.descriptions.join("\n")}${x.techStack?.length ? `\n技术栈：${x.techStack.join(" / ")}` : ""}`,
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h3 className="text-lg font-semibold">{data.profile.name || "未命名候选人"}</h3>
        <p className="mt-1 text-sm text-zinc-600">
          {data.profile.targetRole || "目标岗位未填写"} · {data.profile.phone || "手机未填写"} · {data.profile.email || "邮箱未填写"}
        </p>
        {data.profile.wechat ? <p className="mt-1 text-sm text-zinc-600">微信：{data.profile.wechat}</p> : null}
      </div>

      {sections.map((section) =>
        section.items.length ? (
          <div key={section.title} className="rounded-lg border p-4">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <div className="mt-2 space-y-2">
              {section.items.map((item, idx) => (
                <pre key={`${section.title}-${idx}`} className="whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  {item}
                </pre>
              ))}
            </div>
          </div>
        ) : null,
      )}

      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-semibold">技能</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ...(data.skills.professional ?? []),
            ...(data.skills.languages ?? []),
            ...(data.skills.certificates ?? []),
            ...(data.skills.tools ?? []),
          ].map((skill, idx) => (
            <span key={`${skill}-${idx}`} className="rounded-full border px-2 py-1 text-xs">
              {skill}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenericJsonRenderView({ raw }: { raw: string }) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return <p className="text-sm text-red-600">当前 JSON 格式有误，请切换到原始 JSON 修正后再预览。</p>;
  }
  return <JsonValue value={parsed} depth={0} />;
}

function JsonValue({ value, depth }: { value: unknown; depth: number }) {
  if (value === null || value === undefined) {
    return <span className="text-zinc-400">null</span>;
  }
  if (typeof value === "string") {
    return <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-xs dark:bg-zinc-900">{value}</pre>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-sm">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-zinc-400">[]</span>;
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="rounded-md border p-2">
            <div className="mb-1 text-xs text-zinc-500">[{index}]</div>
            <JsonValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-zinc-400">{"{}"}</span>;
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="rounded-md border p-2">
          <div className="mb-1 text-xs font-medium text-zinc-600">{key}</div>
          <JsonValue value={val} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
