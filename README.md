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

`PDF (selectable text) -> text extraction -> ????.md -> ??? JSON / ???? / ??? / ??`

## Quick start

```bash
pnpm install
pnpm dev
```

## Build check

```bash
pnpm build
```

## Security note

- API Keys are configured locally in the browser during use.
- Do not commit `.env.local`, exported personal data, screenshots, or local debug logs.

## License

MIT
