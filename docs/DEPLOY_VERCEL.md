# Curator AI 部署到 Vercel（新手版）

> 目标：把 Curator AI 挂到线上，用户打开网页即可使用；用户自己填写 API Key，你不用先做账号系统或后端数据库。

## 这套方案适合谁
- 你是电脑小白，希望先把产品变成一个“可打开的网址”
- 你不想先搭数据库、登录系统、用户管理
- 你不想自己承担所有用户的模型费用

## 这套方案能做到什么
- 用户免安装，直接打开网站
- 用户首次进入后，在 `AI配置` 里填写自己的 API 信息
- 用户可以在线完成：
  - 导入 PDF 简历
  - 生成 `个人简历.md`
  - 保存 `主简历.json`
  - 新建岗位
  - 生成匹配分析 / 准备包 / 复盘

## 这套方案做不到什么
- 不支持账号登录
- 不支持云同步
- 不支持跨设备自动继承数据
- 用户清空浏览器缓存后，本机数据会丢失

所以当前对外说明建议是：
- “免安装在线使用”
- “数据默认保存在当前浏览器”
- “用户需自备 API Key”

## 为什么推荐 Vercel
- 它对 Next.js 最友好
- 不需要你手动装 Nginx、PM2、Node 服务守护
- GitHub 仓库接入后，部署步骤最少
- 适合先验证产品，不适合一开始就上重运维方案

## 你需要准备什么
1. 一个 GitHub 仓库
2. 一个 Vercel 账号
3. 已经成功发布到 GitHub 的 `public` 分支

当前仓库的公开发布脚本：
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator-public.ps1
```

如果只想先预演：
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator-public.ps1 -DryRun
```

## 推荐的最简单上线步骤

### 第 1 步：确保公开代码已经在 `public` 分支
你已经可以使用：
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator-public.ps1
```

这个脚本会自动：
- 跑 `pnpm build`
- 扫描敏感信息
- 只发布公开需要的代码和文档
- 排除内部协作文档和隐私文件

### 第 2 步：注册并登录 Vercel
- 打开 [Vercel](https://vercel.com/)
- 用 GitHub 账号登录最省事

### 第 3 步：导入 GitHub 仓库
- 在 Vercel 点击 `Add New... -> Project`
- 选择你的 GitHub 仓库
- 导入项目

### 第 4 步：部署时选择 `public` 分支
- 在 Vercel 的项目配置里，把部署分支选成 `public`
- Framework 选择通常会自动识别为 `Next.js`
- 构建命令默认就是：
  - `pnpm build`
- 安装命令默认是：
  - `pnpm install`

### 第 5 步：先直接部署
第一次部署通常不用额外改环境变量，因为：
- 当前模型 API 是用户在浏览器里自己配置
- 不是你在服务器上统一存放平台 API Key

### 第 6 步：打开默认域名测试
部署成功后，Vercel 会给你一个默认网址，例如：
- `your-project.vercel.app`

你要亲自测试这些步骤：
1. 打开网站
2. 进入 `AI配置 / 模型配置.json`
3. 填写自己的 `provider / model / baseURL / apiKey`
4. 点击验证连接
5. 导入一份文本型 PDF
6. 生成 `个人简历.md`
7. 保存 `主简历.json`
8. 新建岗位
9. 生成匹配分析 / 准备包 / 复盘

### 第 7 步：确认再绑定域名
如果默认域名没问题，再考虑绑定自己的域名。

## 当前版本下，用户如何使用 API

### 用户应该怎么做
用户首次进入网站后：
1. 打开 `AI配置`
2. 选择模型供应商
3. 填写：
   - `provider`
   - `model`
   - `baseURL`
   - `apiKey`
4. 点击“验证连接”
5. 成功后开始使用

### 你不应该怎么做
当前阶段不要：
- 把你自己的 API Key 写死进代码
- 在服务器上统一帮所有用户代付模型调用
- 为了省事把真实密钥提交进仓库

## 上线前检查清单

### 构建检查
```bash
pnpm build
```

### 公开发布预演
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\publish-curator-public.ps1 -DryRun
```

### 手动功能回归
至少跑一遍：
- 打开网站
- 填 API
- 验证连接
- 导入 PDF
- 保存主简历
- 新建岗位
- 生成匹配分析
- 生成准备包
- 生成复盘

### 浏览器数据特性验证
- 刷新页面后，本机浏览器数据仍在
- 新开无痕窗口时，不继承原数据
- 换浏览器或换电脑时，不会自动同步

## 如果未来要升级成更正式的 SaaS
等你确认真的有用户持续使用后，再考虑：
- 平台统一 API
- 登录系统
- 云数据库
- 跨设备同步
- 用户配额和限流

这不是当前第一阶段必须做的。

## 一句话建议
现在最适合你的路线不是“做完整 SaaS”，而是：

**先把 Curator AI 部署成一个 Vercel 上可访问的网址，用户自己填 API，然后用真实用户验证产品是否值得继续做大。**
