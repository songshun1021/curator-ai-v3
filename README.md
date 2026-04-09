# Curator AI v3

面向中国大陆在校大学生/研究生的求职辅助工具，聚焦三件事：

1. 简历优化与定制
2. 基于 JD + 简历生成求职沟通文书
3. 面试准备包与复盘闭环

## 本地一键启动（推荐新手）

### Windows 双击版
- 双击运行 `start-curator.bat`

### PowerShell 版
- 右键用 PowerShell 运行：`start-curator.ps1`

脚本会自动：
- 检查 Node.js 与 pnpm
- 安装依赖（首次）
- 启动 `pnpm dev`
- 打开浏览器到 `http://localhost:3000`

## 手动启动

```bash
pnpm install
pnpm dev
```

## 首次使用建议

1. 进入 `AI配置/模型配置.json` 填写模型配置并“验证连接”。
2. 点击左侧 `+ 新建岗位`，录入公司、岗位、JD。
3. 在岗位目录中生成“定制简历/匹配分析/面试准备包”。
4. 面试后可在岗位工具栏点“新建复盘”，录入原文后生成复盘报告。

## 常见问题

### 打开页面空白
- 请确认 Node.js 版本 >= 18
- 请确认本机 3000 端口未被占用

### 验证模型失败
- 检查 API Key 是否正确
- 检查 Base URL 与模型名是否匹配

## 开源说明

- License: MIT
- 欢迎提交 Issue 和 PR（见 `CONTRIBUTING.md`）
