# Curator AI v3

面向中国大陆在校大学生/研究生的求职辅助工具，聚焦三件事：

1. 简历优化与定制
2. 基于 JD + 简历生成求职沟通文书
3. 面试准备包与复盘闭环

## 我是用户（启动使用）

### Windows
- 双击 `start-curator.bat`
- 或运行 `start-curator.ps1`

### macOS / Linux
```bash
chmod +x start-curator.sh
./start-curator.sh
```

启动脚本会自动：
- 检查 Node.js 与 pnpm
- 首次安装依赖
- 启动 `pnpm dev`
- 打开浏览器到 `http://localhost:3000`

## 我是开发者（Windows 发布）

> 发布与打包仅在 Windows 开发环境执行。

### 一键发布 GitHub
- 双击 `publish-curator.bat`
- 或运行：
```powershell
.\publish-curator.ps1
```

小白默认就用上面这条命令即可（会自动生成提交信息）。

可选提交信息：
```powershell
.\publish-curator.ps1 -Message "feat: 本轮功能迭代"
```

应急模式（仅当构建因本机权限问题反复失败时使用）：
```powershell
.\publish-curator.ps1 -SkipBuild
```

发布脚本会执行：
1. 检查 `git/node/pnpm` 与 git 身份
2. `pnpm build`
3. 敏感文件检查
4. `git add/commit/pull --rebase/push`

## 我要分享给朋友（微信）

### 生成分享包（Windows）
- 双击 `package-wechat.bat`
- 或运行：
```powershell
.\package-wechat.ps1
```

### 产物
- `release/curator-ai-v3-wechat-YYYYMMDD-HHmm.zip`

### 分享包包含
- 运行必需源码与配置（`src/`、`public/`、配置文件）
- 双平台启动入口：
  - `start-curator.bat`
  - `start-curator.ps1`
  - `start-curator.sh`
- `README-微信快速开始.md`

### 分享包不包含
- `.git`、`node_modules`、`.next`、`.env*`
- 发布/打包脚本（避免普通用户误操作）

## 首次使用建议

1. 进入 `AI配置/模型配置.json` 填写模型配置并验证连接。
2. 按右侧「新手使用指引」5 步走通：
   简历 -> 岗位/JD -> 准备包 -> 面试原文 -> 复盘报告。

## 常见问题

### 启动失败：找不到 Node
- 安装 Node.js 18+：<https://nodejs.org/>

### `pnpm build` 出现 EPERM（开发者）
- 关闭所有 `pnpm dev` / Node 终端
- 删除 `.next` 后重试
- 避免管理员/普通权限混用

### 模型生成失败
- 检查 API Key、Base URL、模型名是否匹配

## 文档导航

| 文档 | 用途 |
| --- | --- |
| `docs/Curator-AI-v3-产品规划.md` | 产品目标、范围与阶段规划 |
| `docs/Curator-AI-v3-开发执行手册.md` | 技术架构、实施规范与约束 |
| `docs/AI开发复盘.md` | 迭代沉淀与交接记录 |
| `docs/BASELINE_ALIGNMENT_MATRIX.md` | 文档与代码基线对齐矩阵 |
| `docs/QA_REGRESSION_MATRIX.md` | 回归测试矩阵 |
| `docs/RELEASE_SECURITY_CHECKLIST.md` | 发布前安全检查清单 |
| `docs/ROADMAP_4W_MULTI_AGENT.md` | 4 周并行迭代路线图 |
| `SESSION_COMPACT.md` | 最近会话连续性摘要（持续更新） |
| `AGENTS.md` | Agent 协作与执行规则 |

## 仓库体积说明

- GitHub 仓库体积主要由源码与文档组成。
- 本地看起来体积很大通常来自 `node_modules/` 与 `.next/` 缓存，这两类目录不会提交到仓库。
- 微信分享包会自动排除 `.git`、`node_modules`、`.next`、`.env*`，仅保留启动所需内容。

## 开源说明

- License: MIT
- 欢迎提交 Issue 和 PR（见 `CONTRIBUTING.md`）
