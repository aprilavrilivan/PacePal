# AI planning backend

PacePal separates language-model reasoning from plan state management.

```text
user input
  -> validated API request
  -> planning model decision
  -> strict typed operations
  -> atomic deterministic plan engine
  -> dependency and invariant validation
  -> validated plan snapshot
  -> local or user-isolated cloud persistence
```

The model can interpret language, propose a useful decomposition, classify conversational intent, and recommend plan changes. It cannot write arbitrary JSON directly into saved state. The backend owns IDs, completed-work protection, dependency consistency, plan versions, and failure behavior.

## Modules

- `planning/contracts.ts` defines the model and API contracts.
- `planning/prompts.ts` contains versioned Chinese/English planning prompts.
- `planning/live-model.ts` calls DeepSeek V4.1 Flash 1017 once through AI Gateway with a hard timeout.
- `planning/engine.ts` materializes initial plans and atomically applies plan operations.
- `planning/service.ts` coordinates model output validation and plan materialization.
- `planning/client.ts` validates API responses and merges only backend-validated plan snapshots.

## Initial planning

The live model first decides whether the objective and deliverable are specific enough to plan. If a critical detail is missing, it returns one focused clarification question and no tasks; the interface keeps the creation form open and does not persist a fabricated assignment. Otherwise it returns phases containing draft tasks. Each draft task has a temporary semantic identifier, title, description, completion criterion, estimated minutes, difficulty, priority, and dependencies. The engine rejects duplicate identifiers, missing dependencies, self-dependencies, cycles, invalid durations, and unreasonable plan sizes before assigning stable saved IDs.

Initial plans record version 1 and an initial history entry. The flat `subtasks` array remains compatible with the scheduler and current interface, while each generated task retains its phase label.

## Conversational refinement

Supported operations are:

- status updates and explicit reopening;
- task updates, additions, deletions, splitting, and merging;
- task reordering and phase renaming;
- dependency updates through task patches;
- assignment and availability changes;
- deterministic schedule recalculation requests.

The model receives the saved assignment, full task state, execution status, availability, and recent conversation. It is instructed to make the smallest sufficient change and preserve unaffected IDs.

The engine applies the entire operation batch to a clone. Any invalid reference, dependency cycle, completed-task rewrite, duplicate new-task identifier, or no-op mutation rejects the whole batch. The source plan is never partially mutated. A successful data change increments `planVersion` and appends an operation summary to `planHistory`.

Deletion and merging require an explicit confirmation state. Contradictory progress reports and ambiguous destructive requests return a conversational clarification with no operations. Pure progress updates cannot add or rewrite tasks. An infeasible availability change reports the numeric shortfall and waits for the user to choose a tradeoff instead of silently shrinking the work.

## Failure behavior

There is no live-model fallback chain. Production makes one request to `deepseek/deepseek-v4.1-flash-1017` with SDK retries disabled. Any provider, quota, timeout, or invalid-output failure returns HTTP 503 with `model_unavailable`; the interface shows that message and does not create or modify a plan.

There is no runtime mock provider. Automated tests use test-only HTTP fixtures, so a deployment cannot silently produce a synthetic plan because of an environment-variable mistake.

The provider adapter classifies failures for private diagnostics and redacts credentials from logs. This classification never triggers another model request.

## Persistence boundary

The AI endpoints return a complete validated plan snapshot, not an untrusted patch. The existing application-state layer persists that snapshot in browser storage for signed-out users or the user's RLS-protected Supabase row after sign-in. Recent conversation, current statuses, plan version, and change history therefore survive later planning turns without relying on model memory.
