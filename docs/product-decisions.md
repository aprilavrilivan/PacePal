# PacePal Product Decision Log

These decisions convert the product brief into an implementation boundary. Changes should be recorded here so product scope does not drift silently.

## PD-001 — Web-first delivery

**Decision:** The initial product is a browser-based web application deployed from GitHub through a web hosting platform. Native desktop packaging is not part of the MVP.

**Reason:** Browser access minimizes adoption friction and supports rapid iteration. The pet will initially live inside the web interface.

## PD-002 — One active assignment acceptance scope

**Decision:** MVP acceptance focuses on one substantial active assignment per user. The architecture should not prevent multiple assignments later, but cross-assignment scheduling is excluded.

**Reason:** This matches the PRD's initial focus and keeps scheduling behavior testable.

## PD-003 — Final MVP includes minimal rescheduling, risk, and pet

**Decision:** Dynamic rescheduling, deadline-risk communication, and an in-app pet are required for the final MVP in their smallest functional forms.

**Reason:** They are present in the PRD's successful end-to-end scenario and distinguish PacePal from a generic task manager.

## PD-004 — LLM and scheduler are separate components

**Decision:** The LLM interprets natural language, asks clarifying questions, and proposes task structures. A deterministic engine owns scheduling, dependency enforcement, capacity checks, and deadline risk.

**Reason:** Calendar constraints must be reliable, reproducible, and independently testable.

## PD-005 — AI plans require approval

**Decision:** AI-generated subtasks and material schedule revisions remain proposals until the user approves or edits them.

**Reason:** PacePal is a collaborative planner, and the student retains control.

## PD-006 — Planning assistance, not academic generation

**Decision:** The MVP may interpret requirements, organize work, suggest approaches, and help unblock a task. Producing a complete academic submission is outside the product purpose.

**Reason:** The product supports student agency and academic integrity.

## PD-007 — Demo mode is a release requirement

**Decision:** A deterministic mock AI provider must allow the complete workflow to be tested without external model credentials.

**Reason:** Development, automated testing, review, and fallback behavior must not depend on a live paid service.

## PD-008 — In-app reminders only for MVP

**Decision:** MVP reminders appear inside PacePal. Browser push, email, SMS, and operating-system notifications are deferred.

**Reason:** In-app reminders prove the product interaction without introducing background permissions and delivery infrastructure.

## PD-009 — User-local time is authoritative

**Decision:** Deadlines, availability, recommendations, and schedule blocks are interpreted in the user's configured timezone and stored in an unambiguous format.

**Reason:** Scheduling behavior becomes unreliable if browser, server, and database time assumptions diverge.

## PD-010 — Minimal, function-first interface

**Decision:** PacePal uses a minimal visual system and concise interface copy. Screens use one page title without a routine explanatory subtitle, one dominant primary action, and only the information required to act or understand essential state. Decorative elements and repetitive helper text are excluded.

**Reason:** PacePal should reduce cognitive load for students who already feel overwhelmed. Visual noise, nested headings, excessive cards, and explanatory small print would work against that purpose.

**Boundary:** Necessary labels, validation, error recovery, accessibility text, recommendation reasons, and security or consent information remain required, but must be expressed directly and briefly.

## PD-011 — Local-first persistence for stages 3 and 4

**Decision:** The first functional planning workflow stores one active assignment in browser local storage. Mock AI planning and deterministic scheduling remain fully usable without an account or external credential.

**Reason:** This validates assignment creation, plan approval, scheduling, progress, and interface structure before adding authentication and database infrastructure.

**Boundary:** Browser-local data is device-specific and does not satisfy the final MVP's account persistence or user-isolation requirements. It must be migrated to authenticated cloud storage in a later stage.

## PD-012 — Passwordless account and cloud persistence

**Decision:** Stage 5 uses Supabase passwordless email authentication and one JSONB application-state row per user. PostgreSQL row-level security restricts every read and write to `auth.uid() = user_id`.

**Reason:** Passwordless email keeps the account flow small while Supabase provides managed sessions, durable Postgres storage, and database-level user isolation on the free tier.

**Boundary:** Signed-out work remains browser-local. On first sign-in it is migrated only when the account has no cloud state. Existing cloud data always takes precedence, preventing an old device from silently overwriting another device's plan.

## PD-013 — Nemotron 3.5 Lightning Free for live task planning

**Decision:** Stage 6 uses NVIDIA Nemotron 3.5 Lightning Free through Vercel AI Gateway. The model returns schema-constrained task data, which PacePal validates before showing it. Vercel production authenticates with its short-lived OIDC token, so PacePal stores no persistent model API key. Scheduling remains deterministic and separate from the model.

**Reason:** It is a capable reasoning model with an explicitly free Vercel endpoint, a one-million-token context window, fast generation, and structured output support. This keeps the core planning flow usable without paid model usage.

**Boundary:** The free endpoint is a trial service, and NVIDIA may retain prompts and responses for product improvement. Users must not enter personal, confidential, or sensitive information. Model availability, rate-limit, or output failures fall back to the deterministic plan without erasing user input. No model credential is exposed to the browser.

## PD-014 — Deterministic execution recommendations

**Decision:** The next task is selected from dependency-ready work using the user's current time and energy. Active and paused work is favored, tasks that fit the available window and energy are preferred, and an oversized task may be recommended as a partial work session.

**Reason:** Execution guidance must react immediately, remain predictable, and continue working when the AI service is unavailable.

## PD-015 — Rescheduling preserves explicit commitments

**Decision:** Completing, postponing, blocking, or moving work rebuilds the remaining schedule. Locked blocks are retained, completed tasks are removed, blocked dependency chains remain unscheduled, and any deadline-capacity shortfall is shown directly.

**Reason:** Dynamic plans are only useful when they adapt without silently moving commitments the user chose to protect.

## PD-016 — Restrained premium visual system

**Decision:** The interface uses cool neutral surfaces, precise spacing, restrained blue state accents, high-contrast primary actions, and subtle depth. Decorative illustration, gradients used as content, redundant subtitles, and explanatory microcopy remain excluded.

**Reason:** A refined visual hierarchy can increase trust and clarity without adding cognitive load or departing from the minimal product boundary.

## PD-017 — Workspace-first information architecture

**Decision:** The active assignment uses a persistent workspace with four destinations: overview, tasks, AI assistant, and schedule. The overview concentrates progress, the recommended next action, current capacity, and today's plan; secondary editing remains outside the primary path.

**Reason:** A stable workspace makes the product feel complete and navigable without adding unrelated dashboards, rewards, statistics, or decorative features.

## PD-018 — Conversational refinement updates the real plan

**Decision:** AI refinement returns a schema-validated complete task proposal and availability. PacePal preserves execution records for unchanged task IDs, validates dependencies, rebuilds the deterministic schedule, and persists the conversation with the assignment.

**Reason:** Chat is useful only when it can safely change the plan the student is actually executing. Keeping scheduling deterministic preserves predictable deadlines and locked commitments.
