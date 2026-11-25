# PacePal

PacePal is a web-based AI study companion for university students who need help starting, planning, and completing complex academic assignments.

Its core product loop is:

> Conversational task decomposition → deterministic scheduling → context-aware next-step recommendation → progress tracking → dynamic rescheduling

The companion pet is a gentle interaction layer across that loop. PacePal is a planning and execution aid, not an academic assignment generator.

## Project status

**Stage 8 complete: collaborative planning workspace**

The deployed app supports assignment creation, AI-powered task decomposition, conversational plan refinement, validated editable plans, time-and-energy check-ins, context-aware next-step recommendations, execution tracking, deadline-risk warnings, dynamic rescheduling, passwordless email sign-in, and user-isolated cloud persistence.

Live site: [pace-pal-eta.vercel.app](https://pace-pal-eta.vercel.app)

## Current workflow

1. Create one active assignment.
2. Review and edit the generated task breakdown.
3. Set daily study time and approve the schedule.
4. Report the time and energy available right now.
5. Start, pause, complete, postpone, or unblock the recommended task.
6. Lock important time blocks or move them while the remaining plan adjusts.
7. Ask the AI assistant to split tasks, change availability, or rebalance the plan.
8. Sign in to keep progress and planning conversations across devices.

## Technology

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Zod environment validation
- Zod plan and persisted-state validation
- Supabase Auth, Postgres, and row-level security
- DeepSeek V4.1 Flash 1017 task planning through Vercel AI Gateway
- Strict, versioned plan-operation protocol with deterministic validation
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
- [AI planning backend](docs/ai-planning-backend.md)

## MVP release rule

PacePal is not considered an MVP merely because its screens are present. It must complete the end-to-end workflow in the acceptance checklist using persisted user data and functional controls.
