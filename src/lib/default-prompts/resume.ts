export const DEFAULT_RESUME_PROMPT = `任务：让简历更容易拿到面试机会。
输入：主简历 JSON、目标 JD。
输出：更贴合 JD 的简历内容与定制简历。
约束：使用 STAR 思路、突出量化结果、避免空泛描述。`;

export const DEFAULT_RESUME_SKILL = `定制简历要求：
1. 严格复用主简历结构与真实经历。
2. 优先保留与 JD 直接相关的经历证据。
3. 定制简历必须输出合法 JSON（仅 JSON）。`;
