export type FileKind = "folder" | "file";
export type ContentType = "md" | "json" | "pdf" | "none";

export interface VirtualFile {
  id: string;
  path: string;
  name: string;
  type: FileKind;
  contentType: ContentType;
  content: string;
  isSystem: boolean;
  isGenerated: boolean;
  parentPath: string;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreeNode {
  file: VirtualFile;
  children: TreeNode[];
}

export interface ResumeData {
  id: string;
  profile: { name: string; phone: string; email: string; wechat?: string; targetRole?: string };
  education: Array<{
    school: string;
    degree: string;
    major: string;
    startDate: string;
    endDate: string;
    gpa?: string;
  }>;
  internships: Array<{
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    descriptions: string[];
  }>;
  campusExperience: Array<{
    organization: string;
    role: string;
    startDate: string;
    endDate: string;
    descriptions: string[];
  }>;
  projects?: Array<{
    name: string;
    role: string;
    descriptions: string[];
    techStack?: string[];
  }>;
  skills: {
    professional: string[];
    languages?: string[];
    certificates?: string[];
    tools?: string[];
  };
}

export interface JobMeta {
  id: string;
  company: string;
  position: string;
  resumeId: string;
  status: "saved" | "preparing" | "applied" | "interviewing" | "offered" | "rejected";
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface LlmUsageRecord {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  context: string;
  label: string;
  messageCount: number;
  inputChars: number;
  outputChars: number;
  usageSource: "provider" | "unavailable";
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface LlmConfig {
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  storageMode: "session-only" | "localStorage";
}

export type ContextMode = "job-docs" | "prep-pack" | "interview-review" | "chat" | "resume-polish";

export interface BuiltContext {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}
