import { create } from "zustand";
import { db } from "@/lib/db";
import { getFileTree, readFile } from "@/lib/file-system";
import { createId } from "@/lib/id";
import type { ResumeImportStage } from "@/lib/resume-import";
import { ChatMessage, ChatThread, LlmConfig, LlmUsageRecord, ResumeData, TreeNode, TrialStatus, VirtualFile } from "@/types";

interface AppState {
  tree: TreeNode[];
  currentFilePath: string | null;
  expandedFolders: string[];
  fileCache: Record<string, VirtualFile>;
  markdownEditOncePaths: Record<string, true>;

  isGenerating: boolean;
  generatingType: string;
  generatingContent: string;
  generationStatus: "idle" | "running" | "canceling" | "error";
  generationErrorMessage: string;
  generationAbortController: AbortController | null;
  generationNotice: { text: string; path: string | null } | null;
  pendingRevealPath: string | null;
  resumePrefillPayload:
    | {
        resume?: ResumeData;
        incompleteSections?: string[];
        message: { type: "success" | "warning" | "error"; stage: ResumeImportStage; text: string };
      }
    | null;

  llmConfig: LlmConfig;
  trialStatus: TrialStatus | null;

  threads: ChatThread[];
  currentThreadId: string | null;
  messages: ChatMessage[];
  llmUsageRecords: LlmUsageRecord[];

  setCurrentFilePath: (path: string | null) => void;
  openFilePath: (path: string) => Promise<boolean>;
  markMarkdownEditOnce: (path: string) => void;
  consumeMarkdownEditOnce: (path: string) => boolean;
  consumePendingRevealPath: () => void;
  toggleFolder: (path: string) => void;
  setLlmConfig: (config: LlmConfig) => void;
  startGeneration: (kind: string, controller: AbortController) => void;
  appendGenerationChunk: (chunk: string) => void;
  setGenerationCanceling: () => void;
  setGenerationError: (message: string) => void;
  setGenerationNotice: (text: string, path?: string | null) => void;
  clearGenerationNotice: () => void;
  setResumePrefillPayload: (payload: AppState["resumePrefillPayload"]) => void;
  clearResumePrefillPayload: () => void;
  consumeResumePrefillPayload: () => AppState["resumePrefillPayload"];
  clearGeneration: () => void;
  cancelGeneration: () => void;

  reloadTree: () => Promise<void>;
  refreshCurrentFile: () => Promise<void>;

  loadThreads: () => Promise<void>;
  createThread: () => Promise<string>;
  setCurrentThread: (id: string) => Promise<void>;
  loadMessages: (threadId: string) => Promise<void>;
  loadLlmUsageRecords: (limit?: number) => Promise<void>;
  loadTrialStatus: () => Promise<void>;
}

const defaultLlmConfig: LlmConfig = {
  provider: "",
  model: "",
  baseURL: "",
  apiKey: "",
  storageMode: "session-only",
};

export const useAppStore = create<AppState>((set, get) => ({
  tree: [],
  currentFilePath: null,
  expandedFolders: ["/简历", "/岗位", "/面试准备包", "/面试复盘", "/AI配置"],
  fileCache: {},
  markdownEditOncePaths: {},
  isGenerating: false,
  generatingType: "",
  generatingContent: "",
  generationStatus: "idle",
  generationErrorMessage: "",
  generationAbortController: null,
  generationNotice: null,
  pendingRevealPath: null,
  resumePrefillPayload: null,
  llmConfig: defaultLlmConfig,
  trialStatus: null,
  threads: [],
  currentThreadId: null,
  messages: [],
  llmUsageRecords: [],

  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  openFilePath: async (path) => {
    await get().reloadTree();
    const file = await readFile(path);
    if (!file || file.type !== "file") return false;

    const parts = path.split("/").filter(Boolean);
    const folderPaths: string[] = [];
    for (let i = 0; i < parts.length - 1; i += 1) {
      folderPaths.push(`/${parts.slice(0, i + 1).join("/")}`);
    }

    set((s) => ({
      currentFilePath: path,
      expandedFolders: Array.from(new Set([...s.expandedFolders, ...folderPaths])),
      pendingRevealPath: path,
    }));
    await get().refreshCurrentFile();
    return true;
  },
  markMarkdownEditOnce: (path) =>
    set((s) => ({
      markdownEditOncePaths: { ...s.markdownEditOncePaths, [path]: true },
    })),
  consumeMarkdownEditOnce: (path) => {
    let shouldEdit = false;
    set((s) => {
      if (!s.markdownEditOncePaths[path]) return s;
      shouldEdit = true;
      const next = { ...s.markdownEditOncePaths };
      delete next[path];
      return { ...s, markdownEditOncePaths: next };
    });
    return shouldEdit;
  },
  consumePendingRevealPath: () => set({ pendingRevealPath: null }),
  toggleFolder: (path) =>
    set((s) => ({
      expandedFolders: s.expandedFolders.includes(path)
        ? s.expandedFolders.filter((p) => p !== path)
        : [...s.expandedFolders, path],
    })),

  setLlmConfig: (config) => set({ llmConfig: config }),
  startGeneration: (kind, controller) =>
    set({
      isGenerating: true,
      generatingType: kind,
      generatingContent: "",
      generationStatus: "running",
      generationErrorMessage: "",
      generationAbortController: controller,
    }),
  appendGenerationChunk: (chunk) =>
    set((s) => ({
      generatingContent: s.generatingContent + chunk,
    })),
  setGenerationCanceling: () => set({ generationStatus: "canceling" }),
  setGenerationError: (message) =>
    set({
      generationStatus: "error",
      generationErrorMessage: message,
    }),
  setGenerationNotice: (text, path = null) => set({ generationNotice: { text, path } }),
  clearGenerationNotice: () => set({ generationNotice: null }),
  setResumePrefillPayload: (payload) => set({ resumePrefillPayload: payload }),
  clearResumePrefillPayload: () => set({ resumePrefillPayload: null }),
  consumeResumePrefillPayload: () => {
    const payload = get().resumePrefillPayload;
    set({ resumePrefillPayload: null });
    return payload;
  },
  clearGeneration: () =>
    set({
      isGenerating: false,
      generatingType: "",
      generatingContent: "",
      generationStatus: "idle",
      generationErrorMessage: "",
      generationAbortController: null,
    }),
  cancelGeneration: () => {
    const controller = get().generationAbortController;
    if (controller) {
      set({ generationStatus: "canceling" });
      controller.abort();
    }
  },

  reloadTree: async () => {
    const tree = await getFileTree();
    const cache: Record<string, VirtualFile> = {};
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        cache[node.file.path] = node.file;
        walk(node.children);
      }
    };
    walk(tree);
    set({ tree, fileCache: cache });
    await get().refreshCurrentFile();
  },

  refreshCurrentFile: async () => {
    const current = get().currentFilePath;
    if (!current) return;
    const f = await readFile(current);
    if (!f) return;
    set((s) => ({ fileCache: { ...s.fileCache, [current]: f } }));

    if (current === "/AI配置/模型配置.json") {
      try {
        const config = JSON.parse(f.content) as LlmConfig;
        set({ llmConfig: config });
      } catch {
        // ignore parse errors
      }
    }
  },

  loadThreads: async () => {
    const threads = await db.chat_threads.orderBy("updatedAt").reverse().toArray();
    set({ threads });

    let currentThreadId = get().currentThreadId;
    if (!currentThreadId && threads.length > 0) {
      currentThreadId = threads[0].id;
      set({ currentThreadId });
    }

    if (currentThreadId) {
      await get().loadMessages(currentThreadId);
    }
  },

  createThread: async () => {
    const now = new Date().toISOString();
    const threadId = createId();
    const thread = { id: threadId, title: "新对话", createdAt: now, updatedAt: now };
    await db.chat_threads.add(thread);
    await get().loadThreads();
    await get().setCurrentThread(threadId);
    return threadId;
  },

  setCurrentThread: async (id) => {
    set({ currentThreadId: id });
    await get().loadMessages(id);
  },

  loadMessages: async (threadId) => {
    const messages = await db.chat_messages.where("threadId").equals(threadId).sortBy("timestamp");
    set({ messages });
  },
  loadLlmUsageRecords: async (limit = 20) => {
    const llmUsageRecords = await db.llm_usage.orderBy("timestamp").reverse().limit(limit).toArray();
    set({ llmUsageRecords });
  },
  loadTrialStatus: async () => {
    try {
      const res = await fetch("/api/trial/status", { cache: "no-store" });
      if (!res.ok) throw new Error("trial status failed");
      const trialStatus = (await res.json()) as TrialStatus;
      (globalThis as { __curatorTrialStatus?: TrialStatus }).__curatorTrialStatus = trialStatus;
      set({ trialStatus });
    } catch {
      (globalThis as { __curatorTrialStatus?: TrialStatus | null }).__curatorTrialStatus = null;
      set({ trialStatus: null });
    }
  },
}));
