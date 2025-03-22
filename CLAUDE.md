# Padlox Development Guide

## Commands
- Run dev server: `pnpm dev`
- Build: `pnpm build`
- Lint: `pnpm lint`
- Run all tests: `pnpm test`
- Run single test: `pnpm test path/to/test.test.tsx`
- E2E tests: `pnpm test:e2e`
- Test coverage: `pnpm test:coverage`

## Code Style
- **Framework**: Next.js 15 with App Router
- **Typescript**: Use strict typing with explicit interface definitions
- **Components**: Use React Server Components by default, add "use client" when needed
- **Styling**: TailwindCSS with shadcn/ui components and `cn` utility for conditionals
- **Imports**: Use '@/' alias (e.g., @/components, @/lib)
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error Handling**: Use error.tsx files and typed error classes
- **API Routes**: Follow /app/api/[route]/route.ts pattern
- **Git**: Use conventional commits format (feat, fix, docs, etc.)

Follow Cursor rules in .cursor/rules/ for more specific guidelines.