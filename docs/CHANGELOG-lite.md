# CHANGELOG (Lite)

> Status: Active
> Audience: GitHub visitor / contributor / maintainer
> Last updated: 2026-04-14
> Related docs: `README.md`, `docs/README.md`

## 2026-04-14

- 修复 PDF 导入主链路，当前稳定路径为：`个人简历.pdf -> 个人简历.md -> 主简历.json`
- 修复 `pdfjs` worker 问题，服务端提取失败不再误报成“扫描件/无文本层”
- 新建岗位两套入口均支持“导入简历”快捷跳转
- AI 配置页新增真实 token 使用概览；上游未返回 usage 时明确标记为“暂不可得”
- 各模块首页补齐真动作直达，不再只是说明卡片
- 匹配分析、准备包、复盘报告改为“核心章节强校验 + 细节柔性提示”，减少主链路误伤
- 定制简历生成补强：优先注入结构化主简历 JSON，内容稀疏时保存并提示
- 统一按钮体系、玻璃化 UI 与危险态按钮，继续优化 Workspace、工具栏和 AI 助手区
- 补充“用户自填 API”的线上化说明，新增 Vercel 部署指南
- 公开发布脚本升级：允许公开 `docs/README.md` 与 `docs/CHANGELOG-lite.md`，继续排除内部会话文档和敏感文件

## 2026-04-13

- 文档主轴收口为两份唯一基线：
  - `Curator-AI-v3-产品规划.md`
  - `Curator-AI-v3-开发执行手册.md`
- 重写根 README、docs 索引、贡献说明与发布脚本说明，统一 GitHub 发布口径
- 明确 `SESSION_COMPACT.md` 为内部连续性档案，不作为 GitHub 首页主说明
- 版本口径统一为 `3.1.0`
- 新增 `public` 分支公开发布脚本与仓库敏感信息扫描门禁

## 2026-04-12

- PDF 导入链路稳定为：`PDF -> 个人简历.md -> 主简历 JSON / 岗位生成 / 准备包 / 复盘`
- `/api/chat` 与 `ai-engine` 统一为纯文本流式协议
- 修复 Windows 环境下的 PDF 文本提取编码问题

## 2026-04-10

- 启动与发布脚本结构收口为“根目录入口 + scripts 逻辑实现”
- 发布 / 打包口径固定，微信分享包与公开发布分离
- 文档统一归档到 `docs/`
