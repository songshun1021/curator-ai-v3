import {
  DEFAULT_JOB_PROMPT,
  DEFAULT_JOB_SKILL,
  DEFAULT_PREP_PROMPT,
  DEFAULT_PREP_SKILL,
  DEFAULT_RESUME_PROMPT,
  DEFAULT_RESUME_SKILL,
  DEFAULT_REVIEW_PROMPT,
  DEFAULT_REVIEW_SKILL,
  DEFAULT_SYSTEM_AGENT,
  DEFAULT_SYSTEM_PROMPT,
} from "@/lib/default-prompts";
import { db } from "@/lib/db";
import { createFile, deleteFile, readFile } from "@/lib/file-system";
import { migrateLegacyInterviewFoldersIfNeeded } from "@/lib/interview-migration";
import { SYSTEM_FILE_PATHS } from "@/lib/system-files";

function emptyResumeJson() {
  return JSON.stringify(
    {
      id: "main-resume",
      profile: { name: "", phone: "", email: "", wechat: "", targetRole: "" },
      education: [],
      internships: [],
      campusExperience: [],
      projects: [],
      skills: { professional: [], languages: [], certificates: [], tools: [] },
    },
    null,
    2,
  );
}

async function createFolder(path: string, parentPath: string, isSystem = false) {
  const exists = await readFile(path);
  if (exists) return;
  const name = path.split("/").filter(Boolean).at(-1) ?? path;
  await createFile({
    path,
    name,
    type: "folder",
    contentType: "none",
    content: "",
    isSystem,
    isGenerated: false,
    parentPath,
    metadata: "{}",
  });
}

async function createMd(path: string, parentPath: string, content: string, isSystem = true) {
  const exists = await readFile(path);
  if (exists) return;
  await createFile({
    path,
    name: path.split("/").pop() ?? "",
    type: "file",
    contentType: "md",
    content,
    isSystem,
    isGenerated: false,
    parentPath,
    metadata: "{}",
  });
}

async function createJson(path: string, parentPath: string, content: string, isSystem = true) {
  const exists = await readFile(path);
  if (exists) return;
  await createFile({
    path,
    name: path.split("/").pop() ?? "",
    type: "file",
    contentType: "json",
    content,
    isSystem,
    isGenerated: false,
    parentPath,
    metadata: "{}",
  });
}

async function ensureSystemMd(args: {
  path: string;
  parentPath: string;
  defaultContent: string;
  legacyPaths?: string[];
}) {
  const current = await readFile(args.path);
  if (current) return;

  let content = args.defaultContent;
  for (const legacyPath of args.legacyPaths ?? []) {
    const legacy = await readFile(legacyPath);
    if (legacy?.content?.trim()) {
      content = legacy.content;
      break;
    }
  }

  await createMd(args.path, args.parentPath, content, true);
}

async function removeLegacySystemFiles() {
  const legacyPaths = [
    SYSTEM_FILE_PATHS.global.legacyPrompt,
    SYSTEM_FILE_PATHS.resume.legacyPrompt,
    SYSTEM_FILE_PATHS.resume.legacyAgent,
    SYSTEM_FILE_PATHS.job.legacyPrompt,
    SYSTEM_FILE_PATHS.job.legacyAgent,
    SYSTEM_FILE_PATHS.prep.legacyPrompt,
    SYSTEM_FILE_PATHS.prep.legacyAgent,
    SYSTEM_FILE_PATHS.review.legacyPrompt,
    SYSTEM_FILE_PATHS.review.legacyAgent,
  ].filter(Boolean) as string[];

  for (const path of legacyPaths) {
    const legacy = await readFile(path);
    if (!legacy) continue;
    await deleteFile(path);
  }
}

async function ensureSystemFilesLayout() {
  await createFolder(SYSTEM_FILE_PATHS.global.folder, "/AI配置", true);
  await createFolder(SYSTEM_FILE_PATHS.resume.folder, "/简历", true);
  await createFolder(SYSTEM_FILE_PATHS.job.folder, "/岗位", true);
  await createFolder(SYSTEM_FILE_PATHS.prep.folder, "/面试准备包", true);
  await createFolder(SYSTEM_FILE_PATHS.review.folder, "/面试复盘", true);

  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.global.prompt,
    parentPath: SYSTEM_FILE_PATHS.global.folder,
    defaultContent: DEFAULT_SYSTEM_PROMPT,
    legacyPaths: [SYSTEM_FILE_PATHS.global.legacyPrompt],
  });
  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.global.agent,
    parentPath: SYSTEM_FILE_PATHS.global.folder,
    defaultContent: DEFAULT_SYSTEM_AGENT,
  });

  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.resume.prompt,
    parentPath: SYSTEM_FILE_PATHS.resume.folder,
    defaultContent: DEFAULT_RESUME_PROMPT,
    legacyPaths: [SYSTEM_FILE_PATHS.resume.legacyPrompt],
  });
  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.resume.agent,
    parentPath: SYSTEM_FILE_PATHS.resume.folder,
    defaultContent: DEFAULT_RESUME_SKILL,
    legacyPaths: [SYSTEM_FILE_PATHS.resume.legacyAgent],
  });

  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.job.prompt,
    parentPath: SYSTEM_FILE_PATHS.job.folder,
    defaultContent: DEFAULT_JOB_PROMPT,
    legacyPaths: [SYSTEM_FILE_PATHS.job.legacyPrompt],
  });
  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.job.agent,
    parentPath: SYSTEM_FILE_PATHS.job.folder,
    defaultContent: DEFAULT_JOB_SKILL,
    legacyPaths: [SYSTEM_FILE_PATHS.job.legacyAgent],
  });

  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.prep.prompt,
    parentPath: SYSTEM_FILE_PATHS.prep.folder,
    defaultContent: DEFAULT_PREP_PROMPT,
    legacyPaths: [SYSTEM_FILE_PATHS.prep.legacyPrompt],
  });
  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.prep.agent,
    parentPath: SYSTEM_FILE_PATHS.prep.folder,
    defaultContent: DEFAULT_PREP_SKILL,
    legacyPaths: [SYSTEM_FILE_PATHS.prep.legacyAgent],
  });

  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.review.prompt,
    parentPath: SYSTEM_FILE_PATHS.review.folder,
    defaultContent: DEFAULT_REVIEW_PROMPT,
    legacyPaths: [SYSTEM_FILE_PATHS.review.legacyPrompt],
  });
  await ensureSystemMd({
    path: SYSTEM_FILE_PATHS.review.agent,
    parentPath: SYSTEM_FILE_PATHS.review.folder,
    defaultContent: DEFAULT_REVIEW_SKILL,
    legacyPaths: [SYSTEM_FILE_PATHS.review.legacyAgent],
  });

  await removeLegacySystemFiles();
}

async function ensureCoreWorkspaceFiles() {
  await createFolder("/简历", "/");
  await createFolder("/岗位", "/");
  await createFolder("/面试准备包", "/");
  await createFolder("/面试复盘", "/");
  await createFolder("/AI配置", "/");
  await createFolder("/简历/定制简历", "/简历");

  await createJson("/简历/主简历.json", "/简历", emptyResumeJson(), false);
  await createJson(
    "/AI配置/模型配置.json",
    "/AI配置",
    JSON.stringify(
      {
        provider: "",
        model: "",
        baseURL: "",
        apiKey: "",
        storageMode: "session-only",
      },
      null,
      2,
    ),
    false,
  );
  await createMd(
    "/AI配置/记忆摘要.md",
    "/AI配置",
    "# 记忆摘要\n\n> 此文件由系统自动维护，记录你的求职经历要点。\n\n暂无记录。",
  );
}

export async function initWorkspace(): Promise<void> {
  const count = await db.files.count();

  if (count === 0) {
    await createFolder("/简历", "/");
    await createFolder("/岗位", "/");
    await createFolder("/面试准备包", "/");
    await createFolder("/面试复盘", "/");
    await createFolder("/AI配置", "/");
    await createFolder("/简历/定制简历", "/简历");

    await createJson("/简历/主简历.json", "/简历", emptyResumeJson(), false);
    await createJson(
      "/AI配置/模型配置.json",
      "/AI配置",
      JSON.stringify(
        {
          provider: "",
          model: "",
          baseURL: "",
          apiKey: "",
          storageMode: "session-only",
        },
        null,
        2,
      ),
      false,
    );
    await createMd(
      "/AI配置/记忆摘要.md",
      "/AI配置",
      "# 记忆摘要\n\n> 此文件由系统自动维护，记录你的求职经历要点。\n\n暂无记录。",
    );

    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.chat_threads.add({
      id: threadId,
      title: "默认对话",
      createdAt: now,
      updatedAt: now,
    });
  }

  await ensureCoreWorkspaceFiles();
  await ensureSystemFilesLayout();
  await migrateLegacyInterviewFoldersIfNeeded();

  const modelConfig = await readFile("/AI配置/模型配置.json");
  if (modelConfig?.isSystem) {
    await db.files.update(modelConfig.id, {
      isSystem: false,
      updatedAt: new Date().toISOString(),
    });
  }
}
