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
- `planning/live-model.ts` is the configurable Gemini/AI Gateway adapter with bounded retries and timeouts.
- `planning/mock-model.ts` provides deterministic credential-free behavior for development and tests.
- `planning/engine.ts` materializes initial plans and atomically applies plan operations.
- `planning/service.ts` coordinates provider selection, validation, and safe fallback behavior.
- `planning/client.ts` validates API responses and merges only backend-validated plan snapshots.

## Initial planning

The live model returns phases containing draft tasks. Each draft task has a temporary semantic identifier, title, description, completion criterion, estimated minutes, difficulty, priority, and dependencies. The engine rejects duplicate identifiers, missing dependencies, self-dependencies, cycles, invalid durations, and unreasonable plan sizes before assigning stable saved IDs.

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

Deletion and merging require an explicit confirmation state. Contradictory progress reports and ambiguous destructive requests return a conversational clarification with no operations.

## Failure behavior

Initial-plan provider failures return a validated deterministic proposal so the user can still start. Refinement failures are fail-closed: PacePal returns the existing validated plan and a brief retry message. It never applies a heuristic mutation after a live-model failure.

The provider adapter classifies authentication, configuration, quota, timeout, unavailable-model, unavailable-service, and invalid-output failures. Logs redact credentials.

## Persistence boundary

The AI endpoints return a complete validated plan snapshot, not an untrusted patch. The existing application-state layer persists that snapshot in browser storage for signed-out users or the user's RLS-protected Supabase row after sign-in. Recent conversation, current statuses, plan version, and change history therefore survive later planning turns without relying on model memory.
