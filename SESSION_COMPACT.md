# SESSION_COMPACT

## 当前实现状态
- 已初始化 Next.js 14 + TypeScript + Tailwind + shadcn/ui + Zustand + Dexie。
- 已实现三栏 IDE 布局（文件树 / 编辑区 / AI 对话区）。
- 已实现 IndexedDB 虚拟文件系统与首次工作区初始化（5 个根目录 + 系统 prompt/skill/配置文件）。
- 已实现 Markdown/JSON 编辑、岗位创建、面试记录创建、岗位文书生成、准备包生成、复盘生成与记忆沉淀。
- 已实现右栏对话、多线程、@ 文件引用注入、上下文标签展示。
- 已实现 `/api/chat` OpenAI 兼容流式代理。
- 已完成渲染死循环热修：`ChatPanel`、`EditorArea`、`GeneratingView`、`FileTreeNode` 均改为逐字段 Zustand selector，`Maximum update depth exceeded` 问题已消除。
- 已完成 Phase 3 简历表单增强：支持完整字段、多条目新增/删除、数组化编辑与手动保存。
- 已完成中文 PDF 渲染保障：内置 `NotoSansCJKsc-Regular.otf`，`@react-pdf/renderer` 已注册字体并用于导出。
- 已完成简历持久化增强：主简历支持防抖自动保存（800ms）+ 顶部显式保存条（双保险），导出前可强制 flush 草稿。
- 已完成 PDF 视觉重构：采用“猫步简历”风格参考并基于 React-PDF 自研实现（未直接移植代码）。
- 已完成 LLM 配置体验升级：供应商联动推荐模型、模型下拉+可手输、验证连接、存储模式显式配置。
- 已完成模型下拉反向联动：选择推荐模型时自动匹配并填充对应 provider 与 API Base URL（手动输入模型不触发覆盖）。
- 已完成 Phase 8.5 流式体验增强：生成中支持取消、自动滚动、取消后固定命名草稿落盘（不覆盖正式产物）。
- 已完成聊天链路体验修复：发送后输入框立即清空、助手回复流式显示、消息列表自动滚动到最新。
- 已完成岗位 JD 录入稳定性修复：Markdown 编辑改为防抖自动保存并显示保存状态。
- 已完成生成可见性修复：工具栏常驻“取消生成”入口 + 生成结果路径提示（支持一键打开）。
- 已修复 `generation-actions.ts` 编码损坏导致的中文路径/文案异常，恢复岗位文书与草稿写入路径一致性。
- 已完成岗位 JD 可见入口：左栏文件树新增“新建岗位”按钮，岗位上下文工具栏新增“录入JD”按钮。
- 已完成路径可达性增强：新增 `openFilePath`（自动展开父目录链并打开文件），用于生成结果“打开”操作。
- 已完成文件树强制定位：`openFilePath` 写入 `pendingRevealPath`，文件树自动滚动到目标节点并短时高亮。
- 已完成“一条龙新建岗位”入口重构：`+新建岗位` 打开 `/岗位/_新建岗位.json` 表单，支持公司/职位/JD 一次填写并保存建档。
- 已完成岗位-简历上下文打通：岗位生成链路新增“绑定简历优先、主简历回退”注入，定制简历/匹配分析可读取简历基准。
- 已完成文件删除双入口：文件树右键 + 工具栏删除按钮，支持文件/文件夹删除并限制系统文件不可删。
- 已完成 `generation-actions.ts` 文案与路径异常修复：恢复中文提示、文件名与保存路径稳定性。
- 已完成系统文件隐藏化：各模块 prompt/agent 迁移到 `/.system/`，文件树默认隐藏系统文件。
- 已完成 AI 配置高级入口：可直接打开全局/岗位/简历/准备包/复盘的 prompt 与 agent 文件进行优化。
- 已完成渲染优先体验：Markdown 默认预览模式，JSON 默认渲染视图，均支持一键切换原始编辑并记忆用户模式。
- 已完成定制简历可视化：`/简历/定制简历/*.json` 默认结构化阅读视图，可切换原始 JSON 编辑。
- 已完成默认 prompt/agent 短指令化：聚焦“提高面试机会与通过率”，减少 token 消耗。
- 已完成定制简历 JSON 稳定化：生成后严格校验 JSON 与结构，非法输出不再落正式文件。
- 已完成全链条面试目标对齐：系统/岗位/简历/准备包/复盘 prompt 与 agent 文案统一聚焦“拿面试+过面试”。
- 已完成面试复盘录入优化：岗位工具栏新增“新建复盘”一键入口，减少右键与多次 prompt 操作成本。
- 已修复“已输入面试原文仍提示先填写”误判：改为先剥离模板提示文本再判空。
- 已完成 Markdown 阅读体验优化：默认只读渲染展示，源码编辑入口后置为手动切换。
- 已完成顶部工具条两行分组：核心动作与状态信息分层展示，避免按钮与文字被遮挡。
- 已完成新手引导弹窗：首次进入自动弹出 3 步引导，并支持在 AI 配置页手动重开。
- 已完成开源基础配套：新增 MIT LICENSE、贡献指南与中文 README。
- 已完成本地一键启动包：新增 `start-curator.bat` 与 `start-curator.ps1`，降低新手启动门槛。

## 本轮已完成事项
1. 完成 `JsonFormView` 中模型配置分支重构：引入 `providerCatalog`（DeepSeek/火山引擎/通义千问(阿里云)/智谱/OpenAI/自定义）。
2. 供应商联动逻辑生效：选择供应商自动填充 baseURL 与默认模型，模型支持“推荐下拉 + 手动输入覆盖”。
3. 新增配置交互：API Key 显示/隐藏、存储模式单选（session-only/localStorage）、新手提示文案。
4. 新增验证连接功能：调用现有 `/api/chat` 进行最小测试消息验证，并显示成功/失败状态。
5. 完成保存联动：保存时写回 `/AI配置/模型配置.json`、按 storageMode 写入 session/localStorage，并同步 Zustand `llmConfig`。
6. 聊天链路前置校验：`ChatPanel` 发送前检查 model/baseURL/apiKey，缺失时给出系统提示并阻断请求。
7. 修复模型配置页“持续跳动”问题：移除 `useEffect` 对动态 `storageKey` 的循环依赖，改为按 provider 即时计算存储 key，避免初始化重置引发反复重渲染。
8. 完成“模型选择联动 API Base URL”优化：`JsonFormView` 增加 `modelLookup` 反查索引，推荐模型下拉选择时同步更新 `model/provider/baseURL`，并新增“已自动匹配服务商与 API Base URL，可手动修改。”提示文案。
9. 完成生成任务统一控制：在 `app-store` 增加生成状态机（running/canceling/error）与 `AbortController` 管理，所有生成入口统一接入 `signal`。
10. 完成取消语义落地：`GeneratingView` 新增取消按钮与防连点；取消后按类型写入固定 `.draft` 文件并自动打开，不触发后置派生步骤。
11. 完成生成体验优化：`GeneratingView` 内容区自动滚动到最新文本，顶部状态文案区分“生成中/取消保存中/失败”。
12. 完成 ChatPanel 流式渲染修复：`onChunk` 实时更新助手消息，结束后再落库为正式消息。
13. 修复首条消息线程边界：首次发送时使用 `createThread()` 返回的 `threadId` 持久化，避免首条消息丢失。
14. 增加工具栏入口提示：主简历页新增文案，提示岗位文书生成需在 `/岗位/公司-岗位` 目录下操作。
15. 完成 `MarkdownView` 自动保存增强：`onBlur` 改为 800ms 防抖自动保存，新增“保存中/已保存/保存失败”提示，并在页面卸载前 flush。
16. 完成工具栏生成控制增强：`isGenerating` 时显示常驻“取消生成”按钮，调用统一 `cancelGeneration`。
17. 完成输出定位增强：生成完成/取消后写入 `generationNotice`，展示“已保存到/已取消并保存草稿”并可一键打开路径。
18. 完成 JD 可达入口增强：`FileTree` 顶部新增显式创建岗位入口，`Toolbar` 在岗位目录提供“录入JD”（无 `jd.md` 时自动创建并打开）。
19. 完成可见性回执增强：生成完成/取消后除工具栏提示外，同时写入聊天系统消息“已保存到/已取消并保存草稿”。
20. 完成可视定位闭环：`FileTreeNode` 增加 `data-path`，`FileTree` 监听待定位路径并执行 `scrollIntoView` + 2 秒高亮反馈。
21. 完成岗位创建动作增强：新增 `createJobFolderWithJD`，目录命名为 `公司-职位-MMDD`，同名自动追加 `-2/-3`，创建后自动打开 `jd.md`。
22. 完成岗位创建表单分支：`JsonFormView` 新增 `/岗位/_新建岗位.json` 专用表单，支持“仅保存表单”与“保存并创建岗位”。
23. 完成 `buildContext(job-docs)` 简历注入增强：读取 `meta.resumeId` 绑定简历，缺失时回退 `/简历/主简历.json`。
24. 完成删除后状态收敛：删除当前目标后自动回到空状态，并清理失效的生成路径提示。
25. 新增 `src/lib/system-files.ts`，统一系统文件新路径（`/.system/prompt.md`、`/.system/agent.md`）与旧路径映射。
26. 重构 `initWorkspace`：新增旧工作区系统文件迁移逻辑（旧路径内容复制到新路径并清理旧文件），并确保 `/AI配置/模型配置.json` 保持可见。
27. 重构 `buildContext`：系统/模块指令读取改为“新路径优先 + 旧路径兜底”，并支持全局 agent 注入。
28. 完成文件树默认隐藏系统文件：`isSystem=true` 与 `/.system/` 路径节点不展示。
29. 完成 AI 配置页“高级：编辑系统提示词”入口，支持一键打开各模块 prompt/agent。
30. 完成 Markdown 渲染优先改造：默认预览，支持预览/编辑/分屏切换并本地记忆模式。
31. 完成 JSON 渲染优先改造：通用 JSON 默认渲染卡片视图，支持切换原始 JSON 编辑。
32. 完成定制简历 JSON 可视化改造：新增结构化阅读视图（基础信息、经历、技能），支持原始模式切换。
33. 重写默认 prompt/agent 文案为短指令模板，聚焦校招用户“拿面试+过面试”目标。
34. 重写 `generation-actions.ts`（UTF-8 清理）：修复异常编码文案与路径污染风险。
35. 为 `custom-resume` 增加严格 JSON 指令：仅输出 JSON 对象，禁止解释文本与代码块。
36. 为 `custom-resume` 增加保存前严格校验：`JSON.parse` + `ResumeData` 结构归一化后再落盘。
37. 非法 JSON 输出处理改为严格失败：不写正式文件，仅提示“重新生成定制简历”。
38. 全量重写默认 Prompt/Agent 文案（system/job/resume/prep/review），围绕核心用户需求链路：简历、招呼语、准备包。
39. `Toolbar` 新增岗位上下文一键“新建复盘”，仅需输入轮次即创建复盘目录并打开 `面试原文.md`。
40. 新增 `isInterviewTranscriptEmpty` 判定逻辑：过滤模板标题与引导语后再判断内容是否为空。
41. 调整 `createInterviewRecord`：已有 `面试原文.md` 时不再覆盖，避免重复创建时丢失已录入内容。
42. `createInterviewRecord` 创建后改为 `openFilePath` 打开文件，保证文件树定位与高亮反馈一致。
43. 重构 `MarkdownView`：默认只读渲染，新增“编辑源码/返回预览”切换，自动保存仅在编辑态生效。
44. 重构 `Toolbar` 为两行布局：第一行核心动作按钮，第二行路径/提示/通知/删除操作。
45. 重构 `FileTree` 与 `FileTreeNode`：清理中文乱码文案，恢复目录统计与交互提示可读性。
46. 重构 `generation-actions.ts` 文案：统一中文 UTF-8，保持定制简历 JSON 严格校验与生成链路稳定。
47. 清洗 `default-prompts/*` 文案编码，统一短指令目标表达（机会获取 + 面试通过）。
48. `JsonFormView`（模型配置页）新增“重新打开新手引导”按钮，触发首页引导弹窗事件。
49. `app/page.tsx` 新增首次使用引导弹窗（localStorage 标记）与手动重开监听。
50. 新增 `README.md` 中文新手版、`LICENSE`（MIT）、`CONTRIBUTING.md`。
51. 新增 `start-curator.bat` 与 `start-curator.ps1` 一键启动脚本（检测 Node/pnpm、安装依赖、启动并打开页面）。

## 已验证结果
- 用户已验证：聊天链路与文件树相关操作可正常使用，未再出现 `Maximum update depth exceeded`。
- `pnpm build` 成功，无 TS 阻断错误（表单与 PDF 改造后再次验证通过）。
- `/api/chat` 路由成功参与构建。
- 表单与导出改造后构建无回归，前端可正常打包。
- 已记录设计参考来源：GitHub `Hacker233/resume-design`（MIT），当前实现为风格参考后的自研 React-PDF 版本。
- `pnpm build` 在本轮换行与头部修复后再次通过，无新增 lint/type 阻断。
- `pnpm build` 在本轮长描述换行与分页修复后再次通过，无新增 lint/type 阻断。
- `pnpm build` 在本轮 LLM 配置升级后再次通过，无新增 lint/type 阻断。
- `pnpm build` 在模型配置页跳动问题修复后再次通过。
- `pnpm build` 在本轮模型反向联动优化后再次通过。
- `pnpm build` 在本轮 Phase 8.5（取消生成 + 草稿落盘 + 自动滚动）后再次通过。
- `pnpm build` 在本轮聊天输入与流式渲染修复后再次通过。
- `pnpm build` 在本轮 JD 自动保存与生成路径提示修复后再次通过。
- `pnpm build` 在本轮 JD 入口与路径展开打开修复后再次通过。
- `pnpm build` 在本轮文件树强制定位修复后再次通过。
- `pnpm build` 在本轮一条龙新建岗位改造后再次通过。
- `pnpm build` 在本轮“岗位-简历打通 + 删除双入口”修复后再次通过。
- `pnpm build` 在本轮“系统文件隐藏化 + 渲染优先 + 定制简历可视化 + 短 prompt”后再次通过。
- `pnpm build` 在本轮“定制简历 JSON 严格校验 + 全链路 Prompt/Agent 聚焦改写”后再次通过。
- `pnpm build` 在本轮“复盘一键录入 + 判空误报修复”后再次通过。
- `pnpm build` 在本轮“MD只读渲染 + 工具条两行化 + 一键启动 + 新手引导 + 乱码清理”后再次通过。

## 待处理/待验证项
- 需在 `pnpm dev` 下手动复测简历编辑全链路：多条目增删、刷新回显、保存后 JSON 结构正确。
- 需验证中文 PDF 导出视觉效果：中文姓名/公司/项目描述及中英混排无乱码。
- 需在 `pnpm dev` 下验证模型下拉反向联动：选择 `qwen-plus` / `doubao-1.5-pro-32k` / `deepseek-chat` 时，`provider + baseURL` 是否自动匹配到对应服务商。
- 需验证“手动输入模型名”回归：仅更新 model，不强制覆盖用户手改后的 `baseURL`。
- 需在 `pnpm dev` 下验证流式取消主链路：生成中点击取消后 300ms 内退出生成态，并自动打开对应 `.draft` 文件。
- 需验证草稿隔离：取消后不覆盖正式文件；多次取消同类型仅保留 1 份最新草稿（覆盖更新）。
- 需验证派生流程隔离：取消“面试准备包/复盘报告”后，不应产生“知识清单/记忆摘要”更新。
- 需在 `pnpm dev` 下验证聊天主链路：发送后输入框立即清空、助手内容流式显示、首次发送不丢消息。
- 需在 `pnpm dev` 下验证岗位 JD 录入：在 `岗位/*/jd.md` 连续输入无需失焦即可自动保存，刷新不丢内容。
- 需在 `pnpm dev` 下验证生成结果定位：完成/取消后工具栏显示路径提示，点击“打开”可跳转目标文件。
- 需在 `pnpm dev` 下验证文件树可达性：通过左栏“新建岗位”创建后，能直接在岗位工具栏使用“录入JD”进入编辑。
- 需在 `pnpm dev` 下验证强制定位：点击路径“打开”后，目标节点滚动到可视区中心并出现短时高亮。
- 需在 `pnpm dev` 下验证一条龙岗位创建：点击 `+新建岗位` 后进入表单，保存后创建 `公司-职位-MMDD` 目录并自动打开 `jd.md`。
- 需在 `pnpm dev` 下验证重名策略：同日同公司同职位连续创建，第二个目录应自动追加 `-2`。
- 需在 `pnpm dev` 下验证岗位定制简历读取主简历：修改主简历后再生成，结果应随简历内容变化。
- 需在 `pnpm dev` 下验证删除双入口：右键/工具栏都可删用户文件；系统文件删除被拒绝并提示。
- 需在 `pnpm dev` 下验证系统文件可见性：文件树默认不显示 `/.system/*`，且 AI 配置高级入口可正常打开对应文件。
- 需在 `pnpm dev` 下验证老数据迁移：已有旧版 `_*.prompt/_*.skill` 内容在升级后可正确迁移到 `/.system/`。
- 需在 `pnpm dev` 下验证渲染优先体验：Markdown 默认预览、JSON 默认渲染，并记忆用户切换模式。
- 需在 `pnpm dev` 下验证定制简历可视化：打开 `/简历/定制简历/*.json` 默认进入可视化，切换原始 JSON 后可正常保存回显。
- 需在 `pnpm dev` 下验证定制简历严格失败链路：当模型返回非 JSON 时，不生成正式 `.json` 且弹出清晰错误提示。
- 需在 `pnpm dev` 下抽样验证三条核心链路输出质量：简历优化、JD+简历招呼语、面试准备包（含复盘输入时）。
- 需在 `pnpm dev` 下验证复盘入口体验：岗位目录点击“新建复盘”后可直接进入 `面试原文.md` 编辑。
- 需在 `pnpm dev` 下验证误判修复：保留模板头并追加真实内容后，点击“生成复盘报告”不再被错误拦截。
- 需在 `pnpm dev` 下验证 Markdown 新交互：默认仅渲染展示，不显示源码；点击“编辑源码”后可正常保存并返回预览。
- 需在 `pnpm dev` 下验证工具条两行布局：岗位目录动作按钮与状态文字在窄屏下仍可完整查看和点击。
- 需在 `pnpm dev` 下验证新手引导：首次打开自动弹窗；勾选“不再显示”后不重复弹出；AI 配置页可手动重开。
- 需在干净环境验证一键启动脚本：`start-curator.bat` / `start-curator.ps1` 可自动安装依赖并进入主界面。
- UI 细节仍需按执行手册逐步打磨（导入功能、更完整表单字段、流式取消按钮、暗色模式持久化等）。
- 需要在真实 API Key 下进行端到端业务回归（生成文书/准备包/复盘）。

## 下一轮接手建议
1. 先验收 LLM 配置新手路径：供应商联动、模型下拉反向联动 `baseURL`、验证连接、保存后刷新保留。
2. 先执行 Phase 8.5 回归验收：取消生成草稿落盘、正式文件隔离、后置派生隔离（准备包/复盘）。
3. 再验收 `storageMode`：切换 session/localStorage 后 API Key 读取与回显行为符合预期。
4. 在上述链路稳定后继续 Phase 8 剩余体验项（导入功能、主题持久化等）。

---

## 本轮补充（2026-04-09，基线冻结执行）

### 当前实现状态补充
- 已落地“代码基线优先”的治理策略：先修文档口径，再推进功能稳态。
- 已建立 Week 1 必备治理资产：偏离矩阵、4周并行路线、回归矩阵、安全发布清单。
- 已更新 `AGENTS.md` 的格式规则：文书/报告用 Markdown，结构化资产允许且要求 JSON。

### 本轮已完成事项补充
1. 新增 `BASELINE_ALIGNMENT_MATRIX.md`，固化文档-实现冲突与处理决定。
2. 新增 `ROADMAP_4W_MULTI_AGENT.md`，明确 Agent A-F 分工与 4 周里程碑。
3. 新增 `QA_REGRESSION_MATRIX.md`，沉淀 P0/P1/P2 测试基线。
4. 新增 `RELEASE_SECURITY_CHECKLIST.md`，固化开源前安全与发布签收项。
5. 更新 `Curator-AI-v3-产品规划.md`：新增“基线对齐补丁（2026-04-09）”。
6. 更新 `Curator-AI-v3-开发执行手册.md`：新增“基线冻结补丁（2026-04-09）”。
7. 更新 `README.md`：新增基线文档入口与 API Key 安全口径说明。

### 已验证结果补充
- 文档资产已全部入库，路径可访问。
- 新增规范不涉及接口与数据结构变更，符合“不改 `/api/chat`、不改 Dexie schema”的约束。

### 仍待处理或待验证补充
- 需执行一次 `pnpm build` 与主链路冒烟，完成本轮基线治理验收签收。
- 需按 `QA_REGRESSION_MATRIX.md` 先完成 P0 清单再进入 Week 2。

### 下一轮接手建议补充
1. 按 `BASELINE_ALIGNMENT_MATRIX.md` 将 P1 偏离项拆成可执行 issue（导入导出、暗色模式、右键交互）。
2. 由 Agent E 先跑 P0 回归并产出首周验收报告。
3. 通过后再进入 Week 2 的“机会获取周”功能提效。

---

## 本轮补充（2026-04-09，发布流程自动化）

### 本轮已完成事项补充
1. 新增 `publish-curator.ps1` 一键发布脚本：
   - 自动检查 git/node/pnpm
   - 自动执行 `pnpm build`
   - 自动执行敏感文件检查（`.env/.next/node_modules/证书文件`）
   - 自动 `git add`、`git commit`、`git pull --rebase`、`git push`
2. 新增 `publish-curator.bat` 双击入口，面向 Windows 新手用户。
3. 更新 `README.md`，补充“迭代后一键发布到 GitHub”使用说明。

### 已验证结果补充
- 一键发布脚本文件已入库，路径与调用方式明确。
- 脚本不修改后端协议与数据结构，仅做工程发布自动化。

### 待处理/待验证项补充
- 需在真实迭代后执行一次 `publish-curator.ps1` 全流程，验证提交与推送链路无环境差异问题。

---

## 本轮补充（2026-04-10，体验迭代：渲染稳定 + PDF导入 + 流程排序 + 岗位看板）

### 本轮已完成事项补充
1. 新增 `src/lib/markdown-normalize.ts`，统一处理 Markdown 输出清洗：
   - 去除首尾 ```markdown / ``` / ''' 包裹
   - 清理 BOM、冗余空行与尾部空白
2. `src/lib/generation-actions.ts` 接入 Markdown 清洗：
   - 岗位文书、面试准备包、复盘报告保存前统一归一化
   - 清洗后为空时直接失败，不落正式文件
   - 生成指令补充“禁止代码块包裹，仅返回 Markdown 正文”
3. 默认 prompt 文案补齐格式契约：
   - 更新 `src/lib/default-prompts/system.ts`
   - 更新 `src/lib/default-prompts/job.ts`
   - 更新 `src/lib/default-prompts/prep.ts`
   - 更新 `src/lib/default-prompts/review.ts`
4. 主简历新增“文本型 PDF 导入”：
   - 新增 `src/lib/pdf-import.ts`（前端 PDF 文本提取）
   - 在 `JsonFormView` 主简历区增加导入按钮与状态提示
   - 解析后走 LLM 结构化为 `ResumeData`，写入编辑态并标记未保存
   - 导入失败提示“当前版本仅支持文本型 PDF（非扫描件）”
5. 文件树根目录固定业务顺序：
   - `src/lib/file-system.ts` 根目录排序改为：简历 -> 岗位 -> 面试准备包 -> 面试复盘 -> AI配置
   - 非根目录保持“文件夹优先 + 名称排序”
6. 右侧区域改为上下 50:50：
   - 新增 `src/components/job/JobBoard.tsx`（岗位状态看板）
   - `src/app/page.tsx` 上半看板，下半 AI 助手
   - 看板支持按状态分组、点击卡片直接打开对应 `jd.md`
   - `status` 异常回落 `saved` 并给弱提示
7. 渲染样式协调：
   - `GeneratingView` 与 `MarkdownView` 统一背景基调
   - `globals.css` 增补 `prose pre` 亮暗主题样式，降低黑底割裂感

### 已验证结果补充
- `pnpm build` 本轮再次通过（含类型检查与静态页面构建）。
- 未改动 `/api/chat` 协议、Dexie schema、`ResumeData` 类型定义。

### 待处理/待验证项补充
- 需在 `pnpm dev` 下验证 PDF 导入真实链路（文本型 PDF）：
  - 导入后字段映射质量
  - 导入后手动保存与刷新回显
- 需在 `pnpm dev` 下验证准备包/复盘生成容错：
  - 模型返回 ``` 或 ''' 包裹时仍可稳定渲染
- 需在 `pnpm dev` 下验证岗位看板交互：
  - 状态分组显示
  - 点击卡片定位并打开 `jd.md`
- 需评估首页首屏体积增长（引入 PDF 解析依赖后 First Load JS 增加）。

### 下一轮接手建议补充
1. 优先做一轮主链路人工验收（生成/导入/看板/定位）。
2. 如 PDF 导入准确率不足，补“导入后对比预览 + 一键应用”轻量确认层。
3. 针对首屏体积，评估 PDF 解析模块按需动态加载优化。

---

## 本轮补充（2026-04-10，PDF 导入崩溃修复）

### 本轮已完成事项补充
1. 修复 `pdfjs-dist` 客户端顶层导入导致的运行时崩溃：`src/lib/pdf-import.ts` 改为函数内动态 import（懒加载）。
2. 增加浏览器环境保护与错误映射：
   - 组件加载失败提示“PDF 解析组件加载失败，请刷新页面后重试”。
   - 文本不可提取/异常 PDF 提示“当前版本仅支持文本型 PDF”。
3. 依赖锁定策略落地：
   - `package.json` 将 `pdfjs-dist` 固定为精确版本 `4.10.38`。
   - 增加 `pnpm.overrides` 强制锁定 `pdfjs-dist`。
4. 统一锁文件策略：
   - 移除 `package-lock.json`（若存在）。
   - 生成并保留 `pnpm-lock.yaml`。
   - 增加项目级 `.npmrc`（启用 lockfile）。

### 已验证结果补充
- `pnpm build` 通过。
- `pnpm-lock.yaml` 已生成并确认 `pdfjs-dist@4.10.38` 锁定生效。

### 待处理/待验证项补充
- 需在 `pnpm dev` 浏览器侧验证：打开首页和主简历页时不再触发 `Object.defineProperty called on non-object`。
- 需手测导入两类 PDF：
  - 文本型 PDF：可成功导入。
  - 扫描件/异常 PDF：不崩溃且提示明确。

## 本轮补充（2026-04-10，PDF 导入崩溃修复补丁）

### 本轮已完成事项补充
1. 修复 `src/lib/pdf-import.ts` 用户提示文案乱码，统一为可读中文错误提示。
2. 保持“懒加载 + 浏览器环境保护 + 解析失败友好回退”策略不变。

### 已验证结果补充
- 再次执行 `pnpm build` 通过。
- 校验 `pnpm-lock.yaml`，`pdfjs-dist@4.10.38` 锁定仍生效。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测 PDF 导入入口，确认错误提示与页面表现符合预期。

## 本轮补充（2026-04-10，下一步行动面板 + meta 隐藏 + 文案用户化）

### 本轮已完成事项补充
1. 右侧上半区从岗位状态看板升级为“下一步行动”清单：
   - 新版 `src/components/job/JobBoard.tsx` 支持一键执行动作（打开简历/JD、生成匹配分析、生成准备包、生成复盘）。
   - 行动项来源覆盖：主简历完整度、岗位缺准备包、复盘提取行动项。
2. 新增前端事件机制：
   - 新增 `src/lib/action-events.ts`。
   - 主简历保存成功后触发 `curator:resume-saved`。
   - 新建岗位成功后触发 `curator:job-created`。
   - 复盘生成成功后触发 `curator:review-generated`（携带摘要）。
3. 文件树隐藏 `meta.json`：
   - `src/components/file-tree/FileTree.tsx` 与 `src/components/file-tree/FileTreeNode.tsx` 增加 `path.endsWith("/meta.json")` 过滤。
4. Markdown 文案去开发者化：
   - 重写 `src/components/editor/MarkdownView.tsx` 顶栏文案为“阅读模式 / 编辑模式”。
5. 同步修复并清理 `src/lib/generation-actions.ts` 的编码污染与字符串截断问题，保持三条生成链路可用（岗位文书、准备包、复盘）且支持取消草稿。

### 已验证结果补充
- `pnpm build` 通过（类型检查 + 构建通过）。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测“下一步行动”三条触发时机：
  - 保存主简历后行动项刷新。
  - 新建岗位后“缺准备包”行动项出现。
  - 生成复盘后行动项注入并可点击执行。
- 需手测点击动作的用户反馈体验（执行中/失败提示是否足够清晰）。

## 本轮补充（2026-04-10，新手指引卡 + PDF 双轨 + 上下文简历优先级 + AI开发复盘）

### 本轮已完成事项补充
1. 右上面板增强为“新手使用指引 + 下一步行动”双层结构：
   - 在 `src/components/job/JobBoard.tsx` 顶部新增可折叠 5 步新手指引卡。
   - 5 步流程：新建/导入简历 -> 新建岗位 -> 生成准备包 -> 录入面试原文 -> 生成面试复盘。
   - 每步提供状态（已完成/待执行）与可点击入口按钮，点击后直接执行或跳转。
2. 主简历 PDF 导入升级为“双轨落盘”：
   - 导入时先保存 `/简历/个人简历.pdf`（原始资产）。
   - 文本提取后保存 `/简历/个人简历.提取.md`（上下文资产）。
   - 结构化结果仍写入主简历编辑态（`/简历/主简历.json` 保存逻辑不变）。
   - 成功提示改为“双轨已保存 + 主简历待保存”口径。
3. 上下文拼装统一简历注入优先级：
   - `src/lib/context-builder.ts` 改为：绑定简历（meta.resumeId）-> 导入提取文本 -> 主简历 JSON 兜底。
   - 在 job/prep/review 相关链路中可同时注入“结构化简历”和“原始提取文本”。
4. 新增复盘文档：
   - 新建 `AI开发复盘.md`，已按“代码现状优先”整理里程碑、能力矩阵、典型问题、遗留风险、P0/P1/P2 与“规划中未实现”单列。

### 已验证结果补充
- 已完成代码级静态核查：关键路径与文案、落盘路径、上下文注入逻辑均已就位。
- 当前终端环境无法直接完成 `pnpm build`：
  - `pnpm` 命令不可用；
  - `corepack pnpm build` 在受限网络下拉取 pnpm 失败（EACCES 443）。

### 待处理/待验证项补充
- 需在可用本地环境执行：`pnpm build`。
- 需手测新手指引 5 步状态联动与入口动作：
  - 导入 PDF 后是否在 `/简历` 看到 `个人简历.pdf` 与 `个人简历.提取.md`；
  - 生成岗位文书/准备包/复盘时内容是否体现导入简历信息。
- 需手测复盘步骤按钮在无面试目录时的兜底路径（自动创建一面原文）。

## 本轮补充（2026-04-10，PDF加载失败修复 + 指引完成自动隐藏）

### 本轮已完成事项补充
1. PDF 导入组件加载容错增强：
   - `src/lib/pdf-import.ts` 新增 `loadPdfJs()`。
   - 动态加载顺序改为：`pdfjs-dist/build/pdf.mjs` 优先，失败回退 `pdfjs-dist/legacy/build/pdf.mjs`。
   - 统一将模块加载失败映射为“PDF 解析组件加载失败，请刷新页面后重试”。
2. 导入失败提示补强：
   - `src/components/editor/JsonFormView.tsx` 在模块加载失败时追加明确重试指引文案（刷新页面/重启应用后重试）。
3. 新手指引完成即隐藏：
   - `src/components/job/JobBoard.tsx` 新增 `allGuideStepsCompleted` 判定。
   - 5 步全部完成后默认隐藏新手指引卡。
   - 新增轻量入口“重新查看指引”，可手动恢复展示。
   - 新增本地记忆 `curator-guide-hidden`，并在流程回退时自动恢复显示。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测 PDF 导入失败场景下的提示体验。
- 需手测“5 步完成后自动隐藏、回退后自动出现、手动重开”三条路径。

## 本轮补充（2026-04-10，简历双入口统一：PDF优先 + JSON兜底）

### 本轮已完成事项补充
1. PDF 导入从“严格失败”调整为“质量分级”：
   - `src/lib/pdf-import.ts` 新增 `PdfExtractResult`（`quality: ok | low`）。
   - 不再以固定阈值直接拦截；低质量提取可继续导入并给出提示。
2. 主简历导入链路升级：
   - `src/components/editor/JsonFormView.tsx` 在导入时先保存 `/简历/个人简历.pdf`，再提取 `/简历/个人简历.提取.md`。
   - 提取质量低时不再报硬错误，仍更新主简历编辑态并提示“建议检查后保存”。
   - 新增简历来源状态提示：`已导入PDF（优先）/仅主简历JSON/未配置简历`。
3. 上下文构建与路径常量修复：
   - 重写 `src/lib/context-builder.ts`（修复编码污染导致的中文路径异常）。
   - 统一注入：岗位绑定简历 + 导入提取文本 + 主简历兜底。
4. 生成前简历可用性兜底：
   - `src/lib/generation-actions.ts` 新增 `ensureResumeSourceAvailable`。
   - 岗位文书、准备包、复盘三条链路在生成前统一校验“至少一个可用简历来源”；缺失时自动打开 `/简历/主简历.json` 并提示。
5. 新手引导第 1 步口径更新：
   - `src/components/job/JobBoard.tsx` 改为“导入 PDF 或手动填写主简历（二选一）”。

### 已验证结果补充
- 构建验证通过：`next build` 成功（Next.js 14.2.5）。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测低质量 PDF（文本较少）场景下的实际提示文案体感。
- 需手测“仅导入 PDF 提取文本、未完善主简历字段”时准备包/复盘输出质量。

## 本轮补充（2026-04-10，个人简历 PDF 可用性修复）

### 本轮已完成事项补充
1. 主简历页单入口增强：
   - `src/components/editor/JsonFormView.tsx` 新增“删除个人简历 PDF”按钮。
   - 删除逻辑会同时清理 `/简历/个人简历.pdf` 与 `/简历/个人简历.提取.md`，不影响 `/简历/主简历.json`。
2. 覆盖确认：
   - 重复导入时若检测到已有 `个人简历.pdf`，先二次确认，再执行覆盖。
3. 来源状态细化：
   - 主简历页来源状态新增 `已导入PDF（提取缺失，当前回退主简历JSON）` 与 `已导入PDF（待提取）`。
4. 生成链路来源回执：
   - `src/lib/context-builder.ts` 新增 `getResumeSourceReceipt`。
   - `src/lib/generation-actions.ts` 在岗位文书/准备包/复盘保存提示中增加“本次已使用：{简历来源}”。
5. 上下文构建修复：
   - `src/lib/context-builder.ts` 统一修复中文路径与模块文案，确保 `/简历/主简历.json`、`/简历/个人简历.提取.md` 路径读取稳定。

### 已验证结果补充
- `next build` 通过（含类型检查）。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测“删除 PDF 后立即生成”场景，确认回执稳定显示“回退主简历JSON”。

## 本轮补充（2026-04-10，PDF 导入先保存后处理）

### 本轮已完成事项补充
1. 导入流程改为三段式：
   - `src/components/editor/JsonFormView.tsx` 先保存 `/简历/个人简历.pdf` 并立即 `reloadTree()`。
   - 后续再做文本提取与自动结构化，失败不回滚 PDF 文件。
2. 取消导入前强制模型配置：
   - 未配置模型时，仍完成 PDF 与提取文本保存，仅跳过自动结构化并给出提示。
3. 错误分级：
   - 新增 `success / warning / error` 三类导入反馈，避免“导入失败=文件未保存”的误解。
4. 文件类型判断增强：
   - `src/lib/pdf-import.ts` 新增 `isLikelyPdfFile`，支持 MIME、`.pdf` 扩展名与 PDF 魔数检测。
5. 删除能力保持：
   - `删除个人简历 PDF` 继续同时清理 `个人简历.pdf` 与 `个人简历.提取.md`。

### 已验证结果补充
- `next build` 通过（类型检查与构建均通过）。

### 待处理/待验证项补充
- 需手测“未配置模型 + 导入成功”提示文案是否符合新手理解预期。

## 本轮补充（2026-04-10，PDF 主路径改造）

### 本轮已完成事项补充
1. 空主简历分流入口：
   - `src/components/editor/JsonFormView.tsx` 新增 `isResumeDataEmpty` 判断。
   - 空简历默认显示“导入 PDF 简历（主按钮）/从零开始填写（次入口）”。
2. 三段式导入完整落地：
   - 流程固定为“保存 PDF -> 提取文本 -> 自动结构化”。
   - PDF 先保存并立刻刷新文件树，后续失败不回滚 PDF。
3. 导入过程可视化：
   - 新增阶段文案与 3 步进度点（保存中/提取中/结构化中），降低“无响应”感。
4. 非空简历入口调整：
   - 表单页按钮文案改为“重新导入 PDF”，与主流程区分。

### 已验证结果补充
- `next build` 通过（类型检查与构建通过）。

### 待处理/待验证项补充
- 需手测“空简历导入后自动转入可编辑表单”的体验连贯性。

## 本轮补充（2026-04-10，PDF 预览落地 + 导入语义修正）

### 本轮已完成事项补充
1. PDF 预览不再占位：
   - `src/components/editor/PdfPreview.tsx` 从占位文案改为真实预览组件（`<object>` 渲染 data URL）。
   - 增加“下载 PDF / 新窗口打开”操作，预览失败时给可操作 fallback。
2. 编辑区接入真实预览：
   - `src/components/editor/EditorArea.tsx` 传入 PDF `path + content` 给 `PdfPreview`。
3. 导入失败语义收敛：
   - `src/components/editor/JsonFormView.tsx` 将提取失败文案改为“未检测到可复制文字（已回退）”，避免误解为导入失败。
   - 在告警态增加“继续手动填写主简历”快捷按钮。
4. 上下文乱码修复：
   - `src/lib/context-builder.ts` 重写为 UTF-8 可读版本，修复简历路径常量与来源回执中文乱码。

### 已验证结果补充
- `next build` 通过（类型检查与构建通过）。

### 待处理/待验证项补充
- 需在 `pnpm dev` 手测不同浏览器下 PDF 内嵌预览兼容性（若不支持应稳定走下载/新窗 fallback）。

---

## 本轮补充（2026-04-10，复盘多轮次重构 + 文档收敛）

### 本轮已完成事项补充
1. 面试复盘目录重构为 `/面试复盘/{公司-岗位}/{轮次}/`，并固定轮次目录文件：`面试原文.md`、`复盘报告.md`、`meta.json`。
2. `createInterviewRecord` 改为“先创建岗位级目录，再创建轮次目录”，同轮次重复进入不覆盖已录入原文。
3. 新增旧数据迁移 `migrateLegacyInterviewFoldersIfNeeded`：
   - 扫描旧结构 `/面试复盘/{公司-岗位-轮次}`
   - 迁移到新结构并处理轮次冲突（自动 `-2/-3`）
   - 使用本地标记避免重复全量迁移。
4. 兼容兜底生效：右侧新手指引与行动面板改为按“复盘轮次目录”识别最新复盘。
5. 编码污染 P0 修复：重写并清理关键文件 UTF-8 文案/路径常量：
   - `src/components/editor/Toolbar.tsx`
   - `src/lib/context-builder.ts`
   - `src/lib/init-workspace.ts`
   - `src/components/file-tree/FileTree.tsx`
   - `src/components/file-tree/FileTreeNode.tsx`
   - `src/lib/system-files.ts`
6. 新增复盘路径 helper：`src/lib/interview-paths.ts`。
7. 文档收敛更新：
   - `Curator-AI-v3-产品规划.md`
   - `Curator-AI-v3-开发执行手册.md`
   - `README.md`
   - `AI开发复盘.md`
8. 发布脚本增强：`publish-curator.ps1` 增加 build 失败（含 EPERM 场景）友好提示。

### 待验证项补充
- 需在 `pnpm dev` 下验证旧复盘自动迁移：旧目录是否被转移到“岗位/轮次”结构且内容完整。
- 需验证同岗位创建一面/二面后，两份复盘互不覆盖且均可独立生成报告。
- 需验证工具栏在“岗位级复盘目录”不误触发复盘生成按钮，仅在轮次目录/文件下可触发。

### 下一轮接手建议补充
1. 为“新建复盘”补充可视化轮次选择器（替代 prompt 输入），减少手误。
2. 增加迁移结果轻提示（如迁移数量、冲突重命名），提升升级可解释性。
3. 在 QA 回归中新增“旧结构兼容回归”专项用例。

---

## 本轮补充（2026-04-10，新手指引收敛 + 发布固化 + 微信轻量包）

### 本轮已完成事项补充
1. 首页首次弹窗引导已移除，统一保留右侧 5 步新手引导为唯一入口。
2. AI 配置页“新手引导”入口已改为定位右侧引导（事件：`curator:focus-guide`），不再触发弹窗。
3. 右侧引导按钮文案统一为“立即去做”，保持行动导向。
4. 发布脚本增强：`publish-curator.ps1` 新增 git 身份检查，发布成功后显示 branch/commit/remote。
5. 新增微信轻量打包脚本：
   - `package-wechat.ps1`
   - `package-wechat.bat`
6. 新增微信新手说明：`README-微信快速开始.md`。
7. README 新增：发布给朋友前 Checklist、微信轻量压缩包说明、发布结果可见项。
8. 已实际生成微信压缩包：
   - `release/curator-ai-v3-wechat-20260410-1657.zip`
   - 体积约 `13.14 MB`。

### 待验证项补充
- 需在无本地缓存的新机器验证微信压缩包解压后 `start-curator.bat` 一次启动体验。
- 需在真实发布流程中验证 `publish-curator.bat` 的 git 身份拦截提示是否符合预期。

### 下一轮接手建议补充
1. 在右侧 5 步引导加入“首个未完成步骤高亮”视觉标记（当前为统一列表展示）。
2. 如需进一步降低小白门槛，可增加“环境检测结果页”（Node/pnpm 安装链接一键跳转）。

---

## 本轮补充（2026-04-10，跨平台脚本补齐：macOS 可用）

### 本轮已完成事项补充
1. 新增 macOS/Linux 启动脚本：`start-curator.sh`。
2. 新增 macOS/Linux 发布脚本：`publish-curator.sh`。
3. 新增 macOS/Linux 微信打包脚本：`package-wechat.sh`。
4. README 已补充 Win/mac 双平台操作说明与 `chmod +x` 提示。
5. 说明口径修正：`.bat` 仅适用于 Windows；macOS 必须使用 `.sh`。

### 待验证项补充
- 需在真实 macOS 终端验证：
  - `./start-curator.sh`
  - `./publish-curator.sh`
  - `./package-wechat.sh`
- 若仓库从 Windows 下载到 macOS，需先执行一次 `chmod +x *.sh`。

---

## 本轮补充（2026-04-10，脚本与分享包整洁化）

### 本轮已完成事项补充
1. 新建脚本目录并分层：
   - `scripts/start/`（启动逻辑）
   - `scripts/release/`（发布与打包逻辑）
2. 根目录脚本改为薄入口：
   - `start-curator.bat/.ps1/.sh`
   - `publish-curator.bat/.ps1`
   - `package-wechat.bat/.ps1`
3. 移除误导性的 mac 发布/打包脚本：
   - 删除 `publish-curator.sh`
   - 删除 `package-wechat.sh`
4. 微信打包策略调整：
   - 保留 Win/mac 双平台启动脚本
   - 不再打包发布脚本与打包脚本
   - 新增打包 `scripts/start/` 以保证启动入口可用
5. README 重构为三段导航：
   - 我是用户（启动）
   - 我是开发者（Windows 发布）
   - 我要分享给朋友（Windows 打包）
6. `README-微信快速开始.md` 改为用户视角，按系统选择启动脚本。
7. `.gitignore` 新增 `release/`，避免产物污染仓库。
8. 新增 `scripts/README.md`，说明脚本分层与职责边界，便于协作者维护。

### 待验证项补充
- 需在真实 macOS 终端验证 `start-curator.sh` 包装器 + `scripts/start/start-curator.sh` 链路。
- 需在 Windows 验证入口脚本转发后，`publish-curator.ps1`、`package-wechat.ps1` 参数传递无回归。

### 口径收敛说明（最终）
- macOS/Linux 仅保留启动能力：`start-curator.sh`。
- 发布与微信打包仅在 Windows 执行：`publish-curator.*`、`package-wechat.*`。
- 先前“新增 mac 发布/打包脚本”的阶段性记录已废弃，以本条为准。
