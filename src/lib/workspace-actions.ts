import { dispatchJobCreated } from "@/lib/action-events";
import { createFile, fileExists, readFile, upsertFile } from "@/lib/file-system";
import { createId } from "@/lib/id";
import { getInterviewJobFolderPath, getInterviewRoundFolderPath, normalizeRoundName } from "@/lib/interview-paths";
import { useAppStore } from "@/store/app-store";

function formatMMDD(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}${dd}`;
}

async function findAvailableJobFolderName(baseName: string) {
  let name = baseName;
  let index = 2;
  while (await fileExists(`/岗位/${name}`)) {
    name = `${baseName}-${index}`;
    index += 1;
  }
  return name;
}

async function ensureInterviewFolder(path: string, parentPath: string) {
  if (await fileExists(path)) return;
  const name = path.split("/").filter(Boolean).at(-1) ?? "";
  await createFile({
    path,
    name,
    type: "folder",
    contentType: "none",
    content: "",
    isSystem: false,
    isGenerated: false,
    parentPath,
    metadata: "{}",
  });
}

export async function createJobFolderWithJD(args: {
  company: string;
  position: string;
  jdText: string;
  resumePath?: string;
}) {
  const company = args.company.trim();
  const position = args.position.trim();
  const jdText = args.jdText.trim();
  const resumePath = args.resumePath ?? "/简历/主简历.json";

  if (!company) throw new Error("公司不能为空");
  if (!position) throw new Error("职位不能为空");
  if (!jdText) throw new Error("JD 内容不能为空");

  const folderBaseName = `${company}-${position}-${formatMMDD()}`;
  const folderName = await findAvailableJobFolderName(folderBaseName);
  const folderPath = `/岗位/${folderName}`;

  const now = new Date().toISOString();
  const jobId = createId();

  await createFile({
    path: folderPath,
    name: folderName,
    type: "folder",
    contentType: "none",
    content: "",
    isSystem: false,
    isGenerated: false,
    parentPath: "/岗位",
    metadata: JSON.stringify({ jobId }),
  });

  await createFile({
    path: `${folderPath}/jd.md`,
    name: "jd.md",
    type: "file",
    contentType: "md",
    content: `# JD\n\n${jdText}`,
    isSystem: false,
    isGenerated: false,
    parentPath: folderPath,
    metadata: "{}",
  });

  await createFile({
    path: `${folderPath}/meta.json`,
    name: "meta.json",
    type: "file",
    contentType: "json",
    content: JSON.stringify(
      {
        id: jobId,
        company,
        position,
        resumeId: resumePath,
        status: "saved",
        createdAt: now,
      },
      null,
      2,
    ),
    isSystem: false,
    isGenerated: false,
    parentPath: folderPath,
    metadata: "{}",
  });

  const store = useAppStore.getState();
  await store.reloadTree();
  store.markMarkdownEditOnce(`${folderPath}/jd.md`);
  await store.openFilePath(`${folderPath}/jd.md`);
  dispatchJobCreated({ jobFolderPath: folderPath });
  return { folderPath, folderName };
}

export async function createJobFolder(company: string, position: string, resumePath = "/简历/主简历.json") {
  const folderName = `${company}-${position}`;
  const folderPath = `/岗位/${folderName}`;

  if (await fileExists(folderPath)) throw new Error("岗位已存在");

  const now = new Date().toISOString();
  const jobId = createId();

  await createFile({
    path: folderPath,
    name: folderName,
    type: "folder",
    contentType: "none",
    content: "",
    isSystem: false,
    isGenerated: false,
    parentPath: "/岗位",
    metadata: JSON.stringify({ jobId }),
  });

  await createFile({
    path: `${folderPath}/jd.md`,
    name: "jd.md",
    type: "file",
    contentType: "md",
    content: "# JD\n\n请粘贴岗位描述。",
    isSystem: false,
    isGenerated: false,
    parentPath: folderPath,
    metadata: "{}",
  });

  await createFile({
    path: `${folderPath}/meta.json`,
    name: "meta.json",
    type: "file",
    contentType: "json",
    content: JSON.stringify(
      {
        id: jobId,
        company,
        position,
        resumeId: resumePath,
        status: "saved",
        createdAt: now,
      },
      null,
      2,
    ),
    isSystem: false,
    isGenerated: false,
    parentPath: folderPath,
    metadata: "{}",
  });

  const store = useAppStore.getState();
  await store.reloadTree();
  store.markMarkdownEditOnce(`${folderPath}/jd.md`);
  store.setCurrentFilePath(`${folderPath}/jd.md`);
  dispatchJobCreated({ jobFolderPath: folderPath });
}

export async function createInterviewRecord(jobFolderPath: string, round: string) {
  const metaRaw = await readFile(`${jobFolderPath}/meta.json`);
  if (!metaRaw) throw new Error("岗位 meta.json 不存在");
  const meta = JSON.parse(metaRaw.content) as { id: string; company: string; position: string };

  const safeRound = normalizeRoundName(round);
  const interviewJobPath = getInterviewJobFolderPath(meta.company, meta.position);
  const roundFolderPath = getInterviewRoundFolderPath(meta.company, meta.position, safeRound);
  const transcriptPath = `${roundFolderPath}/面试原文.md`;

  await ensureInterviewFolder(interviewJobPath, "/面试复盘");
  await ensureInterviewFolder(roundFolderPath, interviewJobPath);

  await upsertFile({
    path: `${roundFolderPath}/meta.json`,
    name: "meta.json",
    parentPath: roundFolderPath,
    contentType: "json",
    content: JSON.stringify(
      {
        jobId: meta.id,
        jobFolderPath,
        company: meta.company,
        position: meta.position,
        round: safeRound,
        date: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  });

  const transcriptFile = await readFile(transcriptPath);
  if (!transcriptFile) {
    await upsertFile({
      path: transcriptPath,
      name: "面试原文.md",
      parentPath: roundFolderPath,
      contentType: "md",
      content: "# 面试原文\n\n> 请将面试听写文本粘贴到下方（尽量按问答格式整理）\n\n",
    });
  }

  const store = useAppStore.getState();
  await store.reloadTree();
  const opened = await store.openFilePath(transcriptPath);
  if (!opened) {
    store.setCurrentFilePath(transcriptPath);
  }
}

export async function updateJobStatus(jobFolderPath: string, status: string) {
  const metaFile = await readFile(`${jobFolderPath}/meta.json`);
  if (!metaFile) return;
  const meta = JSON.parse(metaFile.content);
  meta.status = status;
  await upsertFile({
    path: `${jobFolderPath}/meta.json`,
    name: "meta.json",
    parentPath: jobFolderPath,
    contentType: "json",
    content: JSON.stringify(meta, null, 2),
  });
  await useAppStore.getState().reloadTree();
}
