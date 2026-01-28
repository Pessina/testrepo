# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run dev` — Start dev server (Turbopack)
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — ESLint (flat config, ESLint 9)
- `npx tsc --noEmit` — TypeScript type check

No testing framework is configured yet.

## Architecture

Next.js 16 App Router project with TypeScript strict mode.

**Key config flags in `next.config.ts`:**
- `reactCompiler: true` — React Compiler 1.0 auto-memoizes components (no manual `useMemo`/`useCallback`/`React.memo`)
- `cacheComponents: true` — Explicit caching model; nothing is cached unless you add `"use cache"` directive. Use `cacheLife()` and `cacheTag()` for cache control.

**Stack:** React 19, Tailwind CSS v4 (PostCSS plugin), shadcn/ui (new-york style, configured via `components.json` but no components added yet), lucide-react icons.

**Path alias:** `@/*` maps to project root.

**Utilities:** `cn()` in `lib/utils.ts` merges Tailwind classes via `clsx` + `tailwind-merge`.

## Conventions

- React Compiler is enabled — never use `useMemo`, `useCallback`, or `React.memo`. The compiler handles memoization automatically.
- Add shadcn/ui components via `npx shadcn@latest add <component>`
- Tailwind v4 uses `@import "tailwindcss"` syntax in CSS (no `tailwind.config.js`)
- Theme colors use oklch format defined as CSS variables in `app/globals.css`
