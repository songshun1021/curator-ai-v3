# Curator AI 开源前安全检查清单

## 1. 密钥与敏感信息

- [ ] 扫描仓库当前内容：无 API Key、私钥、token、`.env` 明文。
- [ ] 扫描 Git 历史提交：无曾提交后删除的密钥。
- [ ] 轮换本人测试过的 API Key（DeepSeek/阿里/火山等）。
- [ ] README 明确说明：API Key 不上传服务端持久化，仅本地存储。

## 2. 仓库体积与忽略规则

- [ ] `.gitignore` 包含 `.next/`、`node_modules/`、`.env*`、证书文件扩展名。
- [ ] 仓库不含构建缓存与本地依赖目录。
- [ ] 大文件仅保留必要资产（如字体），无无关二进制文件。

## 3. 启动与新手可用性

- [ ] README 提供“脚本启动 + 手动启动”双路径。
- [ ] `start-curator.bat` / `start-curator.ps1` 可在新机器运行。
- [ ] 常见错误（Node/pnpm/端口占用）有可理解提示。

## 4. 发布签收

- [ ] `pnpm build` 通过。
- [ ] P0 回归全部通过。
- [ ] `SESSION_COMPACT.md` 更新完毕。
- [ ] 版本标签与发布说明已准备。

