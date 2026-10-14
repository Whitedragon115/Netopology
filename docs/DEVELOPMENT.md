# Development

> For contributors. End-user installation docs come later.

## Frontend (repo root)

Requirements: Node 24+, pnpm 11+.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

The default `.env.development` uses the real Go API at `http://localhost:3100`. Next.js serves the
frontend on `http://localhost:3000` and proxies `/api/v1/*` to that backend. Set
`NEXT_PUBLIC_API_MOCKING=enabled` in `.env.development.local` to use the seeded browser mock (MSW)
for UI development. The mock resets on reload.

The mock has real sign-in. Accounts: `alice` (owner), `chen` (editor), `eve` (viewer), all with the password
`netopology-demo`; `bob` and `dana` are Google/Discord-only, so password sign-in refuses them, as a real server would.
Shortcuts (the session is remembered in the browser):

| URL | Does |
|-----|------|
| `?as=owner`, `?as=editor`, `?as=viewer` | Sign in instantly as alice / chen / eve |
| `?mock=fresh` | Pretend the server is empty: shows first-run setup. The account you create replaces alice. |

Only one `next dev` can run per folder. To check a change in a second browser while your dev server runs, use a mock-enabled
production build: `NEXT_PUBLIC_API_MOCKING=enabled pnpm build && pnpm start --port 3001`.

For the real backend, set in `backend/.env`:

```
NETOPOLOGY_ADDR=:3100
NETOPOLOGY_PUBLIC_URL=http://localhost:3000
```

Then run `go tool task dev` from `backend/` and `pnpm dev` from the repo root. Configure the
backend database URLs and secret key as described in [backend/docs/ENVIRONMENT.md](../backend/docs/ENVIRONMENT.md).

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (`output: standalone`) |
| `pnpm typecheck` | TypeScript, strict |
| `pnpm lint` | ESLint (Next core-web-vitals + TypeScript rules) |
| `pnpm gen:api` | Regenerate `lib/api/schema.d.ts` from `backend/api/contract.yaml` (never edit the generated file) |
| `pnpm check:contrast` | WCAG contrast check of the design tokens |

## Where things are

See [CONVENTIONS.md §2](CONVENTIONS.md). In short: `app/` routes, `features/` feature folders (canvas, panel, detail,
sections, command, workspace), `components/` shared UI, `lib/` API client and domain vocabulary, `styles/tokens.css`
design tokens, `mocks/` the mock API.

## Backend

Lives in the `backend/` git submodule (separate repository). Clone with `git clone --recurse-submodules`, or run
`git submodule update --init` after cloning. Setup, tasks and environment variables:
[backend/docs/ENVIRONMENT.md](../backend/docs/ENVIRONMENT.md). Short version (needs Go 1.26 and Docker):

```bash
cd backend
go tool task setup
go tool task db:up
go tool task dev        # api on the address in backend/.env (:3100 for frontend development)
```

## Full stack in Docker

```bash
cp .env.example .env    # fill in the secrets
docker compose up -d --build
```

Opens on http://localhost: nginx routes `/api` to the Go api and everything else to the web app. Only the gateway
publishes a port; the database sits on an internal network (IDEA.md §14).
