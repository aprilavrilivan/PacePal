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

PacePal calls only `deepseek/deepseek-v4.1-flash-1017` through Vercel AI Gateway. Vercel deployments authenticate with OIDC; local live-model testing requires a server-only `AI_GATEWAY_API_KEY`. Without a credential, the application reports that the model is unavailable. Automated browser tests intercept the AI endpoints with test-only fixtures.

## Data storage

Signed-out plans are stored in the current browser under `pacepal:app-state:v1`. After passwordless email sign-in, the first local plan is migrated to Supabase and subsequent changes are synchronized to the authenticated user's row. A user-owned local cache is cleared on sign-out and is never shown to a different account.

Apply `supabase/migrations/202611200001_create_pacepal_states.sql` to each Supabase project before enabling the public credentials.

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

| Variable                               | Exposure           | Purpose                                   |
| -------------------------------------- | ------------------ | ----------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Browser-safe       | Canonical application URL when deployed   |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser-safe       | Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe       | Supabase publishable key protected by RLS |
| `AI_GATEWAY_API_KEY`                   | Server-only secret | Optional key for local gateway testing    |

Never prefix a secret with `NEXT_PUBLIC_`; Next.js includes such values in browser code.

Live planning sends the assignment, current plan, and recent planning conversation to DeepSeek V4.1 Flash 1017 through AI Gateway. Do not submit confidential or highly sensitive content.

## Vercel deployment

Production: [pace-pal-eta.vercel.app](https://pace-pal-eta.vercel.app)

1. Import the GitHub repository into Vercel.
2. Keep the detected framework as Next.js.
3. Vercel uses its OIDC-authenticated AI Gateway connection; no model-selection environment variable is used.
4. Set `NEXT_PUBLIC_APP_URL=https://pace-pal-eta.vercel.app` for Production.
5. Add server secrets only through Vercel environment settings.
6. Use Preview deployments for branches and Production for `main`.

The `.vercel` directory is local state and must not be committed.
