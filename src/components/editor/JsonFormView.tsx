"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteFile, readFile, upsertFile } from "@/lib/file-system";
import { registerResumeDraftController } from "@/lib/resume-draft-sync";
import { LlmConfig, ResumeData } from "@/types";
import { useAppStore } from "@/store/app-store";
import { sendMessage } from "@/lib/ai-engine";
import { dispatchResumeSaved } from "@/lib/action-events";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";
import { createJobFolderWithJD } from "@/lib/workspace-actions";
import { extractTextFromPdfFile, isLikelyPdfFile } from "@/lib/pdf-import";

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

const JSON_VIEW_MODE_KEY = "curator-editor-json-view-mode";
const CUSTOM_RESUME_VIEW_MODE_KEY = "curator-editor-custom-resume-view-mode";

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

function getInitialJsonMode(key: string): JsonViewMode {
  if (typeof window === "undefined") return "render";
  const value = window.localStorage.getItem(key);
  return value === "raw" ? "raw" : "render";
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
        className="rounded-md border px-3 py-1 text-xs"
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
  const llmConfig = useAppStore((s) => s.llmConfig);
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
    stage: "saved" | "extract_warn" | "struct_warn" | "done";
    text: string;
  } | null>(null);
  const [resumeImportStep, setResumeImportStep] = useState<string | null>(null);
  const [resumeImportProgress, setResumeImportProgress] = useState<1 | 2 | 3>(1);
  const [showEmptyResumeForm, setShowEmptyResumeForm] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<ResumeData>(emptyResume);
  const hydratedRef = useRef(false);
  const resumePdfInputRef = useRef<HTMLInputElement | null>(null);

  const isModelConfig = path.endsWith("模型配置.json");
  const isResume = path.endsWith("主简历.json");
  const isJobCreateConfig = path === "/岗位/_新建岗位.json";
  const isCustomResumeJson = path.startsWith("/简历/定制简历/") && path.endsWith(".json");
  const isResumeEmpty = useMemo(() => isResumeDataEmpty(resume), [resume]);
  const resumeSourceStatus = useMemo<"ready" | "pdf-fallback-json" | "pdf-only" | "json-only" | "missing">(() => {
    const hasImportedPdf = Boolean(fileCache["/简历/个人简历.pdf"]?.content.trim());
    const hasImportedExtract = Boolean(fileCache["/简历/个人简历.提取.md"]?.content.trim());
    const hasMainResume = Boolean(fileCache["/简历/主简历.json"]?.content.trim());
    if (hasImportedExtract) return "ready";
    if (hasImportedPdf && hasMainResume) return "pdf-fallback-json";
    if (hasImportedPdf) return "pdf-only";
    if (hasMainResume) return "json-only";
    return "missing";
  }, [fileCache]);

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
        model: modelConfig.model.trim(),
        baseURL: modelConfig.baseURL.trim(),
        apiKey: modelConfig.apiKey.trim(),
        messages: [{ role: "user", content: "你好，这是一条测试消息，请回复OK" }],
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

  function unwrapJsonEnvelope(text: string) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) return fenced[1] ?? "";
    const quoted = trimmed.match(/^'''(?:json)?\s*([\s\S]*?)\s*'''$/i);
    if (quoted) return quoted[1] ?? "";
    return trimmed;
  }

  async function fileToDataUrl(file: File) {
    const buffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const slice = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...Array.from(slice));
    }
    const base64 = btoa(binary);
    return `data:application/pdf;base64,${base64}`;
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
          stage: "done",
          text: "导入失败：请选择 .pdf 文件。",
        });
        return;
      }

      const existingPdf = fileCache["/简历/个人简历.pdf"];
      if (existingPdf) {
        const shouldOverwrite = window.confirm("已存在个人简历 PDF，确认覆盖并替换提取文本吗？");
        if (!shouldOverwrite) return;
      }

      const pdfDataUrl = await fileToDataUrl(file);
      await upsertFile({
        path: "/简历/个人简历.pdf",
        name: "个人简历.pdf",
        parentPath: "/简历",
        contentType: "pdf",
        content: pdfDataUrl,
      });
      await useAppStore.getState().reloadTree();
      setResumeImportMessage({
        type: "success",
        stage: "saved",
        text: "导入成功：PDF 已保存到 /简历/个人简历.pdf。",
      });

      let resumeText = "";
      let extractQuality: "ok" | "low" = "ok";
      try {
        setResumeImportProgress(2);
        setResumeImportStep("正在提取 PDF 文本...");
        const extractResult = await extractTextFromPdfFile(file);
        resumeText = extractResult.text;
        extractQuality = extractResult.quality;
        await upsertFile({
          path: "/简历/个人简历.提取.md",
          name: "个人简历.提取.md",
          parentPath: "/简历",
          contentType: "md",
          content: resumeText,
        });
        await useAppStore.getState().reloadTree();
      } catch (extractError) {
        setShowEmptyResumeForm(true);
        setResumeImportMessage({
          type: "warning",
          stage: "extract_warn",
          text: `导入成功：PDF 已保存；未检测到可复制文字（${extractError instanceof Error ? extractError.message : "未知原因"}），当前回退使用主简历 JSON。`,
        });
        return;
      }

      if (!llmConfig.model || !llmConfig.baseURL || !llmConfig.apiKey) {
        setShowEmptyResumeForm(true);
        setResumeImportMessage({
          type: "warning",
          stage: "struct_warn",
          text: "导入成功：PDF 与提取文本已保存。未配置模型，已跳过自动结构化，你可继续手动编辑主简历 JSON。",
        });
        return;
      }

      try {
        setResumeImportProgress(3);
        setResumeImportStep("AI 正在结构化简历...");
        const result = await sendMessage({
          model: llmConfig.model,
          baseURL: llmConfig.baseURL,
          apiKey: llmConfig.apiKey,
          messages: [
            {
              role: "system",
              content:
                "你是简历结构化助手。你必须仅输出一个合法 JSON 对象，禁止输出任何解释文字、标题、前后缀、Markdown 代码块。",
            },
            {
              role: "user",
              content: `请将以下简历文本结构化为 ResumeData JSON。字段必须包含：id、profile{name,phone,email,wechat,targetRole}、education[]、internships[]、campusExperience[]、projects[]、skills{professional,languages,certificates,tools}。缺失字段填空字符串或空数组。\n\n简历文本如下：\n${resumeText}`,
            },
          ],
        });

        const cleaned = unwrapJsonEnvelope(result);
        const parsed = JSON.parse(cleaned);
        const normalized = normalizeResume(parsed);
        saveResumeToState(normalized);
        setShowEmptyResumeForm(true);
        await useAppStore.getState().reloadTree();
        setResumeImportMessage({
          type: "success",
          stage: "done",
          text:
            extractQuality === "low"
              ? "导入成功：PDF 与提取文本已保存（提取质量较低），主简历已更新到编辑态，请检查后保存。"
              : "导入成功：PDF 与提取文本已保存，主简历已更新到编辑态，请点击“立即保存”。",
        });
      } catch (structError) {
        setShowEmptyResumeForm(true);
        setResumeImportMessage({
          type: "warning",
          stage: "struct_warn",
          text: `导入成功：PDF 与提取文本已保存；自动结构化未完成（${structError instanceof Error ? structError.message : "未知原因"}），请手动编辑主简历 JSON。`,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "当前版本仅支持文本型 PDF（非扫描件）。";
      const retryHint = reason.includes("PDF 解析组件加载失败") ? " 请刷新页面后重试，若仍失败请重启应用后再试。" : "";
      setResumeImportMessage({
        type: "error",
        stage: "done",
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
    const hasPdf = Boolean(fileCache["/简历/个人简历.pdf"]);
    const hasExtract = Boolean(fileCache["/简历/个人简历.提取.md"]);
    if (!hasPdf && !hasExtract) {
      setResumeImportMessage({ type: "error", stage: "done", text: "当前没有可删除的个人简历 PDF。" });
      return;
    }

    const ok = window.confirm("确认删除个人简历 PDF 与提取文本吗？此操作不会删除主简历 JSON。");
    if (!ok) return;

    try {
      await deleteFile("/简历/个人简历.pdf");
      await deleteFile("/简历/个人简历.提取.md");
      await useAppStore.getState().reloadTree();
      setResumeImportMessage({
        type: "success",
        stage: "done",
        text: "已删除个人简历 PDF 与提取文本，当前将回退使用主简历 JSON。",
      });
    } catch (error) {
      setResumeImportMessage({
        type: "error",
        stage: "done",
        text: `删除失败：${error instanceof Error ? error.message : "请重试"}`,
      });
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
    if (!isResume || !hydratedRef.current || !isDirty) return;
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
  }, [isDirty, isResume, persistResume, resume]);

  useEffect(() => {
    if (!isResume) return;

    const flush = () => {
      if (!isDirty) return;
      void persistResume(resumeRef.current);
    };

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [isDirty, isResume, persistResume]);

  function saveResumeToState(next: ResumeData) {
    setResume(next);
    resumeRef.current = next;
    setIsDirty(true);
    setSaveStatus("dirty");
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
        <div className="space-y-4 p-4">
          <div>
            <FieldLabel>供应商</FieldLabel>
            <select
              value={modelConfig.provider}
              className="mt-1 w-full rounded-md border p-2 text-sm"
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
                className="w-full rounded-md border p-2 text-sm"
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
                className="w-full rounded-md border p-2 text-sm"
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
              className="mt-1 w-full rounded-md border p-2 text-sm"
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
                className="w-full rounded-md border p-2 text-sm"
                value={modelConfig.apiKey}
                placeholder="请输入 API Key"
                onChange={(e) => markModelConfigDirty({ ...modelConfig, apiKey: e.target.value })}
              />
              <button type="button" className="rounded-md border px-3 text-sm" onClick={() => setShowApiKey((v) => !v)}>
                {showApiKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">API Key 仅保存在浏览器本地，不会写入服务端持久化存储。</p>
          </div>

          <div>
            <FieldLabel>存储模式</FieldLabel>
            <div className="mt-1 flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  checked={modelConfig.storageMode === "session-only"}
                  onChange={() => markModelConfigDirty({ ...modelConfig, storageMode: "session-only" })}
                />
                仅当前会话（sessionStorage）
              </label>
              <label className="inline-flex items-center gap-2">
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
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => void verifyConnection()} disabled={verifyLoading}>
              {verifyLoading ? "验证中..." : "验证连接"}
            </button>
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => void saveModelConfig()} disabled={modelConfigStatus === "saving"}>
              保存配置
            </button>
          </div>
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">高级：编辑系统提示词</p>
              <p className="mt-1 text-xs text-zinc-500">
                系统文件默认隐藏。你可以从这里进入各模块 prompt/agent 进行优化。
                文书/报告请仅输出 Markdown 正文（禁止 ``` 或 &#39;&#39;&#39; 包裹）；结构化资产仅输出合法 JSON。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.global.prompt, "全局 Prompt")}>全局 Prompt</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.global.agent, "全局 Agent")}>全局 Agent</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.job.prompt, "岗位 Prompt")}>岗位 Prompt</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.job.agent, "岗位 Agent")}>岗位 Agent</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.resume.prompt, "简历 Prompt")}>简历 Prompt</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.resume.agent, "简历 Agent")}>简历 Agent</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.prep.prompt, "准备包 Prompt")}>准备包 Prompt</button>
              <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.prep.agent, "准备包 Agent")}>准备包 Agent</button>
                <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.review.prompt, "复盘 Prompt")}>复盘 Prompt</button>
                <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => void openSystemPrompt(SYSTEM_FILE_PATHS.review.agent, "复盘 Agent")}>复盘 Agent</button>
              </div>
              <div className="mt-3 border-t pt-3">
                <p className="text-sm font-medium">新手引导</p>
                <p className="mt-1 text-xs text-zinc-500">引导已统一在右侧 5 步流程面板中，可随时展开查看并一键执行。</p>
                <button
                  type="button"
                  className="mt-2 rounded-md border px-3 py-1 text-xs"
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
        <div className="space-y-4 p-4">
          <p className="text-sm text-zinc-600">填写后点击“保存并创建岗位”，系统将自动创建岗位目录与 jd.md。</p>
          <div>
            <FieldLabel>公司（必填）</FieldLabel>
            <input
              className="mt-1 w-full rounded-md border p-2 text-sm"
              value={jobCreateForm.company}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, company: e.target.value })}
              placeholder="例如：字节跳动"
            />
          </div>
          <div>
            <FieldLabel>职位（必填）</FieldLabel>
            <input
              className="mt-1 w-full rounded-md border p-2 text-sm"
              value={jobCreateForm.position}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, position: e.target.value })}
              placeholder="例如：产品经理"
            />
          </div>
          <div>
            <FieldLabel>JD 文本（必填）</FieldLabel>
            <textarea
              className="mt-1 min-h-[220px] w-full rounded-md border p-2 text-sm"
              value={jobCreateForm.jdText}
              onChange={(e) => markJobCreateDirty({ ...jobCreateForm, jdText: e.target.value })}
              placeholder="粘贴完整岗位描述..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => void submitJobCreate()} disabled={jobCreateStatus === "saving"}>
              保存并创建岗位
            </button>
            <button type="button" className="rounded-md border px-3 py-1 text-sm" onClick={() => void saveJobCreateTemplate()} disabled={jobCreateStatus === "saving"}>
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
    if (isResumeEmpty && !showEmptyResumeForm) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-xl border p-6 text-center">
            <h3 className="text-lg font-semibold">创建你的主简历</h3>
            <p className="mt-2 text-sm text-zinc-500">
              推荐先导入已完成的 PDF 简历，系统会自动提取并填充主简历 JSON，你只需微调。
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                className="rounded-md border bg-zinc-900 px-5 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                disabled={resumeImporting}
                onClick={() => resumePdfInputRef.current?.click()}
              >
                {resumeImporting ? "正在导入 PDF..." : "导入 PDF 简历"}
              </button>
              <button
                type="button"
                className="text-sm text-zinc-500 underline underline-offset-4"
                disabled={resumeImporting}
                onClick={() => setShowEmptyResumeForm(true)}
              >
                从零开始填写
              </button>
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
              <div className="mt-4 rounded-md border bg-zinc-50 p-3 text-left text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                <p>{resumeImportStep}</p>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={`h-2 w-2 rounded-full ${resumeImportProgress >= step ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {resumeImportMessage ? (
              <p
                className={`mt-3 text-xs ${
                  resumeImportMessage.type === "success"
                    ? "text-emerald-600"
                    : resumeImportMessage.type === "warning"
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {resumeImportMessage.text}
              </p>
            ) : null}
            {resumeImportMessage?.type === "warning" ? (
              <div className="mt-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setShowEmptyResumeForm(true)}
                >
                  继续手动填写主简历
                </button>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto">
        <SaveBar title="主简历" isDirty={isDirty} status={saveStatus} lastSavedAt={lastSavedAt} onSave={() => persistResume(resumeRef.current)} />

        <div className="space-y-4 p-4">
          <h3 className="text-sm font-semibold">主简历表单</h3>
          <div className="rounded-md border bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            当前简历来源：
            {resumeSourceStatus === "ready" ? " 已导入PDF（优先）" : null}
            {resumeSourceStatus === "pdf-fallback-json" ? " 已导入PDF（提取缺失，当前回退主简历JSON）" : null}
            {resumeSourceStatus === "pdf-only" ? " 已导入PDF（待提取，建议补充主简历JSON）" : null}
            {resumeSourceStatus === "json-only" ? " 仅主简历JSON" : null}
            {resumeSourceStatus === "missing" ? " 未配置简历（请先导入PDF或填写主简历）" : null}
          </div>
          <div className="rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1 text-xs"
                disabled={resumeImporting}
                onClick={() => resumePdfInputRef.current?.click()}
              >
                {resumeImporting ? "正在导入 PDF..." : "重新导入 PDF"}
              </button>
              <button
                type="button"
                className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600"
                disabled={resumeImporting}
                onClick={() => void removeImportedResumePdf()}
              >
                删除个人简历 PDF
              </button>
              <span className="text-xs text-zinc-500">当前版本仅支持可复制文字的 PDF，扫描件/OCR 暂不支持。</span>
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
              <p
                className={`mt-2 text-xs ${
                  resumeImportMessage.type === "success"
                    ? "text-emerald-600"
                    : resumeImportMessage.type === "warning"
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {resumeImportMessage.text}
              </p>
            ) : null}
            {resumeImportMessage?.type === "warning" ? (
              <div className="mt-2">
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => setShowEmptyResumeForm(true)}
                >
                  继续手动填写主简历
                </button>
              </div>
            ) : null}
            {resumeImporting && resumeImportStep ? (
              <div className="mt-2 rounded-md border bg-zinc-50 p-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                <p>{resumeImportStep}</p>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      className={`h-2 w-2 rounded-full ${resumeImportProgress >= step ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
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
