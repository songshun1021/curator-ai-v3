import { isHiddenSystemPath } from "@/lib/system-files";

const PROTECTED_FILE_PATHS = new Set<string>(["/简历/主简历.json", "/AI配置/模型配置.json", "/AI配置/记忆摘要.md"]);

export function getProtectedDeleteReason(path: string, isSystem: boolean) {
  if (isSystem) return "这是系统内部文件，不能删除。";
  if (PROTECTED_FILE_PATHS.has(path)) return "这是系统内部文件，不能删除。";
  if (path.endsWith("/meta.json")) return "这是系统内部文件，不能删除。";
  if (isHiddenSystemPath(path)) return "这是系统内部文件，不能删除。";
  return null;
}

