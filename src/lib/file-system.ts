import { db } from "@/lib/db";
import { TreeNode, VirtualFile } from "@/types";

const now = () => new Date().toISOString();

function compareFiles(a: VirtualFile, b: VirtualFile) {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
  return a.name.localeCompare(b.name, "zh-Hans-CN");
}

export async function createFile(
  file: Omit<VirtualFile, "id" | "createdAt" | "updatedAt">,
): Promise<VirtualFile> {
  const exists = await readFile(file.path);
  if (exists) throw new Error(`Path already exists: ${file.path}`);
  const item: VirtualFile = {
    ...file,
    id: crypto.randomUUID(),
    createdAt: now(),
    updatedAt: now(),
  };
  await db.files.add(item);
  return item;
}

export async function readFile(path: string): Promise<VirtualFile | undefined> {
  return db.files.where("path").equals(path).first();
}

export async function updateFile(
  path: string,
  updates: Partial<Pick<VirtualFile, "content" | "name" | "metadata">>,
): Promise<void> {
  const file = await readFile(path);
  if (!file) throw new Error(`File not found: ${path}`);
  await db.files.update(file.id, { ...updates, updatedAt: now() });
}

export async function listChildren(parentPath: string): Promise<VirtualFile[]> {
  const children = await db.files.where("parentPath").equals(parentPath).toArray();
  return children.sort(compareFiles);
}

export async function listAllDescendants(parentPath: string): Promise<VirtualFile[]> {
  const all = await db.files.toArray();
  const prefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
  return all
    .filter((f) => f.path.startsWith(prefix) && f.path !== parentPath)
    .sort(compareFiles);
}

export async function deleteFile(path: string): Promise<void> {
  const target = await readFile(path);
  if (!target) return;
  if (target.type === "folder") {
    const descendants = await listAllDescendants(path);
    await db.files.bulkDelete(descendants.map((d) => d.id));
  }
  await db.files.delete(target.id);
}

async function buildTree(parentPath: string): Promise<TreeNode[]> {
  const children = await listChildren(parentPath);
  const tree = await Promise.all(
    children.map(async (file) => ({
      file,
      children: file.type === "folder" ? await buildTree(file.path) : [],
    })),
  );
  return tree;
}

export async function getFileTree(): Promise<TreeNode[]> {
  return buildTree("/");
}

export async function fileExists(path: string): Promise<boolean> {
  return Boolean(await readFile(path));
}

export async function upsertFile(args: {
  path: string;
  name: string;
  parentPath: string;
  contentType: VirtualFile["contentType"];
  content: string;
  isSystem?: boolean;
  isGenerated?: boolean;
  metadata?: string;
}): Promise<void> {
  const existing = await readFile(args.path);
  if (!existing) {
    await createFile({
      path: args.path,
      name: args.name,
      type: "file",
      contentType: args.contentType,
      content: args.content,
      isSystem: Boolean(args.isSystem),
      isGenerated: Boolean(args.isGenerated),
      parentPath: args.parentPath,
      metadata: args.metadata ?? "{}",
    });
    return;
  }
  await db.files.update(existing.id, {
    name: args.name,
    content: args.content,
    metadata: args.metadata ?? existing.metadata,
    updatedAt: now(),
    isGenerated: args.isGenerated ?? existing.isGenerated,
  });
}
