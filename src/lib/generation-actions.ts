import { sendMessage } from "@/lib/ai-engine";
import { buildContext } from "@/lib/context-builder";
import { db } from "@/lib/db";
import { createFile, fileExists, readFile, upsertFile } from "@/lib/file-system";
import { useAppStore } from "@/store/app-store";
import { ResumeData } from "@/types";

type JobDocType = "match" | "boss" | "email" | "custom-resume";

function getLlmConfig() {
  const raw = useAppStore.getState().llmConfig;
  if (!raw.model || !raw.baseURL || !raw.apiKey) {
    throw new Error("请先在 /AI配置/模型配置.json 中完成模型配置。");
  }
  return raw;
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
  if (!content.trim()) {
    await finishGeneration("done");
    return;
  }
  await writeFileByPath(path, contentType, content);
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
    throw new Error("定制简历生成失败：模型返回内容不是合法 JSON，请点击“重新生成定制简历”。");
  }
  const normalized = normalizeResumePayload(parsed);
  return JSON.stringify(normalized, null, 2);
}

export async function generateJobDoc(jobFolderPath: string, docType: JobDocType) {
  if (!(await fileExists(jobFolderPath))) {
    window.alert(`岗位目录不存在：${jobFolderPath}`);
    return;
  }

  const config = getLlmConfig();
  const kindLabelMap: Record<JobDocType, string> = {
    match: "匹配度分析",
    boss: "BOSS招呼语",
    email: "求职邮件",
    "custom-resume": "定制简历",
  };
  const instructionMap: Record<JobDocType, string> = {
    match: "请输出岗位匹配分析，包含：匹配评分（0-100）、优势、缺口、补强建议。",
    boss: "请输出 BOSS 招呼语，80-120 字，直接可投递。",
    email: "请输出求职邮件，300-500 字，结构清晰、可直接发送。",
    "custom-resume":
      "你必须仅输出一个合法 JSON 对象，字段结构与主简历完全一致。禁止输出任何解释文字、标题、前后缀、Markdown 代码块。缺失字段请填空字符串或空数组。",
  };

  const controller = startGeneration(kindLabelMap[docType]);
  let streamed = "";

  try {
    const context = await buildContext({
      mode: "job-docs",
      jobFolderPath,
      userPrompt: instructionMap[docType],
    });

    const output = await sendMessage({
      ...config,
      messages: context.messages,
      signal: controller.signal,
      onChunk: (chunk) => {
        streamed += chunk;
        appendGenerating(chunk);
      },
    });

    let savedPath = "";
    if (docType === "custom-resume") {
      const meta = await getJobMeta(jobFolderPath);
      const company = meta?.company ?? "未知公司";
      const position = meta?.position ?? "未知岗位";
      const normalizedJson = validateAndNormalizeCustomResume(output);
      savedPath = `/简历/定制简历/${company}-${position}.json`;
      await writeFileByPath(savedPath, "json", normalizedJson);
    } else {
      const fileName = `${getJobDocName(docType)}.md`;
      savedPath = `${jobFolderPath}/${fileName}`;
      await writeFileByPath(savedPath, "md", output);
    }

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(savedPath);
    store.setGenerationNotice(`已保存到：${savedPath}`, savedPath);
    await addSystemNotice(`已保存到：${savedPath}`);
    await finishGeneration("done");
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
      return;
    }
    const message = error instanceof Error ? error.message : "生成失败";
    await finishGeneration("error", message);
    window.alert(message);
  }
}

export async function generatePrepPack(jobFolderPath: string) {
  const config = getLlmConfig();
  const controller = startGeneration("面试准备包");
  let streamed = "";

  try {
    const context = await buildContext({
      mode: "prep-pack",
      jobFolderPath,
      userPrompt: "请按固定结构输出完整面试准备包：高频题、追问点、薄弱点、行动清单。",
    });
    const output = await sendMessage({
      ...config,
      messages: context.messages,
      signal: controller.signal,
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

    const prepPath = `${folderPath}/准备包.md`;
    await writeFileByPath(prepPath, "md", output);
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

    const knowledge = await sendMessage({
      ...config,
      messages: [{ role: "user", content: `请从以下面试准备包中提取需要复习的知识点，按 Markdown 列表逐条输出：\n\n${output}` }],
      signal: controller.signal,
    });
    await writeFileByPath(`${folderPath}/知识清单.md`, "md", knowledge);

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(prepPath);
    store.setGenerationNotice(`已保存到：${prepPath}`, prepPath);
    await addSystemNotice(`已保存到：${prepPath}`);
    await finishGeneration("done");
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
      return;
    }
    const message = error instanceof Error ? error.message : "生成失败";
    await finishGeneration("error", message);
    window.alert(message);
  }
}

export async function generateInterviewReview(interviewFolderPath: string) {
  const config = getLlmConfig();
  const controller = startGeneration("复盘报告");
  let streamed = "";

  try {
    const metaFile = await readFile(`${interviewFolderPath}/meta.json`);
    if (!metaFile) throw new Error("缺少面试 meta.json");
    const meta = JSON.parse(metaFile.content) as { jobFolderPath?: string; round?: string; company?: string; position?: string };
    const jobFolderPath = meta.jobFolderPath;
    if (!jobFolderPath) throw new Error("meta.json 缺少 jobFolderPath");

    const context = await buildContext({
      mode: "interview-review",
      jobFolderPath,
      interviewFolderPath,
      userPrompt: "请输出完整面试复盘报告，包含问题诊断、改进动作、下次面试前清单。",
    });
    const report = await sendMessage({
      ...config,
      messages: context.messages,
      signal: controller.signal,
      onChunk: (chunk) => {
        streamed += chunk;
        appendGenerating(chunk);
      },
    });

    const reportPath = `${interviewFolderPath}/复盘报告.md`;
    await writeFileByPath(reportPath, "md", report);

    const summary = await sendMessage({
      ...config,
      messages: [
        { role: "system", content: "你是信息提取助手。" },
        { role: "user", content: `请从以下复盘报告中提取【行动项】和【知识盲区】，用简洁 Markdown 列表输出。\n\n${report}` },
      ],
      signal: controller.signal,
    });

    const memoryFile = await readFile("/AI配置/记忆摘要.md");
    const date = new Date().toISOString().slice(0, 10);
    const sectionTitle = `\n\n---\n\n## ${date} - ${meta.company ?? "未知公司"}-${meta.position ?? "未知岗位"} ${meta.round ?? ""}\n\n`;
    const merged = `${memoryFile?.content ?? "# 记忆摘要"}${sectionTitle}${summary}`;
    await writeFileByPath("/AI配置/记忆摘要.md", "md", merged, { isSystem: true });

    const store = useAppStore.getState();
    await store.reloadTree();
    await store.openFilePath(reportPath);
    store.setGenerationNotice(`已保存到：${reportPath}`, reportPath);
    await addSystemNotice(`已保存到：${reportPath}`);

    const threadId = store.currentThreadId;
    if (threadId) {
      await db.chat_messages.add({
        id: crypto.randomUUID(),
        threadId,
        role: "system",
        content: "复盘要点已沉淀到记忆摘要，将在下次面试准备中参考。",
        timestamp: new Date().toISOString(),
      });
      await store.loadMessages(threadId);
    }
    await finishGeneration("done");
  } catch (error) {
    if (isAbortError(error)) {
      await saveDraftOnAbort(`${interviewFolderPath}/复盘报告.draft.md`, "md", streamed);
      return;
    }
    const message = error instanceof Error ? error.message : "生成失败";
    await finishGeneration("error", message);
    window.alert(message);
  }
}
