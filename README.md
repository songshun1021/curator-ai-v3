# Curator AI v3

面向中国大陆在校大学生/研究生的求职辅助工具，聚焦：简历优化、岗位文书生成、面试准备与复盘闭环。

## 用户启动

### Windows
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start\start-curator.ps1
```

### macOS / Linux
```bash
chmod +x scripts/start/start-curator.sh
./scripts/start/start-curator.sh
```

## 开发者发布（Windows）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator.ps1
```

可选：
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator.ps1 -Message "feat: update"
```

## 分享打包（Windows）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\package-wechat.ps1
```

## 文档导航

- [docs/README.md](docs/README.md)
- [docs/BASELINE_ALIGNMENT_MATRIX.md](docs/BASELINE_ALIGNMENT_MATRIX.md)
- [docs/QA_REGRESSION_MATRIX.md](docs/QA_REGRESSION_MATRIX.md)
- [docs/RELEASE_SECURITY_CHECKLIST.md](docs/RELEASE_SECURITY_CHECKLIST.md)
- [docs/ROADMAP_4W_MULTI_AGENT.md](docs/ROADMAP_4W_MULTI_AGENT.md)
- [docs/CHANGELOG-lite.md](docs/CHANGELOG-lite.md)

## 开源说明

- License: MIT
- 欢迎提交 Issue 和 PR（见 `CONTRIBUTING.md`）
