# PacePal

PacePal is a web-based AI study companion for university students who need help starting, planning, and completing complex academic assignments.

Its core product loop is:

> Conversational task decomposition → deterministic scheduling → context-aware next-step recommendation → progress tracking → dynamic rescheduling

The companion pet is a gentle interaction layer across that loop. PacePal is a planning and execution aid, not an academic assignment generator.

## Project status

**Stage 6 complete: live AI task planning**

The deployed app supports assignment creation, AI-powered task decomposition, validated editable plans, deterministic fallback planning and scheduling, progress updates, passwordless email sign-in, and user-isolated cloud persistence.

Live site: [pace-pal-eta.vercel.app](https://pace-pal-eta.vercel.app)

## Current workflow

1. Create one active assignment.
2. Review and edit the generated task breakdown.
3. Set daily study time and approve the schedule.
4. View the next action, task list, and daily plan.
5. Complete tasks without losing progress after a refresh.
6. Sign in to migrate the local plan and use it on another device.

## Technology

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Zod environment validation
- Zod plan and persisted-state validation
- Supabase Auth, Postgres, and row-level security
- Claude Fable 5.2 task planning through Vercel AI Gateway
- Deterministic scheduling engine
- Vitest and Testing Library
- Playwright
- GitHub Actions
- Vercel deployment from the `main` branch

## Start locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

See [development and deployment](docs/development.md) for the complete setup.

## Product baseline

- [MVP scope](docs/mvp-scope.md)
- [MVP user flows](docs/mvp-user-flows.md)
- [MVP acceptance checklist](docs/mvp-acceptance-checklist.md)
- [Product decision log](docs/product-decisions.md)

## MVP release rule

PacePal is not considered an MVP merely because its screens are present. It must complete the end-to-end workflow in the acceptance checklist using persisted user data and functional controls.
