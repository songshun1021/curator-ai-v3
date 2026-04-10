import { db } from "@/lib/db";
import { createFile, deleteFile, fileExists, readFile, upsertFile } from "@/lib/file-system";
import { getInterviewJobFolderPath, INTERVIEW_ROOT, normalizeRoundName } from "@/lib/interview-paths";

const MIGRATION_DONE_KEY = "curator-migrate-interview-v1";

type InterviewMeta = {
  jobId?: string;
  jobFolderPath?: string;
  company?: string;
  position?: string;
  round?: string;
  date?: string;
  createdAt?: string;
};

function parseJson<T>(content: string | undefined): T | null {
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function safeFolderName(value: string | undefined, fallback: string) {
  const text = (value ?? "").trim();
  return text || fallback;
}

async function ensureFolder(path: string, parentPath: string, isSystem = false) {
  if (await fileExists(path)) return;
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

async function findAvailableRoundFolder(basePath: string) {
  let next = basePath;
  let index = 2;
  while (await fileExists(next)) {
    next = `${basePath}-${index}`;
    index += 1;
  }
  return next;
}

async function migrateLegacyRoundFolder(path: string) {
  const oldMeta = await readFile(`${path}/meta.json`);
  const parsedMeta = parseJson<InterviewMeta>(oldMeta?.content);

  const legacyName = path.split("/").filter(Boolean).at(-1) ?? "未知岗位-一面";
  const company = safeFolderName(parsedMeta?.company, legacyName.split("-").slice(0, -2).join("-") || "未知公司");
  const position = safeFolderName(parsedMeta?.position, legacyName.split("-").slice(-2, -1)[0] || "未知岗位");
  const round = normalizeRoundName(parsedMeta?.round ?? legacyName.split("-").at(-1));

  const jobFolderPath = getInterviewJobFolderPath(company, position);
  await ensureFolder(jobFolderPath, INTERVIEW_ROOT);

  const preferredRoundPath = `${jobFolderPath}/${round}`;
  const roundFolderPath = await findAvailableRoundFolder(preferredRoundPath);
  await ensureFolder(roundFolderPath, jobFolderPath);

  const children = await db.files.where("parentPath").equals(path).toArray();
  for (const child of children) {
    if (child.type === "folder") continue;
    const nextPath = `${roundFolderPath}/${child.name}`;
    await upsertFile({
      path: nextPath,
      name: child.name,
      parentPath: roundFolderPath,
      contentType: child.contentType,
      content: child.content,
      isGenerated: child.isGenerated,
      isSystem: child.isSystem,
      metadata: child.metadata,
    });
  }

  const migratedMeta: InterviewMeta = {
    jobId: parsedMeta?.jobId,
    jobFolderPath: parsedMeta?.jobFolderPath,
    company,
    position,
    round: roundFolderPath.split("/").filter(Boolean).at(-1),
    date: parsedMeta?.date ?? new Date().toISOString().slice(0, 10),
    createdAt: parsedMeta?.createdAt ?? new Date().toISOString(),
  };

  await upsertFile({
    path: `${roundFolderPath}/meta.json`,
    name: "meta.json",
    parentPath: roundFolderPath,
    contentType: "json",
    content: JSON.stringify(migratedMeta, null, 2),
    isGenerated: false,
    isSystem: false,
  });

  await deleteFile(path);
}

export async function migrateLegacyInterviewFoldersIfNeeded() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATION_DONE_KEY) === "true") return;

  try {
    const children = await db.files.where("parentPath").equals(INTERVIEW_ROOT).toArray();
    const legacyFolders = children.filter((item) => {
      if (item.type !== "folder") return false;
      if (item.name === ".system") return false;
      const parts = item.path.split("/").filter(Boolean);
      if (parts.length !== 2) return false;
      return true;
    });

    for (const folder of legacyFolders) {
      const transcript = await readFile(`${folder.path}/面试原文.md`);
      const report = await readFile(`${folder.path}/复盘报告.md`);
      const meta = await readFile(`${folder.path}/meta.json`);
      if (!transcript && !report && !meta) continue;
      await migrateLegacyRoundFolder(folder.path);
    }
  } catch {
    // migration failures should not block app usage
  } finally {
    window.localStorage.setItem(MIGRATION_DONE_KEY, "true");
  }
}
