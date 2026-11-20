# Development

## Requirements

- Node.js 24
- npm 11 or newer

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The application runs at `http://localhost:3000`. The health endpoint is available at `http://localhost:3000/api/health`.

`AI_PROVIDER` defaults to `mock`; no external model credential is required for foundation development.

## Prototype data

Stages 3 and 4 store the active assignment in the current browser under `pacepal:app-state:v1`. Clearing site data removes it. Account-based cloud persistence is reserved for a later stage.

## Quality commands

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test:unit
npm run test:e2e
npm run build
```

The production build uses Next.js's supported Webpack mode so it remains compatible with restricted CI and development environments.

The browser suite uses the stable Google Chrome channel. With Chrome installed, run:

```bash
npm run test:e2e
```

## Environment variables

| Variable              | Exposure           | Purpose                                 |
| --------------------- | ------------------ | --------------------------------------- |
| `NEXT_PUBLIC_APP_URL` | Browser-safe       | Canonical application URL when deployed |
| `AI_PROVIDER`         | Server-only        | Selects `mock` or `openai` behavior     |
| `OPENAI_API_KEY`      | Server-only secret | Required only when `AI_PROVIDER=openai` |

Never prefix a secret with `NEXT_PUBLIC_`; Next.js includes such values in browser code.

## Vercel deployment

Production: [pace-pal-eta.vercel.app](https://pace-pal-eta.vercel.app)

1. Import the GitHub repository into Vercel.
2. Keep the detected framework as Next.js.
3. Add `AI_PROVIDER=mock` for the first deployment.
4. Set `NEXT_PUBLIC_APP_URL=https://pace-pal-eta.vercel.app` for Production.
5. Add server secrets only through Vercel environment settings.
6. Use Preview deployments for branches and Production for `main`.

The `.vercel` directory is local state and must not be committed.
