export const FEEDBACK_SUPPORT_PATH = "/AI配置/反馈与支持.json";
export const FEEDBACK_QQ_GROUP_ID = "1101991220";
export const FEEDBACK_EMAIL = "2661843432@qq.com";
export const FEEDBACK_QR_CODE_PATH = "/feedback/qq-group.jpg";

export type FeedbackSupportConfig = {
  title: string;
  description: string;
  email: string;
  qqGroupId: string;
  qrCodePath: string;
};

export function getDefaultFeedbackSupportConfig(): FeedbackSupportConfig {
  return {
    title: "反馈与支持",
    description:
      "欢迎把产品体验、功能建议和使用问题发给我。我会优先查看真实反馈，用它继续收口体验。",
    email: FEEDBACK_EMAIL,
    qqGroupId: FEEDBACK_QQ_GROUP_ID,
    qrCodePath: FEEDBACK_QR_CODE_PATH,
  };
}

export function serializeFeedbackSupportConfig(config: FeedbackSupportConfig) {
  return JSON.stringify(config, null, 2);
}
