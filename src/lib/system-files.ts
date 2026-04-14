export const SYSTEM_FILE_PATHS = {
  global: {
    folder: "/AI配置/.system",
    prompt: "/AI配置/.system/prompt.md",
    agent: "/AI配置/.system/agent.md",
    legacyPrompt: "/AI配置/_system.prompt.md",
  },
  resume: {
    folder: "/简历/.system",
    prompt: "/简历/.system/prompt.md",
    agent: "/简历/.system/agent.md",
    legacyPrompt: "/简历/_resume.prompt.md",
    legacyAgent: "/简历/_resume.skill.md",
  },
  job: {
    folder: "/岗位/.system",
    prompt: "/岗位/.system/prompt.md",
    agent: "/岗位/.system/agent.md",
    legacyPrompt: "/岗位/_job.prompt.md",
    legacyAgent: "/岗位/_job.skill.md",
  },
  prep: {
    folder: "/面试准备包/.system",
    prompt: "/面试准备包/.system/prompt.md",
    agent: "/面试准备包/.system/agent.md",
    legacyPrompt: "/面试准备包/_prep.prompt.md",
    legacyAgent: "/面试准备包/_prep.skill.md",
  },
  review: {
    folder: "/面试复盘/.system",
    prompt: "/面试复盘/.system/prompt.md",
    agent: "/面试复盘/.system/agent.md",
    legacyPrompt: "/面试复盘/_review.prompt.md",
    legacyAgent: "/面试复盘/_review.skill.md",
  },
} as const;

export function isHiddenSystemPath(path: string) {
  return path.includes("/.system/") || path.endsWith("/.system");
}
