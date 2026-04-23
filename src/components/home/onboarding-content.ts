export type OnboardingScreenshot = {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
  eyebrow: string;
};

export const ONBOARDING_SCREENSHOTS: OnboardingScreenshot[] = [
  {
    id: "tailored-resume",
    title: "定制简历",
    description: "围绕岗位重排重点",
    imageSrc: "/onboarding/tailored-resume.png",
    eyebrow: "Resume",
  },
  {
    id: "prep-pack",
    title: "面试准备",
    description: "题单与行动清单",
    imageSrc: "/onboarding/prep-pack.png",
    eyebrow: "Prep",
  },
  {
    id: "review-report",
    title: "面试复盘",
    description: "沉淀问题与动作",
    imageSrc: "/onboarding/review-report.png",
    eyebrow: "Review",
  },
];

export const ONBOARDING_COPY = {
  step1Eyebrow: "PRODUCT WORKFLOW",
  step1Title: "一次求职，三件事 AI 帮你做完",
  step1Subtitle: "投递前定制，面试前准备，面后复盘。",
  step2Eyebrow: "STEP 2 OF 4",
  step2Title: "先把材料给我",
  step2Subtitle: "先导入简历，再补齐 JD。",
  step3Eyebrow: "STEP 3 OF 4",
  step3Title: "围绕岗位，把准备做全",
  step3Subtitle: "准备包、匹配分析、BOSS 文书一起生成。",
  step4Eyebrow: "STEP 4 OF 4",
  step4Title: "面后继续变强",
  step4Subtitle: "复盘会留下问题、动作和下一轮方向。",
};
