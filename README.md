# Curator AI v3.1.0

Curator AI is an AI-powered job search workspace for students in Mainland China, focused on resume management, job application materials, interview prep, and review.

## What is included in this public branch

This branch contains only the runnable application code and the minimum files required to start the project locally.

## Tech baseline

- Next.js 14
- React 18
- TypeScript 5
- Tailwind CSS v3
- Zustand
- Dexie

## Core resume pipeline

PDF (selectable text) -> text extraction -> 个人简历.md -> 主简历 JSON / 岗位生成 / 准备包 / 复盘

## Quick start

`ash
pnpm install
pnpm dev
`

The app can start with Node.js 18+ and pnpm only.

## PDF import note

- Only selectable-text PDFs are supported.
- Scanned or image-only PDFs are not supported in the current version.
- No Python or MarkItDown setup is required.

## Build check

`ash
pnpm build
`

## Security note

- API Keys are configured locally in the browser during use.
- Do not commit .env.local, exported personal data, screenshots, or local debug logs.

## License

MIT