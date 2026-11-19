# PacePal

PacePal is a web-based AI study companion for university students who need help starting, planning, and completing complex academic assignments.

Its core product loop is:

> Conversational task decomposition → deterministic scheduling → context-aware next-step recommendation → progress tracking → dynamic rescheduling

The companion pet is a gentle interaction layer across that loop. PacePal is a planning and execution aid, not an academic assignment generator.

## Project status

**Stage 2 complete: web foundation**

The repository contains the agreed MVP baseline and a deployable Next.js foundation with mock-first environment configuration, automated quality checks, unit tests, browser tests, and a health endpoint.

Live site: [pace-pal-eta.vercel.app](https://pace-pal-eta.vercel.app)

## Technology

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Zod environment validation
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
