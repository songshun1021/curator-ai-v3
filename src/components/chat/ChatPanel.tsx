"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  Cpu,
  FileText,
  FolderTree,
  Loader2,
  MessageSquarePlus,
  SendHorizonal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { buildContext, getResumeSourceReceipt } from "@/lib/context-builder";
import { sendMessage } from "@/lib/ai-engine";
import { db } from "@/lib/db";
import { readFile } from "@/lib/file-system";
import { createId } from "@/lib/id";
import { canUseAnyLlm, shouldRefreshTrialStatusFromError } from "@/lib/llm-access";
import { getWorkspaceGuideState } from "@/lib/workspace-readiness";
import { useAppStore } from "@/store/app-store";
import type { ChatMessage as ChatMessageRecord, VirtualFile } from "@/types";

type ComposerState = {
  text: string;
  query: string;
  showMentions: boolean;
  referencedFiles: string[];
};

function getJobFolderPath(path: string | null) {
  if (!path) return undefined;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "岗位" || parts.length < 2) return undefined;
  return `/${parts[0]}/${parts[1]}`;
}

function formatPathLabel(path: string | null) {
  if (!path) return "未选中文件";
  return path.split("/").filter(Boolean).join(" / ");
}

function getModelStatusLabel(trialEnabled: boolean, provider: string, model: string) {
  if (trialEnabled) return "平台试用可用";
  if (provider && model) return `${provider} / ${model}`;
  if (provider) return provider;
  return "尚未配置";
}

function getAssistantStatusLabel(canUseLlm: boolean, assistantStreaming: string, isGenerating: boolean) {
  if (!canUseLlm) return "待配置";
  if (assistantStreaming || isGenerating) return "运行中";
  return "就绪";
}

function makeDefaultSystemMessage(args: {
  hasMainResume: boolean;
  hasJd: boolean;
  hasPrep: boolean;
  hasReview: boolean;
  isGenerating: boolean;
  generatingType: string;
  generationNoticeText: string | null;
}) {
  if (args.isGenerating) {
    return `正在处理${args.generatingType || "当前任务"}，完成后系统会把结果和路径同步到这里。`;
  }
  if (args.generationNoticeText) {
    return args.generationNoticeText;
  }
  if (!args.hasMainResume) {
    return "先把主简历准备好，后续岗位匹配、定制简历和准备包都会更稳。";
  }
  if (!args.hasJd) {
    return "岗位 JD 录入后，匹配分析、定制简历和准备包的判断会更准确。";
  }
  if (!args.hasPrep) {
    return "主链路已经就位，下一步更适合围绕当前岗位生成准备包并继续打磨回答。";
  }
  if (!args.hasReview) {
    return "已经有主简历、岗位和准备包，可以在面后沉淀复盘，让下一轮准备自动复用。";
  }
  return "当前工作区主链路已比较完整，接下来更适合围绕当前文件继续提问、校对和补充。";
}

function MessageBubble({ message, streaming = false }: { message: ChatMessageRecord; streaming?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const Icon = isUser ? UserRound : isSystem ? Sparkles : Bot;
  const title = isUser ? "你" : isSystem ? "系统" : "Curator AI";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[24px] border px-4 py-3 shadow-[0_18px_40px_rgba(148,163,184,0.08)] ${
          isUser
            ? "border-sky-100/85 bg-[linear-gradient(180deg,rgba(240,248,255,0.96),rgba(228,241,255,0.86))]"
            : isSystem
              ? "border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,249,252,0.82))]"
              : "border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(250,252,255,0.84))]"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              isUser ? "bg-sky-100 text-sky-600" : "bg-white/90 text-zinc-600"
            }`}
          >
            <Icon size={12} />
          </span>
          <span className="font-medium tracking-[0.04em]">{title}</span>
          {streaming ? <Loader2 size={12} className="animate-spin text-sky-500" /> : null}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-zinc-700">{message.content}</div>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  eyebrow,
  title,
  body,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,251,255,0.82))] px-4 py-4 shadow-[0_20px_50px_rgba(148,163,184,0.07)]">
      <div className="mb-3 flex items-center gap-3">
        <div className="glass-inline flex h-9 w-9 items-center justify-center rounded-full border-white/75 bg-white/86 text-zinc-600">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-400">{eyebrow}</div>
          <div className="text-sm font-semibold text-zinc-800">{title}</div>
        </div>
      </div>
      <p className="whitespace-pre-line text-sm leading-7 text-zinc-600">{body}</p>
    </div>
  );
}

export function ChatPanel() {
  const currentFilePath = useAppStore((state) => state.currentFilePath);
  const fileCache = useAppStore((state) => state.fileCache);
  const llmConfig = useAppStore((state) => state.llmConfig);
  const trialStatus = useAppStore((state) => state.trialStatus);
  const threads = useAppStore((state) => state.threads);
  const currentThreadId = useAppStore((state) => state.currentThreadId);
  const messages = useAppStore((state) => state.messages);
  const loadThreads = useAppStore((state) => state.loadThreads);
  const loadTrialStatus = useAppStore((state) => state.loadTrialStatus);
  const createThread = useAppStore((state) => state.createThread);
  const setCurrentThread = useAppStore((state) => state.setCurrentThread);
  const loadMessages = useAppStore((state) => state.loadMessages);
  const generationNotice = useAppStore((state) => state.generationNotice);
  const isGenerating = useAppStore((state) => state.isGenerating);
  const generatingType = useAppStore((state) => state.generatingType);

  const [assistantStreaming, setAssistantStreaming] = useState("");
  const [resumeSourceLabel, setResumeSourceLabel] = useState("正在识别...");
  const [composer, setComposer] = useState<ComposerState>({
    text: "",
    query: "",
    showMentions: false,
    referencedFiles: [],
  });

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, assistantStreaming]);

  const guideState = useMemo(() => getWorkspaceGuideState(fileCache), [fileCache]);
  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === currentThreadId) ?? null,
    [threads, currentThreadId],
  );
  const jobFolderPath = useMemo(() => getJobFolderPath(currentFilePath), [currentFilePath]);
  const canUseLlm = useMemo(() => canUseAnyLlm(llmConfig, trialStatus), [llmConfig, trialStatus]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const label = await getResumeSourceReceipt(jobFolderPath);
      if (!cancelled) {
        setResumeSourceLabel(label);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [jobFolderPath, currentFilePath, fileCache]);

  const candidates = useMemo(() => {
    const q = composer.query.trim().toLowerCase();
    return Object.values(fileCache)
      .filter((file): file is VirtualFile => file.type === "file")
      .filter((file) => (q ? file.path.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [composer.query, fileCache]);

  const latestSystemMessage =
    [...messages].reverse().find((message) => message.role === "system")?.content ||
    makeDefaultSystemMessage({
      hasMainResume: guideState.hasMainResume,
      hasJd: guideState.hasJd,
      hasPrep: guideState.hasPrep,
      hasReview: guideState.hasReview,
      isGenerating,
      generatingType,
      generationNoticeText: generationNotice?.text ?? null,
    });

  async function saveMessage(threadId: string, role: "user" | "assistant" | "system", content: string) {
    await db.chat_messages.add({
      id: createId(),
      threadId,
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
    const nextTitle = thread?.title === "新对话" && role === "user" ? content.slice(0, 20) : thread?.title || "对话";
    await db.chat_threads.update(threadId, {
      updatedAt: new Date().toISOString(),
      title: nextTitle,
    });
    await loadMessages(threadId);
    await loadThreads();
  }

  async function handleSend(input: { text: string; referencedFiles: string[] }) {
    const threadId = currentThreadId || (await createThread());

    if (!canUseLlm) {
      await saveMessage(
        threadId,
        "system",
        "当前还没有可用模型。请先到 AI 配置页补齐模型、Base URL 和 API Key，或启用平台试用。",
      );
      return;
    }

    await saveMessage(threadId, "user", input.text);

    const context = await buildContext({
      mode: "chat",
      currentFilePath: currentFilePath ?? undefined,
      userPrompt: input.text,
    });

    const extraRefMessages: Array<{ role: "user"; content: string }> = [];
    for (const ref of input.referencedFiles) {
      const file = await readFile(ref);
      if (file) {
        extraRefMessages.push({
          role: "user",
          content: `[引用文件: ${ref}]\n${file.content}`,
        });
      }
    }

    let assistantLive = "";
    setAssistantStreaming("");

    await sendMessage({
      provider: llmConfig.provider,
      model: llmConfig.model?.trim() || undefined,
      baseURL: llmConfig.baseURL?.trim() || undefined,
      apiKey: llmConfig.apiKey?.trim() || undefined,
      messages: [...context.messages, ...extraRefMessages],
      usageContext: "chat",
      usageLabel: currentFilePath ? `聊天 / ${currentFilePath.split("/").pop()}` : "聊天对话",
      onChunk: (chunk) => {
        assistantLive += chunk;
        setAssistantStreaming(assistantLive);
      },
    })
      .then(async (finalText) => {
        setAssistantStreaming("");
        await saveMessage(threadId, "assistant", finalText || assistantLive);
        await loadTrialStatus();
      })
      .catch(async (error) => {
        setAssistantStreaming("");
        const message = error instanceof Error ? error.message : String(error);
        if (shouldRefreshTrialStatusFromError(message)) {
          await loadTrialStatus();
        }
        await saveMessage(
          threadId,
          "system",
          `请求失败：${message}`,
        );
      });
  }

  async function submitComposer() {
    const payload = composer.text.trim();
    if (!payload) return;
    const refs = [...composer.referencedFiles];
    setComposer({
      text: "",
      query: "",
      showMentions: false,
      referencedFiles: [],
    });
    await handleSend({ text: payload, referencedFiles: refs });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent px-4 pb-4 pt-2">
      <div className="glass-soft flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(252,253,255,0.68))] shadow-[0_26px_70px_rgba(148,163,184,0.10)]">
        <div className="border-b border-white/55 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-400">Assistant</div>
              <div className="mt-1 text-[30px] font-semibold tracking-[-0.03em] text-zinc-900">AI 助手</div>
            </div>
            <div className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-500 shadow-[0_10px_24px_rgba(148,163,184,0.08)]">
              {getAssistantStatusLabel(canUseLlm, assistantStreaming, isGenerating)}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="curator-button-functional curator-button-sm shrink-0"
                onClick={() => void createThread()}
              >
                <MessageSquarePlus size={14} />
                新对话
              </button>

              <div className="relative min-w-0 flex-1">
                <select
                  className="curator-input-surface h-11 w-full appearance-none rounded-[18px] px-4 pr-10 text-sm text-zinc-700"
                  value={currentThreadId ?? ""}
                  onChange={(event) => void setCurrentThread(event.target.value)}
                >
                  {threads.length === 0 ? <option value="">默认对话</option> : null}
                  {threads.map((thread) => (
                    <option key={thread.id} value={thread.id}>
                      {thread.title}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400"
                />
              </div>
            </div>

            <div className="rounded-[22px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(249,251,255,0.82))] px-4 py-3 shadow-[0_16px_36px_rgba(148,163,184,0.07)]">
              <div className="flex items-start gap-3">
                <div className="glass-inline mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border-white/75 bg-white/86 text-zinc-500">
                  <FileText size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Conversation</div>
                  <div className="mt-1 text-base font-medium text-zinc-800">
                    {currentThread?.title || "默认对话"}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-zinc-500">
                    围绕当前文件、已引用材料和工作区状态继续提问，不再把这里做成一组工具按钮。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/75 bg-white/84 px-3 py-1 text-[11px] font-medium text-zinc-500">
                      当前文件：{formatPathLabel(currentFilePath)}
                    </span>
                    {composer.referencedFiles.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() =>
                          setComposer((prev) => ({
                            ...prev,
                            referencedFiles: prev.referencedFiles.filter((item) => item !== path),
                          }))
                        }
                        className="rounded-full border border-sky-100/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(236,244,255,0.84))] px-3 py-1 text-[11px] font-medium text-sky-700"
                      >
                        @{path.split("/").pop()} · 移除
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div ref={listRef} className="soft-scrollbar min-h-0 flex-1 space-y-4 overflow-auto px-5 py-5">
          <StatusCard
            icon={<Sparkles size={15} strokeWidth={1.8} />}
            eyebrow="System"
            title="系统消息"
            body={latestSystemMessage}
          />

          <StatusCard
            icon={<FolderTree size={15} strokeWidth={1.8} />}
            eyebrow="System"
            title="系统状态"
            body={`当前文件：${formatPathLabel(currentFilePath)}\n简历来源：${resumeSourceLabel}\n模型状态：${getModelStatusLabel(
              Boolean(trialStatus?.trialEnabled),
              llmConfig.provider || (trialStatus?.provider ?? ""),
              llmConfig.model || (trialStatus?.model ?? ""),
            )}`}
          />

          {messages.length === 0 && !assistantStreaming ? (
            <div className="rounded-[24px] border border-white/68 bg-white/72 px-4 py-5 text-sm leading-7 text-zinc-500 shadow-[0_16px_36px_rgba(148,163,184,0.06)]">
              这里现在是一个真正的 AI 助手面板：你可以直接提问、引用文件，系统状态和最新消息也会一起出现在这块区域里。
            </div>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {assistantStreaming ? (
            <MessageBubble
              message={{
                id: "__streaming__",
                threadId: currentThreadId ?? "",
                role: "assistant",
                content: assistantStreaming,
                timestamp: new Date().toISOString(),
              }}
              streaming
            />
          ) : null}
        </div>

        <div className="border-t border-white/60 px-5 pb-5 pt-4">
          {composer.showMentions ? (
            <div className="glass-soft mb-3 max-h-52 overflow-auto rounded-[22px] p-2">
              <input
                value={composer.query}
                onChange={(event) =>
                  setComposer((prev) => ({
                    ...prev,
                    query: event.target.value,
                  }))
                }
                placeholder="搜索要引用的文件"
                className="curator-input-surface mb-2 h-10 w-full rounded-2xl px-3 text-xs"
              />
              {candidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-400">没有匹配的文件</div>
              ) : null}
              {candidates.map((candidate) => (
                <button
                  key={candidate.path}
                  type="button"
                  onClick={() =>
                    setComposer((prev) => ({
                      ...prev,
                      referencedFiles: prev.referencedFiles.includes(candidate.path)
                        ? prev.referencedFiles
                        : [...prev.referencedFiles, candidate.path],
                      showMentions: false,
                      text: prev.text.replace(/@[^\s]*$/, "") + `@${candidate.name} `,
                    }))
                  }
                  className="block w-full rounded-2xl px-3 py-2 text-left text-xs text-zinc-600 transition hover:bg-white/88"
                >
                  <span className="font-medium text-zinc-700">引用 {candidate.name}</span>
                  <span className="ml-1 text-zinc-400">({candidate.path})</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="glass-soft rounded-[30px] border-white/70 p-3">
            <div className="flex items-end gap-3">
              <textarea
                value={composer.text}
                onChange={(event) => {
                  const next = event.target.value;
                  const match = next.match(/@([^\s]*)$/);
                  setComposer((prev) => ({
                    ...prev,
                    text: next,
                    showMentions: Boolean(match),
                    query: match?.[1] ?? "",
                  }));
                }}
                placeholder="输入消息...（输入 @ 引用文件）"
                className="min-h-[74px] flex-1 resize-none bg-transparent px-3 py-3 text-base leading-7 text-zinc-700 outline-none placeholder:text-zinc-400"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitComposer();
                  }
                }}
              />

              <button
                type="button"
                onClick={() => void submitComposer()}
                className="glass-inline flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,250,255,0.82))] text-zinc-500 shadow-[0_16px_32px_rgba(148,163,184,0.08)] transition hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!composer.text.trim()}
                aria-label="发送消息"
              >
                <SendHorizonal size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
