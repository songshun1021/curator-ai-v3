# Curator AI v3 — 文件系统形态产品规划

> 版本：v3.0 | 日期：2026-04-08
> 本文档替代此前所有规划文档，作为**唯一产品规划基准**。

---

## 一、产品一句话定义

**Curator AI 是一款类 IDE 布局的、LLM 驱动的求职全链路 AI 助手。用户通过「文件夹 + 文件 + AI 对话」三栏交互，完成简历管理→岗位投递→面试准备→面试复盘的自动化闭环。所有 AI 行为由用户可编辑的 .md 指令文件驱动，完全透明可控。**

---

## 二、交互形态总览

### 2.1 三栏布局（类 Trae/Cursor）

```
┌──────────────┬────────────────────────────┬──────────────────┐
│              │                            │                  │
│   文件树      │       文件内容区            │    AI 对话栏     │
│   (左栏)      │       (中栏)               │    (右栏)        │
│   w: 240px   │       flex: 1              │    w: 380px      │
│              │                            │                  │
│  📁 简历      │  当前打开的文件内容          │  对话消息流       │
│  📁 岗位      │  - .md → Markdown编辑器    │                  │
│  📁 准备包    │  - .json → 表单视图         │  自动感知当前      │
│  📁 面试复盘  │  - .pdf → 预览             │  打开的文件       │
│  📁 AI配置    │                            │                  │
│              │                            │  支持 @引用       │
│              │                            │  任意文件         │
│              │                            │                  │
│              │                            │  ┌────────────┐  │
│              │                            │  │ 输入框      │  │
│              │                            │  └────────────┘  │
└──────────────┴────────────────────────────┴──────────────────┘
```

### 2.2 核心交互原则

1. **文件即数据**：所有用户数据（简历、JD、准备包、复盘）都以文件形式呈现在文件树中
2. **Prompt 即配置**：每个文件夹内置 `.prompt.md` 文件，定义该模块 AI 的行为规则，用户可自由编辑
3. **上下文即视野**：AI 对话自动感知当前打开的文件内容，无需手动粘贴
4. **文件夹固定、子文件夹自动生成**：5 个根文件夹由系统预设，子文件夹随用户操作自动创建

---

## 三、完整文件树结构

```
curator-workspace/
│
├── 📁 简历/
│   ├── _resume.prompt.md            ← AI指令：简历润色、STAR法则、定制简历生成规则
│   ├── _resume.skill.md             ← AI技能：简历评分标准、行业关键词库
│   ├── 主简历.json                   ← 用户结构化简历数据（唯一主简历）
│   ├── 主简历-预览.pdf               ← 主简历的 PDF 渲染结果
│   └── 📁 定制简历/
│       ├── 字节跳动-产品实习.json     ← 系统自动创建（当用户为某JD生成定制简历时）
│       ├── 字节跳动-产品实习.pdf
│       ├── 腾讯-运营实习.json
│       └── 腾讯-运营实习.pdf
│
├── 📁 岗位/
│   ├── _job.prompt.md               ← AI指令：JD解析规则、匹配度分析方法
│   ├── _job.skill.md                ← AI技能：行业分类标准、岗位关键能力提取
│   │
│   ├── 📁 字节跳动-产品实习/          ← 添加JD时系统自动创建
│   │   ├── jd.md                    ← JD原文（用户粘贴）
│   │   ├── meta.json                ← 元信息：公司、岗位、状态、绑定简历ID、创建时间
│   │   ├── 匹配度分析.md             ← AI生成
│   │   ├── BOSS招呼语.md             ← AI生成
│   │   └── 求职邮件.md               ← AI生成
│   │
│   └── 📁 腾讯-运营实习/
│       ├── jd.md
│       ├── meta.json
│       ├── 匹配度分析.md
│       ├── BOSS招呼语.md
│       └── 求职邮件.md
│
├── 📁 面试准备包/
│   ├── _prep.prompt.md              ← AI指令：准备包生成规则、题目分类标准
│   ├── _prep.skill.md               ← AI技能：面试题库模板、STAR答题框架
│   │
│   ├── 📁 字节跳动-产品实习/          ← 生成准备包时系统自动创建
│   │   ├── meta.json                ← 关联的 jobId、resumeId、生成时间
│   │   ├── 准备包.md                 ← AI生成的完整准备包
│   │   └── 知识清单.md               ← AI提取的需复习知识点
│   │
│   └── 📁 腾讯-运营实习/
│       ├── meta.json
│       ├── 准备包.md
│       └── 知识清单.md
│
├── 📁 面试复盘/
│   ├── _review.prompt.md            ← AI指令：复盘评分规则、改进建议生成规范
│   ├── _review.skill.md             ← AI技能：面试评估框架、行为指标
│   │
│   ├── 📁 字节跳动-产品实习-一面/     ← 创建面试记录时系统自动创建
│   │   ├── meta.json                ← 关联 jobId、面试轮次、日期
│   │   ├── 面试原文.md               ← 用户粘贴的面试听写文本
│   │   └── 复盘报告.md               ← AI生成的复盘分析
│   │
│   └── 📁 字节跳动-产品实习-二面/
│       ├── meta.json
│       ├── 面试原文.md
│       └── 复盘报告.md
│
└── 📁 AI配置/
    ├── _system.prompt.md            ← 全局系统prompt（AI人格、语言风格）
    ├── 模型配置.json                 ← provider、model、baseURL、apiKey
    └── 记忆摘要.md                   ← AI自动维护的用户画像和历史要点
```

---

## 四、文件夹间关联关系

### 4.1 关联关系总图

```
                         ┌──────────┐
                         │  AI配置   │
                         │ 全局prompt │
                         │ 模型配置   │
                         │ 记忆摘要   │
                         └────┬─────┘
                              │ 所有AI调用都读取
                              ▼
┌──────────┐  绑定(1:1)  ┌──────────┐  触发生成  ┌──────────┐
│          │ ◄────────── │          │ ─────────► │          │
│   简历    │             │   岗位    │            │ 面试准备包 │
│          │ ──────────► │          │            │          │
└──────────┘  生成定制简历 └────┬─────┘            └──────────┘
                              │                       ▲
                              │ 面试后创建              │ 反哺（历史复盘摘要）
                              ▼                       │
                         ┌──────────┐                 │
                         │ 面试复盘  │ ────────────────┘
                         │          │  复盘要点→记忆摘要→下次准备包
                         └──────────┘
```

### 4.2 每条关联的详细说明

| # | 关联 | 触发时机 | 具体数据流 |
|---|------|---------|-----------|
| 1 | 岗位→简历 绑定 | 创建JD时选择绑定哪份简历 | `meta.json.resumeId` 指向简历ID |
| 2 | 简历+岗位→定制简历 | 点击「生成定制简历」 | 读取主简历+JD → AI生成 → 写入 `简历/定制简历/{岗位名}.json` |
| 3 | 简历+岗位→求职文书 | 点击「生成招呼语/邮件」 | 读取简历+JD → AI生成 → 写入 `岗位/{岗位名}/BOSS招呼语.md` |
| 4 | 简历+岗位+记忆→准备包 | 点击「生成准备包」 | 读取简历+JD+记忆摘要 → AI生成 → 写入 `面试准备包/{岗位名}/` |
| 5 | 原文+JD+简历+准备包→复盘 | 点击「生成复盘」 | 读取四份文件 → AI生成 → 写入 `面试复盘/{岗位-轮次}/复盘报告.md` |
| 6 | 复盘→记忆摘要 沉淀 | 每次复盘生成后自动 | AI提取要点 → 追加到 `AI配置/记忆摘要.md` |
| 7 | 记忆摘要→准备包 反哺 | 下次生成准备包时 | prompt中注入记忆摘要内容 |

### 4.3 AI调用时的上下文组装规则

```
┌─ 必选上下文 ──────────────────────────────────┐
│  1. AI配置/_system.prompt.md   （全局人格）     │
│  2. 当前文件夹的 .prompt.md    （模块指令）     │
│  3. 当前文件夹的 .skill.md     （模块技能）     │
│  4. 当前打开的文件内容         （用户视野）     │
└──────────────────────────────────────────────┘

┌─ 按场景自动注入 ──────────────────────────────┐
│  · 生成定制简历 → +主简历 +目标JD              │
│  · 生成求职文书 → +简历摘要 +JD                │
│  · 生成准备包   → +简历 +JD +记忆摘要          │
│  · 生成复盘     → +面试原文 +JD +简历 +准备包  │
│  · 自由对话     → +当前文件 +记忆摘要           │
└──────────────────────────────────────────────┘

┌─ 用户手动追加 ────────────────────────────────┐
│  · @文件名 → 将任意文件内容注入对话上下文       │
└──────────────────────────────────────────────┘
```

---

## 五、每个 .prompt.md / .skill.md 的内容

### 5.1 AI配置/_system.prompt.md（全局）

```markdown
# 角色定义
你是 Curator AI，一个专业的求职辅导助手，服务对象是中国大陆高校学生。

# 语言风格
- 使用中文回复
- 专业但不生硬，像一个耐心的学长/学姐
- 给出的建议要具体可执行，不说空话

# 输出规范
- 使用 Markdown 格式
- 重要内容用 **加粗** 或 > 引用块
- 列表项需有具体说明，不要只列标题
```

### 5.2 简历/_resume.prompt.md

```markdown
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

# 输出格式
润色单条经历 → 返回纯文本
生成定制简历 → 返回JSON
```

### 5.3 岗位/_job.prompt.md

```markdown
# 目标
解析JD内容，生成匹配度分析和求职文书。

# JD解析规则
从JD文本中提取：核心职责（3-5条）、必备技能、加分项、隐含要求（从措辞推断）

# 匹配度分析
- 逐项对比JD要求与简历内容
- 输出匹配度评分（0-100）和逐项分析
- 标注优势项和缺口项

# BOSS招呼语规则
- 字数：80-120字
- 结构：自我介绍(1句) + 岗位匹配点(2-3个) + 表达意愿(1句)

# 求职邮件规则
- 结构：称呼 + 自我介绍 + 为什么选这家公司 + 核心匹配点(3个) + 结尾
- 长度：300-500字
```

### 5.4 面试准备包/_prep.prompt.md

```markdown
# 目标
基于JD + 简历 + 历史复盘，生成个性化的面试准备包。

# 准备包结构（固定）
## 1. 岗位匹配度速览
## 2. 高频面试题（15-20题）
  - 分类：自我介绍、行为题、业务题、专业题、反问环节
  - 每题附参考答案框架
## 3. 简历追问预测
  - 简历中可能被追问的3-5个点 + 应对策略
## 4. 知识薄弱点
  - 基于JD要求 vs 简历内容，列出需复习的知识领域
## 5. 历史复盘教训（如有）
  - 从记忆摘要中提取该岗位类型的历史失误和改进项
```

### 5.5 面试复盘/_review.prompt.md

```markdown
# 目标
分析面试表现，生成结构化复盘报告。

# 复盘报告结构（固定）
## 1. 整体评估（A/B/C/D + 一句话总结）
## 2. 逐题分析（评分1-5星 + 优点 + 改进 + 参考答案）
## 3. 知识盲区（缺口 + 推荐学习方向）
## 4. 行动项（3-5个具体事项 + 完成标准）

# 输入要求
必须：面试原文、JD、简历。可选：准备包。

# 复盘后自动操作
生成完成后，系统自动提取「行动项」和「知识盲区」追加到 AI配置/记忆摘要.md
```

---

## 六、核心用户流程（操作级别）

### 流程1：首次使用

```
打开应用
  → 文件树显示5个根文件夹（仅含系统文件）
  → 自动打开 AI配置/模型配置.json
  → 中栏显示配置表单（选供应商→选模型→填API Key→验证）
  → 验证成功 → 引导打开 简历/主简历.json
  → 中栏显示简历编辑表单
  → 填写完成 → 自动渲染PDF预览
```

### 流程2：添加目标岗位

```
右键「岗位」文件夹 → 新建岗位
  → 弹窗：输入公司名 + 岗位名 + 选择绑定简历（默认主简历）
  → 系统自动创建子文件夹 + jd.md + meta.json
  → 自动打开 jd.md → 用户粘贴JD文本 → 保存
```

### 流程3：生成求职文书

```
打开 岗位/{岗位名}/jd.md
  → 工具栏出现：[生成匹配分析] [生成BOSS招呼语] [生成求职邮件]
  → 点击任一按钮 → AI组装上下文 → 生成 → 写入对应.md文件
  → 中栏自动切换显示生成结果 → 用户可编辑、复制
```

### 流程4：生成面试准备包

```
在岗位子文件夹内 → 工具栏 [生成面试准备包]
  → AI组装：prep.prompt + 简历 + JD + 记忆摘要
  → 自动创建 面试准备包/{岗位名}/ + 准备包.md + 知识清单.md
  → 自动打开准备包.md
```

### 流程5：面试复盘

```
右键「面试复盘」→ 新建面试记录（选岗位 + 输入轮次）
  → 自动创建子文件夹 + 面试原文.md
  → 用户粘贴面试文本 → 保存
  → 工具栏 [生成复盘报告] → AI组装上下文 → 生成复盘报告.md
  → 自动沉淀：提取行动项+知识盲区 → 追加到记忆摘要.md
```

### 流程6：AI自由对话

```
右栏始终可用
  → 自动注入当前打开文件 + _system.prompt.md + 记忆摘要.md
  → 支持 @文件名 引用任意文件
  → 例：正在看准备包.md → 问「第3题详细解释」→ AI直接展开
```

---

## 七、数据模型

### 7.1 虚拟文件系统表（IndexedDB via Dexie.js）

```typescript
interface VirtualFile {
  id: string;
  path: string;            // "/岗位/字节跳动-产品实习/jd.md"
  name: string;
  type: 'folder' | 'file';
  contentType: 'md' | 'json' | 'pdf';
  content: string;          // md/json为文本, pdf为base64
  isSystem: boolean;        // .prompt.md / .skill.md
  isGenerated: boolean;     // AI生成的文件
  parentPath: string;
  metadata?: {
    jobId?: string;
    resumeId?: string;
    round?: string;
    status?: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

### 7.2 简历数据结构

```typescript
interface ResumeData {
  id: string;
  profile: { name: string; phone: string; email: string; wechat?: string };
  education: Array<{
    school: string; degree: string; major: string;
    startDate: string; endDate: string; gpa?: string;
  }>;
  internships: Array<{
    company: string; position: string;
    startDate: string; endDate: string; descriptions: string[];
  }>;
  campusExperience: Array<{
    organization: string; role: string;
    startDate: string; endDate: string; descriptions: string[];
  }>;
  projects?: Array<{
    name: string; role: string; descriptions: string[]; techStack?: string[];
  }>;
  skills: {
    professional: string[]; languages?: string[];
    certificates?: string[]; tools?: string[];
  };
}
```

### 7.3 岗位元信息

```typescript
interface JobMeta {
  id: string;
  company: string;
  position: string;
  resumeId: string;
  status: 'saved' | 'preparing' | 'applied' | 'interviewing' | 'offered' | 'rejected';
  createdAt: string;
}
```

### 7.4 系统初始化文件清单

应用首次打开时自动创建（用户可见、可编辑）：

| 路径 | 说明 |
|------|------|
| `/简历/_resume.prompt.md` | 简历AI指令 |
| `/简历/_resume.skill.md` | 简历AI技能 |
| `/岗位/_job.prompt.md` | 岗位AI指令 |
| `/岗位/_job.skill.md` | 岗位AI技能 |
| `/面试准备包/_prep.prompt.md` | 准备包AI指令 |
| `/面试准备包/_prep.skill.md` | 准备包AI技能 |
| `/面试复盘/_review.prompt.md` | 复盘AI指令 |
| `/面试复盘/_review.skill.md` | 复盘AI技能 |
| `/AI配置/_system.prompt.md` | 全局AI人格 |
| `/AI配置/模型配置.json` | LLM配置（空） |
| `/AI配置/记忆摘要.md` | 记忆（空，自动积累） |

---

## 八、技术方案

### 8.1 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | **Next.js 14 (App Router)** | 生态成熟，vibe-coding资料最多 |
| UI | **shadcn/ui + Tailwind CSS** | 轻量、AI友好 |
| 状态 | **Zustand** | 极简 |
| 存储 | **Dexie.js (IndexedDB)** | 类型安全的IndexedDB封装 |
| MD渲染 | **react-markdown + remark-gfm** | |
| MD编辑 | **@uiw/react-md-editor** | 轻量 |
| PDF | **@react-pdf/renderer** | 简历导出 |
| LLM | **OpenAI兼容API (fetch)** | 不引入SDK |
| 图标 | **Lucide React** | |
| 文件树 | **自建递归组件** | 核心交互需完全可控 |

> 当前代码基线：React 18 + Tailwind CSS v3（与仓库现状对齐）。
> 升级里程碑：MVP 主链路稳定后，单列评估升级到 React 19 + Tailwind CSS v4。

### 8.2 开发目录结构

```
src/
├── app/
│   ├── layout.tsx              # 三栏布局壳
│   ├── page.tsx                # 主页面
│   └── api/chat/route.ts       # LLM代理
│
├── components/
│   ├── file-tree/              # 左栏
│   │   ├── FileTree.tsx
│   │   ├── FileTreeNode.tsx
│   │   └── FileTreeActions.tsx # 右键菜单
│   ├── editor/                 # 中栏
│   │   ├── EditorArea.tsx      # 根据文件类型切换视图
│   │   ├── MarkdownView.tsx
│   │   ├── JsonFormView.tsx
│   │   ├── PdfPreview.tsx
│   │   └── Toolbar.tsx
│   ├── chat/                   # 右栏
│   │   ├── ChatPanel.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx       # 支持@引用
│   │   └── ContextBadge.tsx
│   └── ui/                     # shadcn组件
│
├── lib/
│   ├── db.ts                   # Dexie数据库
│   ├── file-system.ts          # 虚拟文件系统CRUD
│   ├── ai-engine.ts            # LLM调用+流式
│   ├── context-builder.ts      # 上下文组装
│   ├── resume-pdf.ts           # PDF渲染
│   └── default-prompts/        # 默认prompt内容
│       ├── system.ts
│       ├── resume.ts
│       ├── job.ts
│       ├── prep.ts
│       └── review.ts
│
├── store/app-store.ts          # Zustand
└── types/index.ts
```

---

## 九、分阶段开发计划（Vibe-Coding专用）

> 每个Phase独立可运行。把每个Phase的内容复制给AI编程助手即可。

---

### Phase 0：项目骨架

**给AI的指令**：创建一个 Next.js 14 项目，安装 shadcn/ui 和 Tailwind CSS。实现一个三栏布局页面：左栏240px宽显示文件树（硬编码5个文件夹：简历、岗位、面试准备包、面试复盘、AI配置），中栏自适应宽度显示"请选择文件"占位文本，右栏380px宽显示一个空的聊天界面（消息列表区域+底部输入框）。文件树支持展开/折叠文件夹，点击文件高亮选中。

**验收**：三栏可见，文件树可点击，视觉像Trae/Cursor

---

### Phase 1：虚拟文件系统

**给AI的指令**：安装 dexie 库。在 `lib/db.ts` 创建 IndexedDB 数据库，包含一个 `files` 表（字段：id, path, name, type, contentType, content, isSystem, isGenerated, parentPath, metadata）。在 `lib/file-system.ts` 实现 CRUD 函数：createFile, readFile, updateFile, deleteFile, listChildren(parentPath)。应用首次加载时（检测数据库为空），自动初始化以下系统文件夹和文件：[列出第七章7.4的完整清单]。每个 .prompt.md 文件的默认内容见第五章。文件树组件改为从 IndexedDB 读取数据。点击 .md 文件时，中栏显示一个 Markdown 编辑器（使用 @uiw/react-md-editor），编辑后保存到 IndexedDB。

**验收**：刷新页面数据还在，能编辑保存 .prompt.md 文件

---

### Phase 2：AI配置 + 对话

**给AI的指令**：点击 `AI配置/模型配置.json` 时，中栏显示一个配置表单：供应商下拉选择（DeepSeek/火山引擎/通义千问/智谱AI/OpenAI/自定义），选择后自动填入 baseURL；模型名输入框；API Key 输入框（密码类型）；[验证连接] 按钮（发送一条测试消息）。在 `app/api/chat/route.ts` 创建 Next.js Route Handler，接收 messages+model+baseURL+apiKey，转发到对应 LLM API，流式返回。右栏对话功能：用户输入消息 → 调用 Route Handler → 流式展示 AI 回复。每次对话自动将 `AI配置/_system.prompt.md` 的内容作为 system message。自动将当前打开的文件内容注入为 user message 前缀（格式："当前文件：{文件名}\n内容：{内容}"）。

**验收**：配置API Key后能和AI对话，AI知道当前打开的文件内容

---

### Phase 3：简历模块

**给AI的指令**：点击 `简历/主简历.json` 时，中栏显示结构化简历编辑表单（不是JSON编辑器）。表单分区：基本信息（姓名/手机/邮箱/微信/目标岗位）、教育经历（可动态增删条目，每条含学校/学历/专业/起止时间/GPA）、实习经历（公司/岗位/起止时间/工作描述，每条可有多行描述）、校园经历（组织/角色/起止时间/描述）、项目经历（项目名/角色/描述/技术栈）、技能（专业技能/语言/证书/工具，标签式输入）。保存时序列化为JSON写入IndexedDB。工具栏增加 [导出PDF] 按钮，使用 @react-pdf/renderer 渲染简历为A4格式PDF下载。工具栏增加 [AI润色] 按钮，选中某段经历描述后点击，将该描述+简历/_resume.prompt.md发送给AI，返回STAR法则优化后的文本，用户可确认替换。

**验收**：填写简历 → AI润色某段经历 → 导出可用PDF

---

### Phase 4：岗位管理

**给AI的指令**：右键点击「岗位」文件夹时弹出菜单 [新建岗位]。点击后弹窗：输入公司名、岗位名、下拉选择绑定简历（列出所有简历文件）。确认后系统自动在 `岗位/` 下创建子文件夹 `{公司}-{岗位}/`，并创建 `jd.md`（空）和 `meta.json`（含公司、岗位、状态saved、resumeId、时间），自动打开 jd.md。当用户在岗位子文件夹的任意文件中时，工具栏显示按钮组：[生成匹配分析] [生成BOSS招呼语] [生成求职邮件] [生成定制简历]。每个按钮的逻辑：1.读取该岗位的 jd.md 内容，2.读取绑定的简历内容，3.读取 `岗位/_job.prompt.md` 和 `_job.skill.md`，4.读取 `AI配置/_system.prompt.md`，5.组装为消息发送给 LLM，6.将生成结果写入对应的 .md 文件。[生成定制简历] 特殊：结果是JSON，写入 `简历/定制简历/{公司}-{岗位}.json`。

**验收**：添加JD → 一键生成招呼语、邮件、匹配分析、定制简历

---

### Phase 5：面试准备包

**给AI的指令**：在岗位子文件夹的工具栏增加 [生成面试准备包] 按钮。点击后：1.读取该岗位的 jd.md，2.读取绑定的简历，3.读取 `面试准备包/_prep.prompt.md` 和 `_prep.skill.md`，4.读取 `AI配置/_system.prompt.md`，5.读取 `AI配置/记忆摘要.md`（可能为空），6.组装发送给LLM。生成完成后：自动创建 `面试准备包/{公司}-{岗位}/` 子文件夹，写入 `准备包.md`（主内容）、`知识清单.md`（从准备包中提取的知识点列表）、`meta.json`（关联jobId、resumeId、时间），文件树刷新显示新文件夹，自动打开 `准备包.md`。

**验收**：准备包含15-20道面试题+参考答案+简历追问预测+知识薄弱点

---

### Phase 6：面试复盘

**给AI的指令**：右键「面试复盘」文件夹 → [新建面试记录]。弹窗：下拉选择关联岗位（列出 `岗位/` 下所有子文件夹）、输入面试轮次（如"一面""二面"）。确认后创建 `面试复盘/{公司}-{岗位}-{轮次}/` 子文件夹，包含 `面试原文.md`（空）和 `meta.json`，自动打开面试原文.md等待粘贴。当面试原文.md有内容时，工具栏出现 [生成复盘报告]。点击后：1.读取面试原文.md，2.通过meta.json找到关联岗位的jd.md，3.读取绑定的简历，4.尝试读取 `面试准备包/{对应岗位}/准备包.md`（可选），5.读取 `_review.prompt.md` + `_review.skill.md` + `_system.prompt.md`，6.发送给LLM生成复盘报告.md。**关键**：生成复盘报告后，自动发一次额外的LLM调用，prompt为"从以下复盘报告中提取【行动项】和【知识盲区】，以简洁的列表形式输出"，将结果追加到 `AI配置/记忆摘要.md` 末尾（用分隔线和日期标注）。

**验收**：粘贴面试文本→生成复盘→记忆摘要自动更新→下一个准备包能引用历史教训

---

### Phase 7：AI对话增强

**给AI的指令**：对话输入框支持 @ 触发：用户输入 @ 后弹出文件搜索下拉，搜索并选择任意文件，该文件内容被追加到本次对话的上下文中。对话区域顶部增加「当前上下文」指示器，以标签形式显示当前注入的文件列表（如 📄 jd.md 📄 主简历.json），可点击 × 移除。支持新建对话线程和切换历史线程。所有对话消息持久化到 IndexedDB 的 `chat_messages` 表。

**验收**：@引用多个文件与AI对话，上下文标签正确显示

---

### Phase 8：体验打磨

**给AI的指令**：1.文件树图标：文件夹用FolderIcon，.md用FileTextIcon，.json用FileJsonIcon，.pdf用FileIcon，系统文件（_开头）用灰色，AI生成的文件用蓝色徽标。2.岗位状态：meta.json中的status字段，在文件树的岗位子文件夹名旁显示彩色圆点（saved灰/preparing黄/applied蓝/interviewing紫/offered绿/rejected红），右键可切换状态。3.数据导出：设置中增加[导出所有数据]按钮，将IndexedDB全部数据序列化为JSON文件下载；[导入数据]按钮从JSON恢复。4.空状态：每个空文件夹显示引导文字和操作按钮。5.AI生成时中栏显示流式打字效果。6.暗色模式切换。

**验收**：整体视觉完整，体验流畅

---

## 十、LLM配置方案

| 供应商 | 推荐模型 | baseURL |
|--------|---------|---------|
| **DeepSeek**（默认） | deepseek-chat | `https://api.deepseek.com/v1` |
| 火山引擎 | doubao-1.5-pro-32k | `https://ark.cn-beijing.volces.com/api/v3` |
| 通义千问 | qwen-plus | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱AI | glm-4-flash | `https://open.bigmodel.cn/api/paas/v4` |
| OpenAI | gpt-4o-mini | `https://api.openai.com/v1` |
| 自定义 | 用户自填 | 用户自填 |

API Key安全：默认session-only，可选localStorage持久化。API Key 仅用于本应用 `/api/chat` 代理转发，不写入服务端持久化存储，不对外转发到非用户配置的目标模型服务。

---

## 十一、MVP不做清单

| 不做 | 原因 |
|------|------|
| 桌面应用/Tauri | Web先行 |
| 账号/云同步 | 本地优先 |
| 真实文件系统 | 虚拟文件系统 |
| PDF导入解析 | 留后续 |
| 语音转录 | 留后续 |
| 英文简历 | 专注中文 |
| 社招场景 | 专注校招 |

---

## 十二、关键设计决策

| 决策点 | 决策 | 理由 |
|--------|------|------|
| 交互形态 | 三栏IDE布局 | 文件即数据，直观透明 |
| 文件系统 | IndexedDB虚拟文件系统 | Web端无需文件权限 |
| 文件夹 | 5根固定，子文件夹自动 | 降低认知负担 |
| AI指令 | .prompt.md用户可编辑 | 透明可控 |
| JD-简历 | 创建时绑定 | 后续自动关联 |
| 求职文书 | 在岗位子文件夹 | 与JD天然绑定 |
| 复盘粒度 | 一面试→一原文→一复盘 | 简单清晰 |
| 上下文 | 自动感知+手动@ | 智能且可控 |
| 记忆沉淀 | 复盘→记忆→反哺准备包 | 越用越准 |
