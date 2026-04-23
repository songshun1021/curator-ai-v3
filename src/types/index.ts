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

export interface TrialStatus {
  mode: "platform" | "disabled";
  trialEnabled: boolean;
  remainingInputTokens: number | null;
  remainingOutputTokens: number | null;
  remainingRequestsToday: number | null;
  blockedReason: string | null;
  provider: string | null;
  model: string | null;
}

export type ContextMode = "job-docs" | "prep-pack" | "interview-review" | "chat" | "resume-polish";

export interface BuiltContext {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

export type OpsDashboardRange = "today" | "7d" | "30d";
export type OpsLogType = "pm2-error" | "nginx-error" | "nginx-access";

export interface OpsMetricPoint {
  date: string;
  label: string;
  value: number;
}

export interface OpsCountBucket {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface OpsFeedbackItem {
  id: string;
  createdAt: string;
  type: string;
  title: string;
  content: string;
  contact: string;
  sourcePath: string;
}

export interface OpsHealthCheck {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  checkedAt: string;
}

export interface OpsProcessStatus {
  name: string;
  status: string;
  uptimeSeconds: number | null;
  restarts: number | null;
  cpu: number | null;
  memoryBytes: number | null;
  pmId: number | null;
  execCwd: string;
}

export interface OpsBudgetStatus {
  todayCostCny: number;
  monthCostCny: number;
  dailyBudgetCny: number;
  monthlyBudgetCny: number;
  dailyUsageRatio: number | null;
  monthlyUsageRatio: number | null;
}

export interface OpsLogSummary {
  type: OpsLogType;
  label: string;
  status: "ok" | "unavailable" | "error";
  summary: string;
  updatedAt: string;
  lineCount: number;
  errorCount: number;
  warnCount: number;
  preview: string;
}

export interface OpsLogPayload {
  type: OpsLogType;
  label: string;
  status: "ok" | "unavailable" | "error";
  updatedAt: string;
  content: string;
  lineCount: number;
}

export interface OpsDashboardData {
  timezone: string;
  generatedAt: string;
  range: OpsDashboardRange;
  overview: {
    todayUsers: number;
    todayRequests: number;
    todayFeedbackCount: number;
    todayCostCny: number;
  };
  usage: {
    dailyUsers: OpsMetricPoint[];
    dailyRequests: OpsMetricPoint[];
    dailyCostCny: OpsMetricPoint[];
    byContext: OpsCountBucket[];
    byModel: OpsCountBucket[];
  };
  feedback: {
    todayCount: number;
    rangeCount: number;
    byType: OpsCountBucket[];
    recent: OpsFeedbackItem[];
  };
  health: {
    process: OpsProcessStatus | null;
    platform: {
      provider: string;
      model: string;
      enabled: boolean;
      remainingInputTokens: number | null;
      remainingOutputTokens: number | null;
      blockedReason: string | null;
      thinkingEnabled: boolean | null;
      budget: OpsBudgetStatus;
    };
    checks: OpsHealthCheck[];
    access: {
      status: "ok" | "unavailable" | "error";
      recent4xx: number;
      recent5xx: number;
      sampledLines: number;
    };
  };
  errors: {
    pm2Error: OpsLogSummary;
    nginxError: OpsLogSummary;
    nginxAccess: OpsLogSummary;
    feedbackIssues: OpsFeedbackItem[];
  };
}
