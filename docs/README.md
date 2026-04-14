# Docs 索引

本目录存放 Curator AI 的产品、开发、上线、发布与回归基线文档。

## 优先阅读顺序

### 1. 基线文档
| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `Curator-AI-v3-产品规划.md` | 唯一产品规划基线，定义产品边界、用户路径与能力范围 | Canonical |
| `Curator-AI-v3-开发执行手册.md` | 唯一开发执行基线，定义实现顺序与验收要求 | Canonical |
| `SESSION_COMPACT.md` | 当前阶段的连续性档案，记录实现状态、验证结果与交接建议 | Internal |

### 2. 上线与发布文档
| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `DEPLOY_VERCEL.md` | 新手友好的 Vercel 上线指南，适合“用户自填 API”的 Web 版 | Active |
| `RELEASE_SECURITY_CHECKLIST.md` | GitHub 公开发布前的安全检查清单 | Active |
| `CHANGELOG-lite.md` | 对外可见的精简变更摘要 | Active |

### 3. 治理与回归文档
| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `BASELINE_ALIGNMENT_MATRIX.md` | 判断“文档与代码是否阶段性偏离” | Active |
| `QA_REGRESSION_MATRIX.md` | 主链路回归矩阵 | Active |
| `ROADMAP_4W_MULTI_AGENT.md` | 阶段推进节奏与多 agent 路线图 | Active |

### 4. 历史问题复盘
| 文档 | 用途 | 当前状态 |
| --- | --- | --- |
| `PDF_RESUME_IMPORT_ROOT_CAUSE.md` | 历史 PDF 导入问题的根因复盘 | Historical |
| `UI_LIQUID_GLASS_UPGRADE_PLAN.md` | 历史 UI 升级方案草稿，供回溯参考 | Historical |

## 当前主链路口径
- 稳定主链路：`个人简历.pdf -> 个人简历.md -> 主简历.json -> 岗位 -> 面试准备包 -> 面试复盘`
- PDF 当前只作为导入源，不直接作为后续生成物证据源
- `/api/chat` 当前为纯文本流式代理
- 当前最推荐的线上部署形态是：
  - Web 版
  - 用户自填 API
  - 数据保存在浏览器本地 `IndexedDB`
  - 不做登录和云同步

## 给维护者的建议
- 每轮开发结束后，主控协作者必须更新 `SESSION_COMPACT.md`
- GitHub 发布前，至少同步检查：
  - `README.md`
  - `docs/README.md`
  - `docs/CHANGELOG-lite.md`
  - `docs/SESSION_COMPACT.md`
- 若文档说法与代码不一致，优先结合：
  - `BASELINE_ALIGNMENT_MATRIX.md`
  - `SESSION_COMPACT.md`

## 给新手的建议
- 想先把产品挂到线上，先看 [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)
- 想理解产品本身，先看 `Curator-AI-v3-产品规划.md`
- 想接手继续开发，先看 `SESSION_COMPACT.md`
