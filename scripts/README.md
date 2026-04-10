# Scripts 目录说明

本目录用于存放脚本“真实逻辑”，根目录脚本仅做入口转发。

## 结构

- `start/`
  - `start-curator.ps1`：Windows 启动逻辑
  - `start-curator.sh`：macOS/Linux 启动逻辑
- `release/`
  - `publish-curator.ps1`：Windows 发布逻辑（构建、提交、推送）
  - `package-wechat.ps1`：Windows 微信分享包打包逻辑

## 约束

- 发布与打包仅在 Windows 环境执行。
- 微信分享包面向普通用户，不包含发布/打包脚本。
