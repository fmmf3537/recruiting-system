# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` for comprehensive project documentation (code standards, test policies, deployment details).

## Quick Commands

```bash
# Root level
pnpm dev              # Start client + server concurrently
pnpm build            # Build all packages (server → client → mobile)
pnpm lint             # Lint all packages
pnpm format           # Format all packages

# Server (cd server)
pnpm dev              # tsx watch src/index.ts (port 3001)
pnpm test             # vitest run (maxConcurrency: 1, pool: forks)
pnpm test:watch       # vitest in watch mode
pnpm test:coverage    # Coverage targeting src/services/ (lines ≥80%, branches ≥75%)
pnpm db:migrate       # prisma migrate dev
pnpm db:generate      # prisma generate
pnpm db:seed          # Seed sample data
pnpm db:studio        # prisma studio

# Client (cd client, port 5173)
pnpm dev              # vite dev
pnpm build            # vite build → dist/
pnpm lint             # ESLint auto-fix
pnpm type-check       # vue-tsc --noEmit

# Mobile (cd mobile, port 5174)
pnpm dev              # vite dev
pnpm build            # vite build → dist/
pnpm test:unit        # vitest run
```

## Architecture

Monorepo with pnpm workspaces: `client`, `server`, `mobile`.

### Server (Express + TypeScript, ES Modules)

**3-layer architecture**: Routes → Controllers → Services

- **Routes** (`src/routes/`): Define HTTP method, wire middleware (auth, validation, rate-limit, multer), delegate to controller. Zod schemas defined inline in route files.
- **Controllers** (`src/controllers/`): Extract params from `req`, call service, format response. Never contain business logic.
- **Services** (`src/services/`): Pure business logic + Prisma queries. This is the primary target for unit tests.
- **Middleware** (`src/middleware/`):
  - `auth.ts`: `authenticate` decodes JWT and attaches `req.user` (userId, email, role). `authorize('admin')` checks role.
  - `validate.ts`: `validate(schema, 'body'|'query'|'params')` validates with Zod. `validateAll({body, query, params})` for multi-source.
  - `errorHandler.ts`: `asyncHandler(fn)` wraps async routes to catch errors. `AppError` class for custom HTTP errors. Prisma error codes mapped (P2002→409, P2025→404, etc.).
- **Lib** (`src/lib/`): Infrastructure — `prisma.ts` (singleton), `env.ts` (Zod-validated env vars), `redis.ts`, `queue.ts` (BullMQ for async resume parsing), `llm.ts`.
- **Workers** (`src/workers/`): BullMQ worker for resume parsing (PDF/DOCX).

**Response format**: All API responses use `{ success: boolean, data?, error?, code?, pagination? }`. Status codes are set on the response object, not inside the JSON body for the top-level.

**Auth flow**: Stateless JWT. Client sends `Authorization: Bearer <token>`, middleware decodes and injects `req.user`. Role-based access via `authorize('admin')`.

### Client (Vue 3 + Element Plus + Pinia)

- **Router** (`src/router/`): Route guards check login and admin permissions via `authStore`. `meta.public` bypasses auth, `meta.requireAdmin` enforces admin role.
- **Stores** (`src/stores/`): `auth.ts` manages token (localStorage), user info, login/logout. `dictionary.ts` for dictionary cache.
- **API** (`src/api/`): Axios instance (`request.ts`) with interceptors for auth header injection and error handling (401→redirect to login).
- **Views** (`src/views/`): Page components organized by domain (candidates, jobs, offers, dashboard, settings).

### Mobile (Vue 3 + Vant 4 + Pinia, Feishu H5)

Same architecture as client but with Vant 4 UI components and Feishu JSAPI integration.
- **Feishu** (`src/lib/feishu.ts`): SDK accessed via `window.tt` / `window.h5sdk` (loaded from CDN in index.html). Wraps auth code retrieval, sharing, document preview, navigation bar control.
- **Router**: Uses `meta.showTabBar` to control bottom tab bar visibility.

### Database (PostgreSQL + Prisma)

Key models in `server/prisma/schema.prisma`:
- `User` (admin/member roles, optional Feishu binding)
- `Job` (title, departments JSON, type, status)
- `Candidate` (name, contacts, education, skills JSON, with `WorkHistory` relation)
- `CandidateJob` (M:N join to Job)
- `StageRecord` (7 hiring stages: 入库→初筛→复试→终面→拟录用→Offer→入职, each with status)
- `InterviewFeedback` (by round: 初试/复试/终面)
- `Offer` (salary, result, join tracking)
- `Tag`, `Dictionary`, `EmailTemplate`, `EmailLog`, `OnboardingTask`, `OperationLog`

## Key Conventions

- **Path aliases**: Always use `@/`, `@services/`, `@controllers/`, `@middleware/`, etc. Never deep relative paths.
- **Naming**: Files/dirs in kebab-case, Vue components PascalCase, DB tables `snake_case` via `@@map()`.
- **Comments**: Chinese for business logic explanations.
- **ES Modules**: Both server and client use `"type": "module"`. Server imports use `.js` extension (TypeScript resolves `.ts`).
- **Server route pattern**: `router.METHOD('/path', middleware1, middleware2, controller.method)` — routes never contain logic, only middleware wiring.
- **Controller method signature**: `(req: Request, res: Response, next: NextFunction) => Promise<void>` — must call `next(error)` on exceptions.
- **Zod schemas**: Defined in route files, applied via `validate(schema, source)` middleware.

## Testing

- Server unit tests mock Prisma via `vitest.mock()` in `tests/utils/setup.ts`. Mock every Prisma model method used.
- Server integration tests use supertest with mocked Prisma (same mock strategy).
- Test DB connection is mocked — no real database needed for tests.
- Mobile tests use vitest with `globals: true` (similar to server).
