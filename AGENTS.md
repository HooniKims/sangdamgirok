# Repository Guidelines

## Project Structure & Module Organization
This is a Next.js App Router project with TypeScript.

- `app/`: routes, layout, global styles, and API handlers (`app/api/summarize/route.ts` is currently deprecated and returns `410`).
- `components/`: client UI components (for example, `auth-guard.tsx`, `dashboard.tsx`).
- `lib/`: shared service setup (Firebase initialization in `lib/firebase.ts`).
- `utils/`: AI/Ollama API helpers and text post-processing logic.
- `types/`: shared TypeScript interfaces.
- `public/`: static assets.
- `local-llm-api-guide.md`: local LLM integration notes.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start local dev server at `http://localhost:3000`.
- `npm run build`: create production build.
- `npm run start`: run the production build locally.
- `npm run lint`: run ESLint (Next.js core-web-vitals + TypeScript rules).

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode enabled.
- Imports: use the `@/*` path alias (for example, `@/lib/firebase`).
- Components: file names are kebab-case, component names are PascalCase.
- Utilities/functions: camelCase; exported constants in UPPER_SNAKE_CASE only when truly constant.
- Follow existing formatting in touched files (current codebase is mostly 4-space indentation and double quotes).
- Run `npm run lint` before opening a PR.

## Testing Guidelines
There is no automated test script configured yet. For now:
- treat `npm run lint` as the minimum quality gate;
- perform manual smoke checks for login, consultation CRUD flows, and AI summary generation.

When adding tests, prefer `*.test.ts` / `*.test.tsx` naming and colocate with source files or in `__tests__/`.

## Commit & Pull Request Guidelines
Recent history uses conventional prefixes (`feat:`, `fix:`, `chore:`) plus concise summaries. Follow:
- `type: short imperative summary` (example: `feat: add model selection dropdown`).

PRs should include:
- purpose and scope;
- key file/path changes;
- environment variable changes (if any);
- screenshots/GIFs for UI updates;
- linked issue/task and verification steps.

## Security & Configuration Tips
- Keep secrets only in `.env.local`; never commit `.env*` files.
- Verify required Firebase and Ollama `NEXT_PUBLIC_*` variables are set before running locally.
