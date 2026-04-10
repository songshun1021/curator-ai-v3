# Curator AI v3 — 开发执行手册

> 版本：v1.0 | 日期：2026-04-09
> 配合《Curator-AI-v3-产品规划.md》使用
> 本手册是**逐步执行的开发指南**，按顺序完成每个任务即可交付完整产品。
> 当前代码基线：React 18 + Tailwind CSS v3（与仓库现状对齐）。
> LLM 链路基线：统一入口 `src/lib/ai-engine.ts`，统一代理 `src/app/api/chat/route.ts`。
> 升级里程碑：MVP 主链路稳定后，单列评估升级到 React 19 + Tailwind CSS v4。

## 基线冻结补丁（2026-04-09）

本节为当前执行优先级最高的开发约束，用于统一“文档与实现”：

1. 系统 Prompt/Agent 主路径为 `/.system/*`，默认在文件树隐藏；仅通过 AI 配置高级入口维护。
2. 渲染策略为“默认渲染，手动编辑”：Markdown/JSON 打开后优先阅读视图。
3. 资产格式统一：文书/报告 `.md`，结构化资产 `.json`；定制简历必须严格合法 JSON。
4. 本阶段已知未闭环能力（需独立验收后再标记完成）：
   - 导入/导出完整恢复（files + chat_threads + chat_messages）
   - 暗色模式显式入口与持久化
   - 部分右键交互仍为 prompt 临时方案（后续替换为可见菜单）
5. 所有变更合入门禁：
   - `pnpm build` 必过
   - 主链路冒烟（模型配置 -> 新建岗位/JD -> 文书 -> 准备包 -> 复盘）必过
   - `SESSION_COMPACT.md` 同步更新


***

## 使用说明

### 你需要准备的工具

| 工具              | 用途               | 获取方式                |
| --------------- | ---------------- | ------------------- |
| **Codex**       | AI 编程 IDE，主力开发工具 | openai.com/codex 下载 |
| **Node.js 18+** | 运行 Next.js 项目    | nodejs.org 下载       |
| **Git**         | 版本管理（可选但强烈推荐）    | git-scm.com         |
| **浏览器**         | 运行和测试项目          | Chrome / Edge       |

### 如何使用本手册

1. 按 Phase 顺序执行，不要跳步
2. 每个 Phase 内按任务编号顺序执行
3. 每个任务都有 **「给 AI 的 Prompt」**，直接复制粘贴到 Codex 的对话界面中
4. 每个任务完成后，按 **「验收标准」** 检查是否通过
5. 一个 Phase 内所有任务通过后，执行 **「Phase 验收」** 确认整体可用
6. 遇到问题时，使用 **「常见问题」** 中的排错 Prompt

### Prompt 使用技巧

- 首次使用 Codex 时，可以直接开始对话（适合从零创建项目）
- 后续修改和迭代继续在同一对话中完成（适合在现有代码上修改）
- 如果 AI 生成的代码有报错，直接把报错信息粘贴给它，说「修复这个错误」
- 如果 AI 改了不该改的地方，说「撤销上一步修改，只改xxx」
- 每个 Phase 完成后建议用 Git 提交一次：`git add . && git commit -m "完成 Phase X"`

***

## Phase 0：项目骨架

> 目标：跑通三栏 IDE 布局，文件树可交互，视觉上像 Codex
> 预计耗时：1-2 小时 | 预计 AI 对话轮数：5-15 轮

### 任务 0.1：创建 Next.js 项目并安装依赖

**给 AI 的 Prompt：**

```
帮我创建一个新的 Next.js 14 项目，要求：

1. 使用 App Router（不要 Pages Router）
2. 使用 TypeScript
3. 使用 Tailwind CSS
4. 安装 shadcn/ui 组件库
5. 安装以下额外依赖：
   - zustand（状态管理）
   - lucide-react（图标）
6. 项目名称：curator-ai
7. 初始化完成后，确保 `pnpm dev` 能正常启动并显示默认页面

请给我完整的命令行步骤和需要修改的配置文件。
```

**验收标准：**

- [x] 运行 `pnpm dev` 后浏览器打开 `localhost:3000` 能看到页面
- [ ] 项目目录中有 `tailwind.config.ts`、`tsconfig.json`
- [ ] `package.json` 中包含 zustand、lucide-react

**常见问题：**

- 如果 `pnpm create next-app` 报错 → 确认 Node.js 版本 >= 18，运行 `node -v` 检查
- 如果 shadcn/ui 安装失败 → 对 AI 说「shadcn/ui 初始化报错了，这是错误信息：\[粘贴错误]，请帮我修复」

***

### 任务 0.2：实现三栏布局

**给 AI 的 Prompt：**

```
在当前 Next.js 项目中，实现一个三栏布局页面，要求：

【整体布局】
- 占满整个浏览器视口（100vw × 100vh），不可滚动
- 三栏水平排列，使用 CSS Flexbox

【左栏 - 文件树区域】
- 固定宽度 240px
- 背景色比主区域稍深（浅灰色）
- 顶部显示应用名称 "Curator AI"，使用 16px 加粗字体
- 下方是文件树占位区域，显示文字"文件树"
- 左栏和中栏之间有 1px 的分隔线

【中栏 - 文件内容区域】
- 自适应剩余宽度（flex: 1）
- 顶部有一个 40px 高的工具栏区域，背景色浅灰，显示文字"工具栏"
- 下方是内容区域，居中显示文字"请选择一个文件"
- 中栏和右栏之间有 1px 的分隔线

【右栏 - AI 对话区域】
- 固定宽度 380px
- 顶部显示标题"AI 助手"
- 中间是消息列表区域（flex: 1，可滚动）
- 底部固定一个输入框区域：
  - 一个文本输入框（placeholder="输入消息..."）
  - 一个发送按钮（使用 lucide-react 的 SendHorizonal 图标）
  - 输入框和按钮水平排列

【技术要求】
- 所有代码写在 src/app/page.tsx 和 src/app/layout.tsx 中
- 使用 Tailwind CSS 类名，不要用 inline style
- layout.tsx 中设置全局样式：html 和 body 的 height 为 100%，overflow hidden
- 配色使用中性色（白色、灰色），不要用彩色

请直接修改项目文件，实现上述布局。
```

**验收标准：**

- [x] 页面显示三栏布局，左 240px / 中自适应 / 右 380px
- [x] 三栏占满整个浏览器窗口，没有滚动条
- [x] 右栏底部有输入框和发送按钮
- [x] 调整浏览器宽度时，只有中栏宽度变化

***

### 任务 0.3：实现文件树组件

**给 AI 的 Prompt：**

```
在左栏区域实现一个可交互的文件树组件，要求：

【文件树数据（硬编码）】
使用以下固定数据结构来渲染文件树：
const fileTreeData = [
  {
    name: "简历", type: "folder", children: [
      { name: "_resume.prompt.md", type: "file" },
      { name: "_resume.skill.md", type: "file" },
      { name: "主简历.json", type: "file" },
    ]
  },
  {
    name: "岗位", type: "folder", children: [
      { name: "_job.prompt.md", type: "file" },
      { name: "_job.skill.md", type: "file" },
    ]
  },
  {
    name: "面试准备包", type: "folder", children: [
      { name: "_prep.prompt.md", type: "file" },
      { name: "_prep.skill.md", type: "file" },
    ]
  },
  {
    name: "面试复盘", type: "folder", children: [
      { name: "_review.prompt.md", type: "file" },
      { name: "_review.skill.md", type: "file" },
    ]
  },
  {
    name: "AI配置", type: "folder", children: [
      { name: "_system.prompt.md", type: "file" },
      { name: "模型配置.json", type: "file" },
      { name: "记忆摘要.md", type: "file" },
    ]
  },
];

【文件树交互】
- 文件夹前面显示折叠图标：展开时用 ChevronDown，折叠时用 ChevronRight（来自 lucide-react）
- 点击文件夹名称或图标可以 展开/折叠
- 文件前面显示文件图标：.md 文件用 FileText 图标，.json 文件用 FileJson2 图标（来自 lucide-react）
- 点击文件时，该文件行高亮显示（蓝色浅底色），中栏标题更新为该文件名
- 子项相对父文件夹有 16px 的左缩进
- 系统文件（以 _ 开头的文件）名称显示为灰色，其他文件显示为默认黑色

【组件结构】
- 创建 src/components/file-tree/FileTree.tsx 作为文件树主组件
- 创建 src/components/file-tree/FileTreeNode.tsx 作为单个节点的递归组件
- 使用 Zustand 创建 src/store/app-store.ts，管理状态：
  - currentFilePath: string | null（当前选中的文件路径）
  - expandedFolders: Set<string>（展开的文件夹路径集合）
  - 对应的 action：setCurrentFile、toggleFolder

【视觉风格】
- 文件树每行高度 32px
- 字体大小 13px
- 图标大小 16px，与文件名间距 6px
- hover 时显示浅灰色背景
- 选中文件时显示浅蓝色背景 + 蓝色文字

请创建以上文件并修改 page.tsx 使用新的文件树组件。
```

**验收标准：**

- [ ] 左栏显示 5 个文件夹，每个都可以展开/折叠
- [ ] 展开后能看到 .md 和 .json 文件
- [ ] 点击文件时高亮显示，中栏顶部显示文件名
- [ ] 以 `_` 开头的文件名显示为灰色
- [ ] 刷新页面后文件树恢复初始状态（因为还没持久化）

***

### 任务 0.4：中栏占位内容

**给 AI 的 Prompt：**

```
修改中栏内容区域，使其响应文件树的点击：

1. 当没有选中任何文件时，中栏居中显示：
   - 一个 lucide-react 的 MousePointerClick 图标（48px，灰色）
   - 下方文字"选择一个文件开始编辑"（14px，灰色）

2. 当选中了某个文件时，中栏显示：
   - 顶部工具栏显示当前文件的完整路径（如"简历 / _resume.prompt.md"），用面包屑样式
   - 内容区域显示占位文字"文件内容：{文件名}（编辑器将在 Phase 1 实现）"

3. 从 Zustand store 读取 currentFilePath 来决定显示什么内容

请修改相关组件。
```

**验收标准：**

- [ ] 初始状态中栏显示空状态图标和提示
- [ ] 点击文件后中栏显示文件路径和占位内容
- [ ] 切换点击不同文件时内容随之变化

***

### Phase 0 整体验收

- [ ] 三栏布局完整呈现，视觉上整洁像 IDE
- [ ] 文件树可展开折叠、点击高亮
- [ ] 中栏响应文件选择
- [ ] 右栏有对话框 UI（输入框+按钮，但还不能真正对话）
- [ ] 无 console 报错
- [ ] **用 Git 提交：** `git add . && git commit -m "Phase 0: 项目骨架完成"`

***

## Phase 1：虚拟文件系统

> 目标：IndexedDB 驱动文件树，数据刷新后持久化，能编辑 .md 文件
> 预计耗时：2-3 小时 | 预计 AI 对话轮数：10-25 轮
> 前置依赖：Phase 0 完成

### 任务 1.1：安装 Dexie 并定义数据库

**给 AI 的 Prompt：**

```
安装 dexie 库，并创建虚拟文件系统的数据库定义：

1. 运行 pnpm add dexie

2. 创建 src/lib/db.ts，定义 Dexie 数据库：

数据库名称：CuratorAIDB
版本：1
表名：files

files 表的 TypeScript 接口：
interface VirtualFile {
  id: string;            // 唯一ID，用 crypto.randomUUID() 生成
  path: string;          // 虚拟路径，如 "/简历/_resume.prompt.md"
  name: string;          // 文件名，如 "_resume.prompt.md"
  type: 'folder' | 'file';
  contentType: 'md' | 'json' | 'pdf' | 'none';  // none 用于文件夹
  content: string;       // 文件内容，文件夹为空字符串
  isSystem: boolean;     // 是否是系统预置文件（_开头的prompt/skill文件）
  isGenerated: boolean;  // 是否是 AI 生成的文件
  parentPath: string;    // 父路径，如 "/简历"，根文件夹的 parentPath 为 "/"
  metadata: string;      // JSON 字符串，存储额外元数据（jobId, resumeId 等）
  createdAt: string;     // ISO 时间戳
  updatedAt: string;     // ISO 时间戳
}

索引：id（主键）, path（唯一索引）, parentPath（普通索引）, type（普通索引）

3. 导出数据库实例 db 和 VirtualFile 类型

请创建这个文件。
```

**验收标准：**

- [ ] `src/lib/db.ts` 文件存在
- [ ] 导出了 db 实例和 VirtualFile 接口
- [ ] 无 TypeScript 类型错误

***

### 任务 1.2：实现文件系统 CRUD 函数

**给 AI 的 Prompt：**

```
创建 src/lib/file-system.ts，实现虚拟文件系统的所有 CRUD 操作：

import { db, VirtualFile } from './db';

需要实现以下函数：

1. createFile(file: Omit<VirtualFile, 'id' | 'createdAt' | 'updatedAt'>): Promise<VirtualFile>
   - 自动生成 id（crypto.randomUUID()）
   - 自动设置 createdAt 和 updatedAt 为当前时间
   - 如果 path 已存在，抛出错误
   - 返回创建的完整文件对象

2. readFile(path: string): Promise<VirtualFile | undefined>
   - 根据 path 查找文件
   - 返回文件对象，不存在返回 undefined

3. updateFile(path: string, updates: Partial<Pick<VirtualFile, 'content' | 'name' | 'metadata'>>): Promise<void>
   - 根据 path 更新文件内容
   - 自动更新 updatedAt
   - 如果文件不存在，抛出错误

4. deleteFile(path: string): Promise<void>
   - 删除指定文件
   - 如果是文件夹，递归删除所有子文件和子文件夹
   - 如果文件不存在，静默忽略

5. listChildren(parentPath: string): Promise<VirtualFile[]>
   - 列出指定路径下的直接子项（文件夹和文件）
   - 结果排序：文件夹在前，文件在后；同类型按名称字母序排列

6. listAllDescendants(parentPath: string): Promise<VirtualFile[]>
   - 列出指定路径下所有后代（递归，包括子文件夹中的内容）

7. getFileTree(): Promise<TreeNode[]>
   - 返回完整的文件树结构，格式为：
   interface TreeNode {
     file: VirtualFile;
     children: TreeNode[];
   }
   - 从根路径 "/" 开始构建
   - 排序规则同 listChildren

8. fileExists(path: string): Promise<boolean>
   - 检查路径是否已存在

所有函数都要有完善的错误处理。
请创建这个文件。
```

**验收标准：**

- [ ] `src/lib/file-system.ts` 文件存在
- [ ] 导出了所有 8 个函数
- [ ] 无 TypeScript 类型错误

***

### 任务 1.3：创建默认 Prompt 内容

**给 AI 的 Prompt：**

```
创建 src/lib/default-prompts/ 目录，为每个系统文件创建默认内容。

创建以下文件，每个文件导出一个字符串常量：

1. src/lib/default-prompts/system.ts
导出 DEFAULT_SYSTEM_PROMPT，内容：
```

# 角色定义

你是 Curator AI，一个专业的求职辅导助手，服务对象是中国大陆高校学生。

# 语言风格

- 使用中文回复
- 专业但不生硬，像一个耐心的学长/学姐
- 给出的建议要具体可执行，不说空话

# 输出规范

- 使用 Markdown 格式
- 重要内容用加粗或引用块
- 列表项需有具体说明，不要只列标题

```

2. src/lib/default-prompts/resume.ts
导出 DEFAULT_RESUME_PROMPT 和 DEFAULT_RESUME_SKILL

DEFAULT_RESUME_PROMPT 内容：
```

# 目标

帮助用户优化简历内容，使其符合目标岗位要求。

# 简历润色规则

- 使用 STAR 法则（Situation-Task-Action-Result）重组经历描述
- 量化成果：优先使用数字（提升XX%、服务XX人、节省XX小时）
- 动词开头：主导、推动、设计、搭建、优化、完成
- 每条经历控制在 1-2 行

# 定制简历生成规则

- 输入：主简历全部经历 + 目标JD
- 筛选与JD最匹配的 3-5 段经历
- 调整措辞使其贴合JD关键词
- 输出：完整的定制简历JSON（与主简历结构一致）

```

DEFAULT_RESUME_SKILL 内容：
```

# 简历评分标准

- 内容完整度（基本信息、教育、经历、技能是否齐全）
- STAR法则应用（每段经历是否有情境、任务、行动、结果）
- 量化程度（数字出现的频率）
- 关键词匹配度（与目标岗位JD的关键词重合度）
- 排版规范性（格式是否统一，是否有错别字）

```

3. src/lib/default-prompts/job.ts
导出 DEFAULT_JOB_PROMPT 和 DEFAULT_JOB_SKILL

DEFAULT_JOB_PROMPT 内容：
```

# 目标

解析JD内容，生成匹配度分析和求职文书。

# JD解析规则

从JD文本中提取：核心职责（3-5条）、必备技能、加分项、隐含要求

# 匹配度分析

- 逐项对比JD要求与简历内容
- 输出匹配度评分（0-100）和逐项分析
- 标注优势项和缺口项

# BOSS招呼语规则

- 字数：80-120字
- 结构：自我介绍(1句) + 岗位匹配点(2-3个) + 表达意愿(1句)

# 求职邮件规则

- 结构：称呼 + 自我介绍 + 为什么选这家 + 核心匹配点(3个) + 结尾
- 长度：300-500字

```

DEFAULT_JOB_SKILL 内容：
```

# 岗位分析能力

- 识别JD中的硬性要求与软性期望
- 分析公司文化和团队风格
- 提取面试可能考察的核心能力维度

```

4. src/lib/default-prompts/prep.ts
导出 DEFAULT_PREP_PROMPT 和 DEFAULT_PREP_SKILL

DEFAULT_PREP_PROMPT 内容：
```

# 目标

基于JD + 简历 + 历史复盘，生成个性化的面试准备包。

# 准备包结构（固定输出此结构）

## 1. 岗位匹配度速览

## 2. 高频面试题（15-20题）

分类：自我介绍、行为题、业务题、专业题、反问环节
每题附参考答案框架

## 3. 简历追问预测

简历中可能被追问的3-5个点 + 应对策略

## 4. 知识薄弱点

基于JD要求vs简历内容，列出需复习的知识领域

## 5. 历史复盘教训（如有）

从记忆摘要中提取该岗位类型的历史失误和改进项

```

DEFAULT_PREP_SKILL 内容：
```

# 面试题生成能力

- 行为面试题遵循 STAR 框架
- 专业题覆盖JD中提到的所有技术/业务领域
- 反问环节提供3-5个高质量问题
- 参考答案框架给出要点而非完整脚本

```

5. src/lib/default-prompts/review.ts
导出 DEFAULT_REVIEW_PROMPT 和 DEFAULT_REVIEW_SKILL

DEFAULT_REVIEW_PROMPT 内容：
```

# 目标

分析面试表现，生成结构化复盘报告。

# 复盘报告结构（固定输出此结构）

## 1. 整体评估（A/B/C/D + 一句话总结）

## 2. 逐题分析

每道题：评分(1-5星) + 优点 + 改进 + 参考答案

## 3. 知识盲区（缺口 + 推荐学习方向）

## 4. 行动项（3-5个具体事项 + 完成标准）

# 评分标准

- A：表现优秀，回答完整有深度
- B：表现良好，有个别瑕疵
- C：表现一般，多处需改进
- D：表现较差，需要系统性提升

```

DEFAULT_REVIEW_SKILL 内容：
```

# 面试评估能力

- 识别回答中的逻辑漏洞和表达问题
- 区分知识性错误和表达性问题
- 行动项必须具体、可量化、有截止标准

```

6. 最后创建 src/lib/default-prompts/index.ts 统一导出所有内容。

请创建以上所有文件。
```

**验收标准：**

- [ ] `src/lib/default-prompts/` 目录下有 6 个文件
- [ ] 每个文件导出对应的字符串常量
- [ ] `index.ts` 能统一导出所有内容

***

### 任务 1.4：实现初始化逻辑

**给 AI 的 Prompt：**

```
创建 src/lib/init-workspace.ts，实现应用首次打开时的工作区初始化逻辑：

这个函数在应用启动时调用，检查 IndexedDB 是否为空（首次使用），如果是则创建所有默认文件夹和系统文件。

import { db } from './db';
import { createFile } from './file-system';
import { 所有默认prompt内容 } from './default-prompts';

export async function initWorkspace(): Promise<void> {
  // 1. 检查数据库是否已有数据
  const count = await db.files.count();
  if (count > 0) return; // 已初始化过，直接返回

  // 2. 创建 5 个根文件夹
  const rootFolders = ['简历', '岗位', '面试准备包', '面试复盘', 'AI配置'];
  for (const name of rootFolders) {
    await createFile({
      path: `/${name}`,
      name,
      type: 'folder',
      contentType: 'none',
      content: '',
      isSystem: false,
      isGenerated: false,
      parentPath: '/',
      metadata: '{}',
    });
  }

  // 3. 创建简历文件夹下的系统文件
  await createFile({ path: '/简历/_resume.prompt.md', name: '_resume.prompt.md', type: 'file', contentType: 'md', content: DEFAULT_RESUME_PROMPT, isSystem: true, isGenerated: false, parentPath: '/简历', metadata: '{}' });
  await createFile({ path: '/简历/_resume.skill.md', name: '_resume.skill.md', type: 'file', contentType: 'md', content: DEFAULT_RESUME_SKILL, isSystem: true, isGenerated: false, parentPath: '/简历', metadata: '{}' });

  // 4. 创建岗位文件夹下的系统文件
  // （同理创建 _job.prompt.md 和 _job.skill.md）

  // 5. 创建面试准备包文件夹下的系统文件
  // （同理创建 _prep.prompt.md 和 _prep.skill.md）

  // 6. 创建面试复盘文件夹下的系统文件
  // （同理创建 _review.prompt.md 和 _review.skill.md）

  // 7. 创建AI配置文件夹下的文件
  await createFile({ path: '/AI配置/_system.prompt.md', name: '_system.prompt.md', type: 'file', contentType: 'md', content: DEFAULT_SYSTEM_PROMPT, isSystem: true, isGenerated: false, parentPath: '/AI配置', metadata: '{}' });
  await createFile({ path: '/AI配置/模型配置.json', name: '模型配置.json', type: 'file', contentType: 'json', content: JSON.stringify({ provider: '', model: '', baseURL: '', apiKey: '', storageMode: 'session-only' }, null, 2), isSystem: true, isGenerated: false, parentPath: '/AI配置', metadata: '{}' });
  await createFile({ path: '/AI配置/记忆摘要.md', name: '记忆摘要.md', type: 'file', contentType: 'md', content: '# 记忆摘要\n\n> 此文件由系统自动维护，记录你的求职经历要点。\n\n暂无记录。', isSystem: true, isGenerated: false, parentPath: '/AI配置', metadata: '{}' });

  // 8. 创建简历/定制简历 子文件夹（空文件夹，预建）
  await createFile({ path: '/简历/定制简历', name: '定制简历', type: 'folder', contentType: 'none', content: '', isSystem: false, isGenerated: false, parentPath: '/简历', metadata: '{}' });
}

请补全上述代码中省略的部分（步骤4、5、6），确保所有11个系统文件都被创建。
```

**验收标准：**

- [ ] `src/lib/init-workspace.ts` 文件存在
- [ ] 函数创建了 5 个根文件夹 + 1 个子文件夹 + 11 个系统文件
- [ ] 重复调用时不会重复创建（检查 count > 0）

***

### 任务 1.5：文件树从 IndexedDB 加载

**给 AI 的 Prompt：**

```
修改文件树组件，使其从 IndexedDB 读取数据，而不是硬编码：

1. 修改 src/store/app-store.ts，增加以下状态和方法：
   - fileTree: TreeNode[]（文件树数据）
   - isLoading: boolean
   - loadFileTree(): 调用 file-system.ts 的 getFileTree() 加载数据
   - refreshFileTree(): 同 loadFileTree，用于数据变更后刷新

2. 修改 src/app/page.tsx 或创建一个顶层 Provider：
   - 在页面挂载时（useEffect）：
     a. 调用 initWorkspace() 初始化工作区
     b. 然后调用 loadFileTree() 加载文件树
   - 注意：这两个操作都是异步的，需要处理 loading 状态
   - 因为 Dexie 是浏览器端 API，需要确保代码只在客户端运行（使用 'use client' 指令）

3. 修改 FileTree 组件：
   - 从 Zustand store 读取 fileTree 数据
   - loading 时显示骨架屏或简单的"加载中..."
   - 数据加载完成后渲染文件树

4. 删除之前硬编码的 fileTreeData

请修改以上相关文件。注意 Next.js App Router 中需要在使用 hooks 的组件文件顶部添加 'use client' 指令。
```

**验收标准：**

- [ ] 页面加载后文件树从 IndexedDB 读取
- [ ] 显示 5 个根文件夹和其中的系统文件
- [ ] 刷新页面后文件树依然存在（数据已持久化）
- [ ] 浏览器 DevTools → Application → IndexedDB 中能看到 CuratorAIDB 数据库

***

### 任务 1.6：Markdown 编辑器集成

**给 AI 的 Prompt：**

```
安装 Markdown 编辑器并集成到中栏内容区，实现 .md 文件的编辑和保存：

1. 安装：pnpm add @uiw/react-md-editor

2. 创建 src/components/editor/EditorArea.tsx
   - 根据当前选中文件的 contentType 决定渲染什么视图
   - contentType === 'md' → 渲染 MarkdownView 组件
   - contentType === 'json' → 暂时渲染纯文本（后续任务实现表单）
   - 未选中文件 → 渲染空状态

3. 创建 src/components/editor/MarkdownView.tsx
   - 接收 filePath 属性
   - 从 IndexedDB 读取文件内容（使用 readFile）
   - 使用 @uiw/react-md-editor 的 MDEditor 组件，同时显示编辑和预览
   - 编辑内容变化时，设置一个 2 秒的防抖自动保存（调用 updateFile）
   - 保存成功后，在工具栏右侧短暂显示"已保存"提示（1秒后消失）
   - 工具栏左侧显示文件路径（面包屑格式）

4. 修改 page.tsx，将中栏替换为 EditorArea 组件

5. CSS 适配：
   - MDEditor 需要占满中栏的剩余高度（减去工具栏的 40px）
   - 确保编辑器在暗色和亮色模式下都正常显示
   - 如果 MDEditor 样式与 Tailwind 冲突，添加必要的 CSS 覆盖

请实现以上内容。
```

**验收标准：**

- [ ] 点击 .md 文件后中栏显示 Markdown 编辑器
- [ ] 编辑器左侧可编辑，右侧实时预览
- [ ] 编辑后 2 秒自动保存到 IndexedDB
- [ ] 刷新页面后再打开同一文件，内容依然是修改后的
- [ ] 编辑 `_resume.prompt.md` 的内容，刷新后内容保留

***

### 任务 1.7：JSON 文件的纯文本查看

**给 AI 的 Prompt：**

```
创建 src/components/editor/JsonView.tsx，实现 .json 文件的查看和编辑：

暂时使用简单的代码编辑器视图（不是表单，表单在 Phase 3 实现）：

1. 从 IndexedDB 读取文件内容
2. 使用一个 textarea 或 pre 标签显示 JSON 内容
3. 支持编辑和保存（同样 2 秒防抖自动保存）
4. JSON 内容格式化显示（缩进2空格）
5. 如果 JSON 格式无效，底部显示红色错误提示

修改 EditorArea.tsx，当 contentType === 'json' 时使用 JsonView 组件。
```

**验收标准：**

- [ ] 点击 .json 文件后中栏显示 JSON 内容
- [ ] 可以编辑 JSON 内容并自动保存
- [ ] 无效 JSON 时显示错误提示

***

### Phase 1 整体验收

- [ ] 所有文件从 IndexedDB 读取，刷新不丢失
- [ ] .md 文件可编辑和预览
- [ ] .json 文件可查看和编辑
- [ ] 修改 \_resume.prompt.md 后刷新，内容保留
- [ ] DevTools → IndexedDB 中数据正确
- [ ] **Git 提交：** `git add . && git commit -m "Phase 1: 虚拟文件系统完成"`

***

## Phase 2：AI 配置与对话

> 目标：配置 LLM，打通 AI 对话，对话感知当前文件
> 预计耗时：2-3 小时 | 预计 AI 对话轮数：10-20 轮
> 前置依赖：Phase 1 完成

### 任务 2.1：模型配置表单

**给 AI 的 Prompt：**

```
当用户打开"AI配置/模型配置.json"文件时，中栏不显示 JSON 原文，而是显示一个美观的配置表单。

修改 EditorArea.tsx 的路由逻辑：当文件路径是 "/AI配置/模型配置.json" 时，渲染一个专门的 ModelConfigView 组件。

创建 src/components/editor/ModelConfigView.tsx，内容如下：

【表单设计】
标题："AI 模型配置"，16px 加粗

1. 供应商选择（Select 下拉框）：
   选项列表：
   - DeepSeek（推荐）
   - 火山引擎（豆包）
   - 通义千问
   - 智谱 AI
   - OpenAI（需科学上网）
   - 自定义

   选择供应商后，自动填入对应的 baseURL 和推荐模型名：
   - DeepSeek → baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat"
   - 火山引擎 → baseURL: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-1.5-pro-32k"
   - 通义千问 → baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus"
   - 智谱 AI → baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash"
   - OpenAI → baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini"
   - 自定义 → baseURL: "", model: ""（用户自填）

2. 模型名称（Input 文本框），可手动修改

3. API Base URL（Input 文本框），可手动修改

4. API Key（Input，type=password）
   - 右侧有个眼睛图标切换显示/隐藏
   - 下方小字提示："API Key 仅保存在浏览器本地，不会上传到任何服务器"

5. 存储模式（Radio 单选）：
   - 仅当前会话（关闭标签页后清除）
   - 记住在此浏览器（保存到 localStorage）

6. 底部按钮组：
   - [验证连接] 按钮：发送一条测试消息验证 API 是否可用
   - [保存配置] 按钮

【验证连接的逻辑】
点击验证按钮后：
- 按钮显示 loading 状态
- 发送一条简单请求到 /api/chat 接口（下个任务创建），消息内容："你好，这是一条测试消息，请回复OK"
- 如果成功（返回了 AI 的回复）→ 显示绿色成功提示"连接成功！模型可用"
- 如果失败 → 显示红色错误提示，展示错误信息

【保存逻辑】
- 将配置序列化为 JSON，调用 updateFile 保存到 /AI配置/模型配置.json
- 如果 storageMode 是 "remember-browser"，同时将 apiKey 保存到 localStorage
- 如果 storageMode 是 "session-only"，将 apiKey 保存到 sessionStorage
- 配置保存后，更新 Zustand store 中的 modelConfig 状态

【使用 shadcn/ui 组件】
使用 shadcn 的 Select、Input、Button、RadioGroup、Label 等组件来构建表单。如果这些组件还没安装，请先用 `pnpm dlx shadcn@latest add` 命令安装需要的组件。

请实现这个组件。
```

**验收标准：**

- [ ] 打开模型配置文件时显示表单而非 JSON
- [ ] 选择供应商后自动填充 baseURL 和模型名
- [ ] API Key 支持显示/隐藏切换
- [ ] 保存后刷新页面，配置仍在（JSON 写入了 IndexedDB）

***

### 任务 2.2：创建 LLM API 代理路由

**给 AI 的 Prompt：**

```
创建 src/app/api/chat/route.ts，作为 LLM API 的代理路由：

这个路由接收前端的请求，转发到用户配置的 LLM API，返回流式响应。

【请求格式】
POST /api/chat
Body: {
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
  model: string,
  baseURL: string,
  apiKey: string,
  stream: boolean  // 默认 true
}

【处理逻辑】
1. 从请求 body 中取出参数
2. 构造 OpenAI 兼容格式的请求：
   - URL: ${baseURL}/chat/completions
   - Headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
   - Body: { model, messages, stream: true }
3. 使用 fetch 发送请求到目标 API
4. 如果 stream 为 true：
   - 将上游的 SSE 流直接透传给客户端
   - 使用 ReadableStream 实现流式转发
   - 返回 Response 时设置 headers: { 'Content-Type': 'text/event-stream' }
5. 如果 stream 为 false：
   - 等待完整响应，解析 JSON，返回给客户端

【错误处理】
- 如果上游 API 返回非 200 状态码，读取响应体，返回 { error: true, message: '具体错误信息' }
- 如果 fetch 本身失败（网络错误），返回 { error: true, message: '无法连接到 AI 服务' }
- 所有错误都返回 HTTP 200（前端通过 body 中的 error 字段判断）

请创建这个 API 路由。
```

**验收标准：**

- [ ] `src/app/api/chat/route.ts` 文件存在
- [ ] 能处理 POST 请求
- [ ] 支持流式和非流式两种模式

***

### 任务 2.3：实现 AI 引擎模块

**给 AI 的 Prompt：**

```
创建 src/lib/ai-engine.ts，封装 AI 调用的核心逻辑：

1. 从 Zustand store 或 sessionStorage/localStorage 读取模型配置

2. 实现 sendMessage 函数：
   async function sendMessage(params: {
     messages: Array<{ role: string, content: string }>,
     onChunk?: (text: string) => void,  // 流式回调，每收到一段文本就调用
     onDone?: (fullText: string) => void,  // 完成回调
     onError?: (error: string) => void,
   }): Promise<string>

   - 调用 /api/chat 路由
   - 解析 SSE 流，每解析到一段文本，调用 onChunk
   - 流结束后调用 onDone，返回完整文本
   - 出错时调用 onError

3. SSE 解析逻辑：
   - 读取 response.body 的 ReadableStream
   - 用 TextDecoder 解码
   - 按行分割，每行格式为 "data: {...}"
   - 解析 JSON，提取 choices[0].delta.content
   - 遇到 "data: [DONE]" 表示流结束

4. 实现 getModelConfig 函数：
   - 优先从 sessionStorage 读取 apiKey
   - 其次从 localStorage
   - 其他配置从 IndexedDB 的 /AI配置/模型配置.json 读取
   - 返回 { provider, model, baseURL, apiKey }

请创建这个文件。
```

**验收标准：**

- [ ] `src/lib/ai-engine.ts` 文件存在
- [ ] 导出 sendMessage 和 getModelConfig 函数
- [ ] sendMessage 支持流式回调

***

### 任务 2.4：右栏 AI 对话功能

**给 AI 的 Prompt：**

```
实现右栏的完整 AI 对话功能：

1. 修改 src/store/app-store.ts，增加对话相关状态：
   - chatMessages: Array<{ id: string, role: 'user' | 'assistant', content: string, timestamp: string }>
   - isChatLoading: boolean（AI 正在回复时为 true）
   - addChatMessage(message): void
   - clearChat(): void

2. 创建 src/components/chat/ChatPanel.tsx
   - 消息列表区域：
     - 用户消息右对齐，浅蓝色气泡
     - AI 消息左对齐，浅灰色气泡
     - AI 消息的内容使用 react-markdown 渲染（安装 react-markdown 和 remark-gfm）
     - AI 正在回复时，消息末尾显示闪烁的光标动画
   - 新消息时自动滚动到底部

3. 创建 src/components/chat/ChatInput.tsx
   - 文本输入框（textarea，支持多行，按 Enter 发送，Shift+Enter 换行）
   - 发送按钮（SendHorizonal 图标）
   - 发送时禁用输入框和按钮，显示 loading
   - AI 回复完成后恢复输入

4. 发送消息的完整流程：
   a. 用户输入消息，点发送
   b. 将用户消息添加到 chatMessages
   c. 组装上下文：
      - system 消息 = 读取 /AI配置/_system.prompt.md 的内容
      - 如果当前有打开的文件（currentFilePath 不为 null）：
        添加一条 user 消息："[当前打开的文件: {文件路径}]\n\n{文件内容}"
      - 加上所有历史 chatMessages
      - 最后加上用户刚输入的消息
   d. 调用 ai-engine 的 sendMessage
   e. 流式回调：实时更新最后一条 assistant 消息的 content
   f. 完成后更新 isChatLoading 为 false

5. 安装需要的依赖：pnpm add react-markdown remark-gfm

6. 在对话区域顶部显示一个「上下文指示器」：
   - 如果当前打开了文件，显示一个小标签："📄 {文件名}"
   - 如果没打开文件，显示"无上下文"
   - 这让用户知道 AI 当前能"看到"什么文件

请实现以上所有组件和逻辑。
```

**验收标准：**

- [ ] 配置好 API Key 后，能在右栏和 AI 对话
- [ ] AI 回复是流式显示的（逐字出现）
- [ ] AI 回复中的 Markdown 格式正确渲染（标题、列表、代码块）
- [ ] 打开一个 .prompt.md 文件后和 AI 对话，AI 知道文件内容
- [ ] 没打开文件时和 AI 对话，AI 作为通用助手回复
- [ ] 顶部上下文指示器正确显示当前文件名

***

### 任务 2.5：连接验证功能

**给 AI 的 Prompt：**

```
回到 ModelConfigView 组件，完善验证连接按钮的逻辑：

1. 点击 [验证连接] 后：
   - 使用当前表单中填写的配置（不需要先保存）
   - 发送请求到 /api/chat，messages 只包含一条：{ role: 'user', content: '请回复：连接成功' }
   - stream 设为 false（验证不需要流式）

2. 验证结果显示：
   - 成功：绿色对勾图标 + "连接成功！模型：{模型名}" + AI 返回的内容
   - 失败：红色叉号图标 + 具体错误信息
   - 验证过程中按钮显示 Spinner

3. 保存成功后，自动在右栏对话框显示一条系统消息："AI 配置已更新，当前使用 {供应商} - {模型名}"

请修改 ModelConfigView 组件。
```

**验收标准：**

- [ ] 填入正确的 API Key 后，验证显示成功
- [ ] 填入错误的 API Key 后，验证显示失败
- [ ] 保存后右栏出现配置更新提示

***

### Phase 2 整体验收

- [ ] 模型配置表单完整可用
- [ ] 验证连接功能正常
- [ ] 右栏 AI 对话可正常收发消息
- [ ] AI 回复流式渲染
- [ ] 打开 .prompt.md 文件后 AI 能感知文件内容
- [ ] **Git 提交：** `git add . && git commit -m "Phase 2: AI配置与对话完成"`

***

## Phase 3：简历模块

> 目标：创建、编辑、AI 润色简历，导出 PDF
> 预计耗时：3-5 小时 | 预计 AI 对话轮数：20-40 轮
> 前置依赖：Phase 2 完成

### 任务 3.1：简历编辑表单

**给 AI 的 Prompt：**

```
当用户打开 "/简历/主简历.json" 时，中栏显示一个结构化的简历编辑表单（不是 JSON 编辑器）。

创建 src/components/editor/ResumeFormView.tsx

修改 EditorArea.tsx：当文件路径是 "/简历/主简历.json" 或匹配 "/简历/定制简历/*.json" 时，渲染 ResumeFormView。

首先，如果 /简历/主简历.json 不存在，需要在初始化时创建它（修改 init-workspace.ts），内容为一个空的简历 JSON 结构。

简历 JSON 结构：
{
  "id": "main-resume",
  "profile": { "name": "", "phone": "", "email": "", "wechat": "", "targetPosition": "" },
  "education": [],
  "internships": [],
  "campusExperience": [],
  "projects": [],
  "skills": { "professional": [], "languages": [], "certificates": [], "tools": [] }
}

【表单设计 - 分区折叠面板】
使用 shadcn/ui 的 Accordion 组件，分为以下几个区：

区1：基本信息
  - 姓名（Input）
  - 手机（Input）
  - 邮箱（Input）
  - 微信（Input，可选）
  - 目标岗位（Input，可选）

区2：教育经历（可动态添加/删除多条）
每条包含：
  - 学校（Input）
  - 学历：本科/硕士/博士（Select）
  - 专业（Input）
  - 起止时间（两个 Input，格式 YYYY.MM）
  - GPA（Input，可选）
  每条右上角有删除按钮（Trash2 图标）
  底部有 [+ 添加教育经历] 按钮

区3：实习经历（可动态添加/删除多条）
每条包含：
  - 公司（Input）
  - 岗位（Input）
  - 起止时间
  - 工作描述（多行，每行是一条描述，使用 textarea）
    - 每条描述旁边有一个 [AI润色] 小按钮（Sparkles 图标，16px）
  每条右上角有删除按钮
  底部有 [+ 添加实习经历] 按钮

区4：校园经历（结构同实习经历）
  - 组织名称、角色、起止时间、描述

区5：项目经历（可选区域）
  - 项目名、角色、描述、技术栈（标签式输入）

区6：技能
  - 专业技能（标签式输入，回车添加，点击删除）
  - 语言能力（标签式输入）
  - 证书（标签式输入）
  - 工具（标签式输入）

【标签式输入组件】
如果 shadcn 没有现成的 TagInput，请自行实现一个简单的：
- 输入框 + 已有标签列表
- 输入文字后按 Enter 添加标签
- 点击标签的 × 删除

【保存逻辑】
- 表单任何字段变化时，启动 3 秒防抖自动保存
- 保存时将整个表单数据序列化为 JSON，调用 updateFile 写入 IndexedDB
- 工具栏显示"已保存"提示

【加载逻辑】
- 组件挂载时，从 IndexedDB 读取 /简历/主简历.json 的 content
- 解析 JSON 填充到表单各字段
- 如果 JSON 为空或解析失败，使用默认空值

表单整体使用卡片式布局，每个区一个卡片，内部间距舒适。使用 shadcn 的 Accordion、Input、Select、Button、Label 组件。如需安装新的 shadcn 组件，请先安装。

请实现这个组件。
```

**验收标准：**

- [ ] 打开主简历.json 显示表单而非 JSON
- [ ] 各区可以折叠/展开
- [ ] 教育经历、实习经历等可以动态添加/删除
- [ ] 技能区的标签输入可以添加/删除标签
- [ ] 填写内容后自动保存，刷新页面内容保留
- [ ] 实习经历的每条描述旁有 AI 润色按钮（暂不实现功能）

***

### 任务 3.2：AI 润色功能

**给 AI 的 Prompt：**

```
实现简历中「AI润色」按钮的功能：

1. 在实习经历/校园经历/项目经历的每条描述旁边，有一个 AI 润色小按钮（Sparkles 图标）

2. 点击润色按钮后的流程：
   a. 按钮变为 loading 状态（旋转动画）
   b. 从 IndexedDB 读取 /简历/_resume.prompt.md 的内容作为 system prompt
   c. 读取 /AI配置/_system.prompt.md 作为全局 prompt
   d. 构造消息：
      system: 全局prompt + "\n\n" + resume.prompt
      user: "请用STAR法则润色以下经历描述，直接返回润色后的文本，不要返回其他内容：\n\n" + 当前描述文本
   e. 调用 AI（非流式，等完整结果）
   f. AI 返回结果后，弹出一个小的确认面板：
      - 显示原文（灰色）
      - 显示 AI 润色后的文本（黑色）
      - 两个按钮：[采纳] [放弃]
   g. 点击 [采纳]：替换原描述文本，触发表单保存
   h. 点击 [放弃]：关闭面板，不修改

3. 确认面板样式：
   - 使用 shadcn 的 Dialog 或 Popover
   - 原文和润色文本上下对比
   - 润色文本区域有浅绿色背景表示是新内容

请在 ResumeFormView 组件中实现这个功能。
```

**验收标准：**

- [ ] 点击润色按钮后 AI 返回润色结果
- [ ] 弹出对比面板，显示原文和润色后文本
- [ ] 点击采纳后描述被替换并保存
- [ ] 点击放弃后不修改

***

### 任务 3.3：简历 PDF 导出

**给 AI 的 Prompt：**

```
实现简历 PDF 导出功能：

1. 安装：pnpm add @react-pdf/renderer

2. 创建 src/lib/resume-pdf.ts，定义简历 PDF 模板：

使用 @react-pdf/renderer 的组件（Document, Page, View, Text, StyleSheet）创建一个中文简历 PDF 模板。

【PDF 布局 - A4 纸】
- 页面尺寸 A4，上下左右边距 40px
- 字体：使用系统自带的中文字体（注册 "https://cdn.jsdelivr.net/gh/AcademicFuture/fonts@main/SourceHanSansCN-Regular.otf" 或备选方案）
  - 如果中文字体注册太复杂，可以先用英文字体让结构跑通，中文字体留到 Phase 8 优化
- 配色：纯黑白，少量灰色分隔线

【简历结构】
顶部：姓名（居中，18px加粗）
下方一行：手机 | 邮箱 | 微信（居中，10px，用 | 分隔）

分隔线

教育经历区（如果有）：
  区标题：左侧 "教育经历"（12px加粗），右侧无
  每条：左侧"学校 · 学历 · 专业"，右侧"起止时间"，GPA如果有则单独一行

分隔线

实习经历区（如果有）：
  区标题："实习经历"
  每条：第一行"公司 · 岗位"在左，"起止时间"在右
  下方每条描述前有一个小圆点 ·

校园经历区（结构同实习）

项目经历区（如果有）

技能区：
  "技能"标题
  专业技能：列出所有标签，用 / 分隔
  其他技能同理

3. 导出函数：
export async function generateResumePDF(resumeData: ResumeData): Promise<Blob>
  - 接收简历数据
  - 使用 @react-pdf/renderer 的 pdf() 函数生成 PDF Blob
  - 返回 Blob

4. 在简历编辑表单的工具栏添加 [导出 PDF] 按钮（Download 图标）
   - 点击后调用 generateResumePDF
   - 将 Blob 转为下载链接触发下载
   - 文件名："简历-{姓名}-{日期}.pdf"

请实现以上内容。如果中文字体注册有问题，先用默认字体让功能跑通，我后续再优化字体。
```

**验收标准：**

- [ ] 工具栏有导出 PDF 按钮
- [ ] 点击后下载一个 PDF 文件
- [ ] PDF 中包含填写的简历内容
- [ ] PDF 布局合理（即使中文可能显示有问题，结构要正确）

***

### Phase 3 整体验收

- [ ] 简历编辑表单完整可用
- [ ] AI 润色功能正常
- [ ] PDF 导出可用
- [ ] **Git 提交：** `git add . && git commit -m "Phase 3: 简历模块完成"`

***

## Phase 4：岗位管理

> 目标：添加 JD，生成匹配分析和求职文书
> 预计耗时：3-5 小时 | 预计 AI 对话轮数：20-40 轮
> 前置依赖：Phase 3 完成

### 任务 4.1：新建岗位功能

**给 AI 的 Prompt：**

```
实现右键「岗位」文件夹 → 新建岗位的功能：

1. 修改 FileTreeNode.tsx，给文件夹节点添加右键菜单：
   - 只有特定文件夹才显示右键菜单：
     - 「岗位」文件夹 → 菜单项 [新建岗位]
     - 「面试复盘」文件夹 → 菜单项 [新建面试记录]（Phase 6 实现，现在先加上菜单项但不实现功能）
   - 使用 shadcn 的 ContextMenu 组件（如果没有就用 DropdownMenu 配合右键事件）

2. 点击 [新建岗位] 后弹出 Dialog：
   - 标题："添加目标岗位"
   - 表单字段：
     a. 公司名称（Input，必填）
     b. 岗位名称（Input，必填）
     c. 绑定简历（Select 下拉框）：
        - 选项从 IndexedDB 读取：列出 /简历/主简历.json 和 /简历/定制简历/ 下所有 .json 文件
        - 默认选中 "主简历"
   - 按钮：[取消] [确认创建]

3. 点击确认后的逻辑：
   a. 在 IndexedDB 中创建子文件夹：/岗位/{公司名}-{岗位名}/
   b. 创建 jd.md 文件（空内容，路径：/岗位/{公司名}-{岗位名}/jd.md）
   c. 创建 meta.json 文件，内容：
      {
        "id": "uuid",
        "company": "公司名",
        "position": "岗位名",
        "resumeId": "选中的简历ID",
        "status": "saved",
        "createdAt": "ISO时间"
      }
   d. 刷新文件树
   e. 自动打开 jd.md 文件（设置 currentFilePath）
   f. 关闭弹窗

请实现以上功能。
```

**验收标准：**

- [ ] 右键岗位文件夹出现菜单
- [ ] 弹窗表单完整
- [ ] 创建后文件树出现新子文件夹
- [ ] 自动打开 jd.md 等待粘贴

***

### 任务 4.2：岗位工具栏与上下文感知

**给 AI 的 Prompt：**

```
实现岗位相关文件的上下文感知工具栏：

1. 创建 src/components/editor/Toolbar.tsx（如果还没有的话）作为中栏的通用工具栏

2. 工具栏的显示逻辑：
   - 根据当前打开文件所在的文件夹，动态显示不同的操作按钮
   - 判断规则：检查 currentFilePath 是否以某个根文件夹开头

3. 当打开的文件在 /岗位/{某岗位}/ 下时，工具栏显示以下按钮：
   - [生成匹配分析] （BarChart3 图标）
   - [生成BOSS招呼语] （MessageSquare 图标）
   - [生成求职邮件] （Mail 图标）
   - [生成定制简历] （FileEdit 图标）
   - [生成面试准备包] （BookOpen 图标）
   - 按钮之间用分隔符隔开
   - 每个按钮鼠标悬停时显示 tooltip 说明

4. 当打开的文件在 /简历/ 下时，工具栏显示：
   - [导出PDF] （Download 图标）
   - [AI润色] （Sparkles 图标）- 仅当文件是 .json 简历时

5. 当打开的文件在 /面试复盘/{某记录}/ 下时：
   - [生成复盘报告] （FileCheck 图标）- 仅当面试原文.md有内容时

6. 工具栏最右侧始终显示：
   - 文件路径（面包屑格式，如 "岗位 / 字节跳动-产品实习 / jd.md"）
   - "已保存" / "保存中..." 状态指示

所有按钮暂时只打印 console.log，具体 AI 生成逻辑在下个任务实现。

请实现这个工具栏组件并集成到 EditorArea 中。
```

**验收标准：**

- [ ] 打开岗位子文件夹的文件时，工具栏显示岗位相关按钮
- [ ] 打开简历文件时，工具栏显示简历相关按钮
- [ ] 按钮有 tooltip
- [ ] 文件路径以面包屑形式显示

***

### 任务 4.3：上下文组装引擎

**给 AI 的 Prompt：**

```
创建 src/lib/context-builder.ts，封装不同场景下 AI 上下文的组装逻辑：

这是整个产品最核心的模块之一——根据用户当前操作的场景，自动从 IndexedDB 读取相关文件内容，组装成发送给 AI 的 messages 数组。

export type GenerationMode =
  | 'match-analysis'     // 匹配度分析
  | 'boss-greeting'      // BOSS招呼语
  | 'cover-email'        // 求职邮件
  | 'tailored-resume'    // 定制简历
  | 'prep-pack'          // 面试准备包
  | 'interview-review'   // 面试复盘
  | 'chat';              // 自由对话

export async function buildContext(params: {
  mode: GenerationMode;
  jobFolderPath?: string;     // 当前岗位文件夹路径，如 "/岗位/字节跳动-产品实习"
  interviewFolderPath?: string; // 当前面试记录文件夹路径
  currentFilePath?: string;    // 当前打开的文件路径
  userMessage?: string;        // 用户输入的消息（chat 模式）
}): Promise<Array<{ role: string; content: string }>> {

  const messages: Array<{ role: string; content: string }> = [];

  // 1. 始终读取全局 system prompt
  const systemPrompt = await readFile('/AI配置/_system.prompt.md');

  // 2. 根据 mode 读取对应的模块 prompt 和 skill
  let modulePrompt = '';
  let moduleSkill = '';

  switch(mode) {
    case 'match-analysis':
    case 'boss-greeting':
    case 'cover-email':
      modulePrompt = await readFile('/岗位/_job.prompt.md');
      moduleSkill = await readFile('/岗位/_job.skill.md');
      break;
    case 'tailored-resume':
      modulePrompt = await readFile('/简历/_resume.prompt.md');
      moduleSkill = await readFile('/简历/_resume.skill.md');
      break;
    case 'prep-pack':
      modulePrompt = await readFile('/面试准备包/_prep.prompt.md');
      moduleSkill = await readFile('/面试准备包/_prep.skill.md');
      break;
    case 'interview-review':
      modulePrompt = await readFile('/面试复盘/_review.prompt.md');
      moduleSkill = await readFile('/面试复盘/_review.skill.md');
      break;
    case 'chat':
      // chat 模式不加载特定模块 prompt
      break;
  }

  // 组装 system 消息
  messages.push({
    role: 'system',
    content: [systemPrompt?.content, modulePrompt?.content, moduleSkill?.content].filter(Boolean).join('\n\n---\n\n')
  });

  // 3. 根据 mode 注入必要的上下文文件
  if (jobFolderPath) {
    const jd = await readFile(`${jobFolderPath}/jd.md`);
    const meta = await readFile(`${jobFolderPath}/meta.json`);
    if (jd) messages.push({ role: 'user', content: `[岗位JD]\n${jd.content}` });

    // 从 meta 中获取绑定的简历ID，读取简历内容
    if (meta) {
      const metaObj = JSON.parse(meta.content);
      const resume = await readFile('/简历/主简历.json');
      if (resume) messages.push({ role: 'user', content: `[用户简历]\n${resume.content}` });
    }
  }

  // prep-pack 模式额外注入记忆摘要
  if (mode === 'prep-pack') {
    const memory = await readFile('/AI配置/记忆摘要.md');
    if (memory && memory.content.trim() !== '# 记忆摘要\n\n> 此文件由系统自动维护，记录你的求职经历要点。\n\n暂无记录。') {
      messages.push({ role: 'user', content: `[历史面试复盘要点]\n${memory.content}` });
    }
  }

  // interview-review 模式额外注入面试原文和准备包
  if (mode === 'interview-review' && interviewFolderPath) {
    const transcript = await readFile(`${interviewFolderPath}/面试原文.md`);
    if (transcript) messages.push({ role: 'user', content: `[面试原文]\n${transcript.content}` });

    // 尝试读取对应的准备包
    // 从 interviewFolderPath 提取岗位名，去面试准备包中找
    // ...（需要从 meta.json 获取 jobId 来匹配）
  }

  // 4. 根据 mode 添加最终的用户指令
  switch(mode) {
    case 'match-analysis':
      messages.push({ role: 'user', content: '请根据以上JD和简历，生成详细的匹配度分析报告。' });
      break;
    case 'boss-greeting':
      messages.push({ role: 'user', content: '请根据以上JD和简历，生成一段BOSS直聘招呼语（80-120字）。' });
      break;
    case 'cover-email':
      messages.push({ role: 'user', content: '请根据以上JD和简历，生成一封求职邮件（300-500字）。' });
      break;
    case 'tailored-resume':
      messages.push({ role: 'user', content: '请根据以上JD和简历，生成定制简历。筛选最匹配的经历，调整措辞贴合JD。输出完整的JSON格式，与输入的简历结构一致。' });
      break;
    case 'prep-pack':
      messages.push({ role: 'user', content: '请根据以上所有信息，生成完整的面试准备包。严格按照prompt中定义的结构输出。' });
      break;
    case 'interview-review':
      messages.push({ role: 'user', content: '请根据以上面试原文、JD和简历，生成详细的面试复盘报告。严格按照prompt中定义的结构输出。' });
      break;
    case 'chat':
      if (currentFilePath) {
        const currentFile = await readFile(currentFilePath);
        if (currentFile) messages.push({ role: 'user', content: `[当前查看的文件: ${currentFilePath}]\n${currentFile.content}` });
      }
      const memory = await readFile('/AI配置/记忆摘要.md');
      if (memory) messages.push({ role: 'user', content: `[用户画像/记忆摘要]\n${memory.content}` });
      if (userMessage) messages.push({ role: 'user', content: userMessage });
      break;
  }

  return messages;
}

请根据上述伪代码实现完整的 context-builder.ts，补全所有细节和错误处理。其中 readFile 返回 undefined 时要安全处理。
```

**验收标准：**

- [ ] `src/lib/context-builder.ts` 文件存在
- [ ] 导出 buildContext 函数和 GenerationMode 类型
- [ ] 每种 mode 都能正确组装对应的上下文

***

### 任务 4.4：工具栏按钮功能实现

**给 AI 的 Prompt：**

```
实现岗位工具栏中所有生成按钮的功能逻辑：

创建 src/lib/generation-actions.ts，为每个生成操作封装一个函数：

1. generateMatchAnalysis(jobFolderPath: string)
   - 调用 buildContext({ mode: 'match-analysis', jobFolderPath })
   - 调用 sendMessage 获取 AI 生成结果
   - 将结果写入 {jobFolderPath}/匹配度分析.md（如果文件不存在先创建）
   - 刷新文件树
   - 自动打开新生成的文件

2. generateBossGreeting(jobFolderPath: string)
   - 同理，写入 {jobFolderPath}/BOSS招呼语.md

3. generateCoverEmail(jobFolderPath: string)
   - 同理，写入 {jobFolderPath}/求职邮件.md

4. generateTailoredResume(jobFolderPath: string)
   - 调用 buildContext({ mode: 'tailored-resume', jobFolderPath })
   - AI 返回 JSON 格式的定制简历
   - 从 meta.json 读取公司和岗位名
   - 写入 /简历/定制简历/{公司名}-{岗位名}.json
   - 刷新文件树

所有函数的通用逻辑：
- 开始时在工具栏对应按钮显示 loading（Spinner）
- 生成过程中按钮不可点击
- 生成完成后恢复按钮状态
- 如果已有同名文件，覆盖内容（更新而非创建）
- 出错时显示 toast 提示（可以用简单的 alert 或 shadcn 的 toast）

然后修改 Toolbar.tsx，将按钮的 onClick 连接到对应的函数。需要从当前打开的文件路径推断 jobFolderPath（取文件路径的父文件夹路径）。

请实现以上所有内容。
```

**验收标准：**

- [ ] 粘贴 JD 后点击生成匹配分析 → 生成结果并自动显示
- [ ] 点击生成BOSS招呼语 → 生成结果
- [ ] 点击生成求职邮件 → 生成结果
- [ ] 点击生成定制简历 → 在简历/定制简历/下生成 JSON
- [ ] 文件树实时刷新显示新文件

***

### Phase 4 整体验收

- [ ] 能右键新建岗位，填入公司+岗位+绑定简历
- [ ] 粘贴 JD 后所有生成按钮可用
- [ ] 生成的文件出现在正确的位置
- [ ] **Git 提交：** `git add . && git commit -m "Phase 4: 岗位管理完成"`

***

## Phase 5：面试准备包

> 目标：一键生成个性化面试准备包
> 预计耗时：1-2 小时 | 预计 AI 对话轮数：5-15 轮
> 前置依赖：Phase 4 完成

### 任务 5.1：生成面试准备包

**给 AI 的 Prompt：**

```
实现「生成面试准备包」按钮的完整功能：

在 src/lib/generation-actions.ts 中添加 generatePrepPack 函数：

async function generatePrepPack(jobFolderPath: string): Promise<void>

逻辑：
1. 从 jobFolderPath 的 meta.json 读取公司名和岗位名
2. 调用 buildContext({ mode: 'prep-pack', jobFolderPath })
3. 调用 sendMessage，使用流式回调
4. 生成完成后：
   a. 构造准备包文件夹路径：/面试准备包/{公司名}-{岗位名}/
   b. 如果文件夹不存在，创建它
   c. 创建 meta.json，内容包含 jobId（从岗位meta中读取）、resumeId、生成时间
   d. 创建/更新 准备包.md，内容为 AI 生成的完整准备包
   e. 再发一次 AI 请求：给AI准备包内容，让它提取知识点清单，写入 知识清单.md
      prompt: "请从以下面试准备包中提取需要复习的知识点，以清单形式列出，每个知识点一行：\n\n{准备包内容}"
   f. 刷新文件树
   g. 自动打开 准备包.md

5. 生成过程中，在中栏显示进度：
   - "正在生成准备包..." + 流式显示正在生成的内容
   - 完成后切换到正常的 Markdown 查看模式

修改 Toolbar.tsx，连接 [生成面试准备包] 按钮到这个函数。

请实现以上功能。
```

**验收标准：**

- [ ] 点击按钮后 AI 生成准备包
- [ ] 面试准备包文件夹下出现 准备包.md + 知识清单.md + meta.json
- [ ] 准备包内容结构完整（匹配度速览+面试题+简历追问+知识薄弱点）
- [ ] 文件树刷新显示新内容

***

### Phase 5 整体验收

- [ ] 准备包完整生成
- [ ] 知识清单单独提取
- [ ] **Git 提交：** `git add . && git commit -m "Phase 5: 面试准备包完成"`

***

## Phase 6：面试复盘

> 目标：创建面试记录 → 粘贴面试文本 → AI 生成复盘 → 自动沉淀到记忆
> 预计耗时：2-3 小时 | 预计 AI 对话轮数：10-25 轮
> 前置依赖：Phase 5 完成

### 任务 6.1：新建面试记录

**给 AI 的 Prompt：**

```
实现右键「面试复盘」文件夹 → 新建面试记录的功能：

1. 在 FileTreeNode 的右键菜单中，已经为「面试复盘」文件夹预留了菜单项，现在实现它。

2. 点击 [新建面试记录] 后弹出 Dialog：
   - 标题："创建面试记录"
   - 表单字段：
     a. 关联岗位（Select 下拉框）：
        - 从 IndexedDB 读取 /岗位/ 下所有子文件夹
        - 显示格式："{公司名}-{岗位名}"
     b. 面试轮次（Input，如"一面"、"二面"、"HR面"）
   - 按钮：[取消] [确认创建]

3. 点击确认后：
   a. 从选中的岗位文件夹读取 meta.json 获取 jobId
   b. 构造文件夹名：{公司名}-{岗位名}-{轮次}
   c. 创建子文件夹：/面试复盘/{文件夹名}/
   d. 创建 meta.json：{ jobId, round: 轮次, date: 当前日期, createdAt: ISO时间 }
   e. 创建 面试原文.md：内容为空模板
      "# 面试原文\n\n> 请将面试听写文本粘贴到下方\n\n"
   f. 刷新文件树
   g. 自动打开 面试原文.md

请实现以上功能。
```

**验收标准：**

- [ ] 右键面试复盘文件夹出现菜单
- [ ] 弹窗中能选择已有岗位
- [ ] 创建后文件树出现新子文件夹
- [ ] 自动打开面试原文.md 等待粘贴

***

### 任务 6.2：生成复盘报告 + 记忆沉淀

**给 AI 的 Prompt：**

```
实现「生成复盘报告」按钮的完整功能，包括自动记忆沉淀：

1. 在 generation-actions.ts 中添加 generateInterviewReview 函数：

async function generateInterviewReview(interviewFolderPath: string): Promise<void>

逻辑：
a. 读取当前面试文件夹的 meta.json，获取 jobId
b. 根据 jobId 找到对应的岗位文件夹路径
c. 调用 buildContext({
     mode: 'interview-review',
     jobFolderPath: 对应岗位路径,
     interviewFolderPath
   })
d. 调用 sendMessage 生成复盘报告
e. 将结果写入 {interviewFolderPath}/复盘报告.md
f. 刷新文件树，自动打开复盘报告

2. 【关键】记忆沉淀逻辑（在复盘报告生成完成后自动执行）：
a. 再发一次 AI 请求：
   system: "你是一个信息提取助手，请从面试复盘报告中提取关键信息。"
   user: "请从以下面试复盘报告中提取：1.最重要的3-5个行动项 2.暴露的知识盲区 3.关键教训。以简洁的Markdown列表形式输出，每项不超过一行。\n\n" + 复盘报告内容

b. 读取现有的 /AI配置/记忆摘要.md
c. 在末尾追加：
   \n\n---\n\n## {日期} - {公司名}-{岗位名} {轮次}\n\n{AI提取的要点}
d. 保存更新后的记忆摘要
e. 在右栏对话中显示一条系统消息："复盘要点已沉淀到记忆摘要，将在下次面试准备中参考。"

3. 修改 Toolbar.tsx 的显示逻辑：
   - 当在面试复盘子文件夹中时，检查 面试原文.md 是否有实质内容（不只是模板）
   - 如果有内容 → 显示 [生成复盘报告] 按钮
   - 如果已有复盘报告 → 按钮文字改为 [重新生成复盘报告]

请实现以上所有功能。
```

**验收标准：**

- [ ] 粘贴面试文本后点击生成 → 生成复盘报告
- [ ] 复盘报告结构完整（整体评估+逐题分析+知识盲区+行动项）
- [ ] 记忆摘要.md 自动更新，新增了本次复盘的要点
- [ ] 打开记忆摘要.md 能看到新追加的内容
- [ ] 之后为新岗位生成准备包时，AI 能引用记忆中的历史教训

***

### Phase 6 整体验收

- [ ] 面试复盘完整链路跑通
- [ ] 记忆沉淀机制生效
- [ ] **Git 提交：** `git add . && git commit -m "Phase 6: 面试复盘完成"`

***

## Phase 7：AI 对话增强

> 目标：@ 引用文件、上下文可视化、对话持久化
> 预计耗时：1-2 小时 | 预计 AI 对话轮数：10-20 轮
> 前置依赖：Phase 6 完成

### 任务 7.1：@ 引用文件

**给 AI 的 Prompt：**

```
增强 AI 对话输入框，支持 @ 引用文件功能：

1. 修改 ChatInput.tsx：
   - 用户在输入框中输入 @ 字符时，弹出一个文件搜索浮层
   - 浮层显示在输入框上方
   - 浮层中有一个搜索框，实时过滤 IndexedDB 中的所有文件
   - 显示匹配的文件列表（最多10个），格式："📄 文件名 (路径)"
   - 点击文件后：
     a. 在输入框中将 @... 替换为 @文件名 标签（视觉上是一个蓝色胶囊标签）
     b. 将该文件的路径记录到一个 referencedFiles 数组中
   - 支持引用多个文件

2. 修改发送逻辑：
   - 发送消息时，除了用户输入的文本外，还要注入所有 @引用的文件内容
   - 注入格式：在 messages 中添加 { role: 'user', content: '[引用文件: {路径}]\n{文件内容}' }
   - 注入的文件消息在 UI 上不显示，仅发送给 AI

3. 上下文指示器优化（ChatPanel 顶部）：
   - 显示所有当前上下文文件的标签列表
   - 自动上下文（当前打开的文件）：灰色标签，标注"自动"
   - @ 引用的文件：蓝色标签，点击 × 可移除
   - 格式：📄 文件名 × 

请实现以上功能。
```

**验收标准：**

- [ ] 输入 @ 后弹出文件搜索浮层
- [ ] 搜索和选择文件正常
- [ ] 发送后 AI 能看到引用的文件内容
- [ ] 上下文指示器正确显示所有上下文文件

***

### 任务 7.2：对话持久化与多线程

**给 AI 的 Prompt：**

```
实现对话消息持久化和多线程功能：

1. 在 Dexie 数据库中新增两个表：

chat_threads 表：
{
  id: string,
  title: string,       // 对话标题（取第一条消息的前20个字）
  createdAt: string,
  updatedAt: string
}

chat_messages 表：
{
  id: string,
  threadId: string,     // 关联的线程ID
  role: 'user' | 'assistant' | 'system',
  content: string,
  timestamp: string
}

索引：chat_messages 的 threadId 为普通索引

2. 修改 app-store.ts：
   - 新增：currentThreadId, threads 列表
   - 新建对话线程：创建 thread 记录，设为当前
   - 发送消息时保存到 chat_messages 表
   - AI 回复时保存到 chat_messages 表
   - 切换线程时从 IndexedDB 加载对应的消息

3. 修改 ChatPanel：
   - 顶部增加一行：[+ 新对话] 按钮 + 线程切换下拉
   - 下拉选项显示历史对话列表（按时间倒序）
   - 选择后加载该线程的消息

请实现以上功能。注意 Dexie 版本号需要升级（如果之前是 version 1，改为 version 2）。
```

**验收标准：**

- [ ] 对话消息刷新后仍在
- [ ] 能创建新对话
- [ ] 能切换历史对话

***

### Phase 7 整体验收

- [ ] @ 引用功能完整可用
- [ ] 对话持久化和多线程可用
- [ ] **Git 提交：** `git add . && git commit -m "Phase 7: AI对话增强完成"`

***

## Phase 8：体验打磨

> 目标：视觉美化、状态管理、数据导入导出、暗色模式
> 预计耗时：2-4 小时 | 预计 AI 对话轮数：15-30 轮
> 前置依赖：Phase 7 完成

### 任务 8.1：文件树图标美化

**给 AI 的 Prompt：**

```
美化文件树的图标和视觉表现：

1. 文件图标规则（使用 lucide-react 图标）：
   - 文件夹：FolderOpen（展开时）/ Folder（折叠时），颜色 #F59E0B（琥珀色）
   - .md 文件：FileText 图标，颜色默认
   - .json 文件：FileJson2 图标，颜色 #10B981（绿色）
   - .pdf 文件：FileType 图标，颜色 #EF4444（红色）
   - 系统文件（_ 开头）：图标颜色改为 #9CA3AF（灰色），文件名也是灰色，字号稍小（12px）
   - AI 生成的文件（isGenerated = true）：文件名旁边显示一个小的 Sparkles 图标（12px，蓝色），表示这是 AI 生成的

2. 岗位状态指示器：
   - 在岗位子文件夹名称旁显示一个小圆点
   - 颜色对应 meta.json 中的 status：
     saved: 灰色
     preparing: 黄色
     applied: 蓝色
     interviewing: 紫色
     offered: 绿色
     rejected: 红色
   - 右键岗位子文件夹时，菜单中增加 [更改状态 →] 子菜单，可切换状态

3. 文件树底部：
   - 显示统计信息："X 个岗位 · Y 份简历 · Z 次面试"
   - 字号 11px，灰色

请修改 FileTree 和 FileTreeNode 组件。
```

**验收标准：**

- [ ] 不同文件类型图标和颜色不同
- [ ] 系统文件视觉弱化
- [ ] AI 生成文件有 Sparkles 标记
- [ ] 岗位状态圆点正确显示

***

### 任务 8.2：空状态引导

**给 AI 的 Prompt：**

```
为各个空文件夹添加引导界面：

1. 当用户打开一个空文件夹（没有子文件且非根文件夹）或点击根文件夹时，中栏显示引导内容而非空白。

2. 为每个根文件夹设计不同的引导内容：

简历（文件夹内没有 主简历.json 以外的用户文件时）：
  - 图标：FileText（48px，灰色）
  - 标题："创建你的第一份简历"
  - 描述："填写基本信息、教育经历、实习经历等，AI 会帮你用 STAR 法则优化"
  - 按钮：[开始填写简历] → 点击后打开 /简历/主简历.json

岗位（没有子文件夹时）：
  - 图标：Briefcase
  - 标题："添加目标岗位"
  - 描述："粘贴岗位 JD，AI 会帮你生成匹配分析、BOSS招呼语、求职邮件和面试准备包"
  - 按钮：[添加第一个岗位] → 触发新建岗位弹窗

面试准备包（没有子文件夹时）：
  - 图标：BookOpen
  - 标题："准备包将在这里生成"
  - 描述："在岗位页面点击「生成面试准备包」后，准备包会出现在这里"
  - 无按钮（引导用户去岗位页操作）

面试复盘（没有子文件夹时）：
  - 图标：MessageSquareQuote
  - 标题："记录你的面试经历"
  - 描述："面试结束后，粘贴听写文本，AI 会帮你生成结构化复盘报告"
  - 按钮：[创建面试记录] → 触发新建面试记录弹窗

AI配置：
  - 打开此文件夹时自动打开 模型配置.json（已有此逻辑则跳过）

请创建 src/components/editor/EmptyState.tsx 组件，并在 EditorArea 中集成。
```

**验收标准：**

- [ ] 点击空的根文件夹时显示引导内容
- [ ] 引导按钮功能正确

***

### 任务 8.3：数据导入导出

**给 AI 的 Prompt：**

```
实现全站数据的导出和导入功能：

1. 在 AI配置 文件夹的右键菜单中添加两个选项：
   - [导出所有数据]
   - [导入数据]

   或者也可以在文件树底部添加一个设置图标，点击弹出设置菜单，包含这两个选项。

2. 导出逻辑：
   - 读取 IndexedDB 中 files 表的所有记录
   - 读取 chat_threads 和 chat_messages 表的所有记录
   - 组装为 JSON：{ version: '3.0', exportedAt: ISO时间, files: [...], chatThreads: [...], chatMessages: [...] }
   - 触发浏览器下载，文件名：curator-ai-backup-{日期}.json

3. 导入逻辑：
   - 弹出文件选择器，选择 .json 文件
   - 读取并解析 JSON
   - 验证格式（检查 version 字段和 files 数组存在）
   - 弹出确认对话框："导入将覆盖所有现有数据，确定继续？"
   - 确认后清空所有表，写入导入的数据
   - 刷新文件树和对话

请实现以上功能。
```

**验收标准：**

- [ ] 导出后下载的 JSON 文件中包含所有数据
- [ ] 清空 IndexedDB 后导入 JSON，数据恢复正确

***

### 任务 8.4：暗色模式

**给 AI 的 Prompt：**

```
实现暗色模式切换：

1. 在文件树底部或顶部栏添加一个暗色模式切换按钮：
   - 亮色模式：Sun 图标
   - 暗色模式：Moon 图标
   - 点击切换

2. 使用 Tailwind CSS 的 dark mode（class 模式）：
   - 在 tailwind.config.ts 中设置 darkMode: 'class'
   - 在 html 元素上切换 'dark' class
   - 将当前模式保存到 localStorage

3. 需要适配暗色的区域：
   - 左栏文件树背景色
   - 中栏编辑器背景
   - 右栏对话区域
   - Markdown 编辑器（MDEditor 有自己的暗色模式 API）
   - 所有 shadcn/ui 组件（shadcn 原生支持暗色）
   - 工具栏
   - 弹窗

4. 暗色配色方案：
   - 主背景：#1a1a1a
   - 左栏/右栏背景：#242424
   - 卡片/表面：#2a2a2a
   - 边框：#333333
   - 主要文字：#e5e5e5
   - 次要文字：#999999

请实现暗色模式。
```

**验收标准：**

- [ ] 点击按钮可切换亮色/暗色
- [ ] 所有区域暗色正确
- [ ] 刷新后保持上次的模式

***

### 任务 8.5：AI 生成流式渲染

**给 AI 的 Prompt：**

```
优化 AI 生成内容时的流式渲染体验：

当点击工具栏的生成按钮（匹配分析、招呼语、准备包、复盘等）时，中栏要实时显示生成进度，而不是等全部生成完再显示。

1. 创建 src/components/editor/GeneratingView.tsx：
   - 顶部显示"正在生成：{类型名称}..."，带一个旋转的 Loader2 图标
   - 下方实时渲染正在生成的 Markdown 内容（使用 react-markdown）
   - 内容区域自动滚动到最新位置
   - 底部有一个 [取消] 按钮（点击后中断生成）

2. 修改 generation-actions.ts 中所有生成函数：
   - 生成开始时，在 Zustand store 中设置状态：{ isGenerating: true, generatingType: '匹配度分析', generatingContent: '' }
   - 使用流式回调，每收到一段文本就更新 generatingContent
   - 生成完成后，设置 isGenerating: false，将最终内容写入文件

3. 修改 EditorArea：
   - 当 isGenerating 为 true 时，渲染 GeneratingView 而不是正常的编辑器
   - 生成完成后自动切换回正常编辑器显示生成的文件

请实现以上功能。
```

**验收标准：**

- [ ] 点击生成后中栏实时显示 AI 输出
- [ ] Markdown 格式实时渲染
- [ ] 生成完成后自动切换到文件查看模式

***

### Phase 8 整体验收

- [ ] 文件树视觉美观
- [ ] 空状态引导到位
- [ ] 数据导入导出可用
- [ ] 暗色模式完整
- [ ] 生成过程流畅
- [ ] **Git 提交：** `git add . && git commit -m "Phase 8: 体验打磨完成"`

***

## 完工清单

完成所有 Phase 后，按以下清单做最终检查：

### 核心链路验证

- [ ] **链路1**：首次使用 → 配置模型 → 填写简历 → 导出PDF
- [ ] **链路2**：添加 JD → 生成匹配分析 → 生成BOSS招呼语 → 生成求职邮件
- [ ] **链路3**：添加 JD → 生成面试准备包 → 查看准备包内容
- [ ] **链路4**：创建面试记录 → 粘贴面试文本 → 生成复盘 → 检查记忆摘要更新
- [ ] **链路5**：链路4完成后 → 为新岗位生成准备包 → 检查是否引用了历史复盘教训
- [ ] **链路6**：打开任意文件 → 在右栏对话 → AI 知道文件内容
- [ ] **链路7**：@ 引用文件 → AI 知道引用内容
- [ ] **链路8**：修改 .prompt.md → 下次 AI 生成使用修改后的 prompt

### 数据安全验证

- [ ] API Key 不会出现在浏览器的 URL 或 Network 请求头中（通过代理路由转发）
- [ ] 刷新页面后所有数据还在
- [ ] 导出 → 清空浏览器数据 → 导入 → 数据恢复

### 体验验证

- [ ] 暗色模式正常
- [ ] 空文件夹有引导
- [ ] 生成过程有流式反馈
- [ ] 没有明显的 UI 闪烁或布局错乱
- [ ] Console 无未捕获的错误

***

## 附录：预计文件结构（最终状态）

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/chat/route.ts
├── components/
│   ├── file-tree/
│   │   ├── FileTree.tsx
│   │   ├── FileTreeNode.tsx
│   │   └── FileTreeActions.tsx
│   ├── editor/
│   │   ├── EditorArea.tsx
│   │   ├── MarkdownView.tsx
│   │   ├── JsonView.tsx
│   │   ├── ResumeFormView.tsx
│   │   ├── ModelConfigView.tsx
│   │   ├── GeneratingView.tsx
│   │   ├── EmptyState.tsx
│   │   ├── PdfPreview.tsx
│   │   └── Toolbar.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   └── ContextBadge.tsx
│   └── ui/ (shadcn 组件)
├── lib/
│   ├── db.ts
│   ├── file-system.ts
│   ├── init-workspace.ts
│   ├── ai-engine.ts
│   ├── context-builder.ts
│   ├── generation-actions.ts
│   ├── resume-pdf.ts
│   └── default-prompts/
│       ├── index.ts
│       ├── system.ts
│       ├── resume.ts
│       ├── job.ts
│       ├── prep.ts
│       └── review.ts
├── store/
│   └── app-store.ts
└── types/
    └── index.ts
```

---

## 2026-04-10 补丁：复盘路径重构与迁移实现

### 目录规范
- 新增复盘分层规范：`/面试复盘/{公司-岗位}/{轮次}/`。
- 轮次目录是生成与写入的唯一目标目录。

### 迁移规则
- 初始化阶段执行一次迁移扫描：识别旧目录 `/面试复盘/{公司-岗位-轮次}`。
- 自动迁移到新目录；若轮次冲突则自动追加序号（如 `一面-2`）。
- 迁移标记使用本地 `localStorage`，避免重复全量迁移。

### 兼容策略
- 生成与读取链路采用“新路径优先 + 旧路径兜底”。
- 迁移失败仅记录，不中断页面加载与用户操作。

### 编码修复
- 修复关键模块 UTF-8 乱码：`Toolbar`、`context-builder`、`init-workspace`、`FileTree`/`FileTreeNode`、`system-files`。
- 目标：路径匹配、提示文案、复盘判空逻辑全部恢复可读和可用。
