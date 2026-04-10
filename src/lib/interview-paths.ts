import { VirtualFile } from "@/types";

export const INTERVIEW_ROOT = "/面试复盘";
export const INTERVIEW_TRANSCRIPT_NAME = "面试原文.md";
export const INTERVIEW_REPORT_NAME = "复盘报告.md";

export function normalizeRoundName(round: string | undefined) {
  const value = (round ?? "").trim();
  return value || "一面";
}

export function getInterviewJobFolderName(company: string, position: string) {
  return `${company.trim()}-${position.trim()}`;
}

export function getInterviewJobFolderPath(company: string, position: string) {
  return `${INTERVIEW_ROOT}/${getInterviewJobFolderName(company, position)}`;
}

export function getInterviewRoundFolderPath(company: string, position: string, round: string) {
  return `${getInterviewJobFolderPath(company, position)}/${normalizeRoundName(round)}`;
}

export function getInterviewFolderPathFromAnyPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "面试复盘") return null;

  // 新结构目录：/面试复盘/{公司-岗位}/{轮次}
  if (parts.length === 3 && !parts[2].includes(".")) {
    return `/${parts.slice(0, 3).join("/")}`;
  }

  // 新结构文件：/面试复盘/{公司-岗位}/{轮次}/{file}
  if (parts.length >= 4) {
    return `/${parts.slice(0, 3).join("/")}`;
  }

  // 旧结构文件：/面试复盘/{公司-岗位-轮次}/{file}
  if (parts.length === 3 && parts[2].includes(".")) {
    return `/${parts.slice(0, 2).join("/")}`;
  }

  return null;
}

export function isInterviewRoundFolderPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "面试复盘") return false;
  return parts.length === 2 || parts.length === 3;
}

export function getInterviewRoundFolders(files: VirtualFile[]) {
  return files.filter((file) => {
    if (file.type !== "folder") return false;
    if (!isInterviewRoundFolderPath(file.path)) return false;

    const transcriptPath = `${file.path}/${INTERVIEW_TRANSCRIPT_NAME}`;
    const reportPath = `${file.path}/${INTERVIEW_REPORT_NAME}`;
    const hasTranscript = files.some((candidate) => candidate.path === transcriptPath);
    const hasReport = files.some((candidate) => candidate.path === reportPath);
    return hasTranscript || hasReport;
  });
}

export function pickLatestInterviewRound(files: VirtualFile[]) {
  const rounds = getInterviewRoundFolders(files);
  return rounds.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}
