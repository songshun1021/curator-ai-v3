# README-微信快速开始

适用对象：通过微信收到压缩包的普通用户（Win/mac）。

## 1. 解压

1. 解压到本地目录（建议英文路径）。
2. 进入项目目录。

## 2. 按系统启动

### Windows
- 双击 `start-curator.bat`
- 或 PowerShell 运行 `start-curator.ps1`

### macOS / Linux
```bash
chmod +x start-curator.sh
./start-curator.sh
```

## 3. 第一次使用

1. 配置 `AI配置/模型配置.json`。
2. 按右侧 5 步指引完成：
   简历 -> 岗位/JD -> 准备包 -> 面试原文 -> 复盘。

## 4. 常见问题

### A. 找不到 Node
- 安装 Node.js 18+：<https://nodejs.org/>

### B. 启动报权限错误
- 关闭所有相关终端后重试
- 开发者环境若报 EPERM，删除 `.next` 后再启动

### C. 无法生成内容
- 检查 API Key、Base URL、模型名是否匹配
- 在模型配置页点击“验证连接”

> 说明：压缩包面向使用者，不包含发布脚本。
