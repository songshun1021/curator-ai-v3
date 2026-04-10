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

可选提交信息：
```powershell
.\publish-curator.ps1 -Message "feat: 本轮功能迭代"
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

## 项目基线文档（先读）

- `Curator-AI-v3-产品规划.md`
- `Curator-AI-v3-开发执行手册.md`
- `SESSION_COMPACT.md`
- `AI开发复盘.md`

## 开源说明

- License: MIT
- 欢迎提交 Issue 和 PR（见 `CONTRIBUTING.md`）
