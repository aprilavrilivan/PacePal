# PacePal Web MVP Scope

**Status:** Stage 8 collaborative workspace baseline

**Date:** 2026-11-21

**Platform:** Browser-based web application

## 1. Product objective

The MVP helps a university student turn one complex course assignment into a realistic, adaptable execution plan. It lowers the effort required to start, recommends a suitable next action, records real progress, and repairs the plan when reality changes.

The product is successful only when the following loop works as one connected experience:

1. Understand the assignment.
2. Break it into manageable subtasks.
3. Let the student review and approve the plan.
4. Schedule the work around real availability and dependencies.
5. Recommend an appropriate action for the current moment.
6. Record completion, actual time, postponement, or difficulty.
7. Recalculate the remaining schedule and communicate deadline risk.

## 2. Target user and initial use case

The primary user is a university student who has a substantial writing-intensive assignment and struggles with one or more of the following:

- turning broad requirements into concrete actions;
- beginning an intimidating task;
- deciding what to work on today;
- adapting a plan after missing a session;
- maintaining progress without guilt-heavy reminders.

The release acceptance scenario is one course paper due in approximately ten days. The data model may support multiple assignments later, but the MVP interface and scheduling acceptance criteria focus on one active assignment at a time. Cross-assignment workload optimization is not part of this release.

## 3. Product principles

Every MVP feature must follow these rules:

- **Student control:** AI output remains editable and requires user approval.
- **Small next step:** When a user is overwhelmed, prefer one achievable action over a long instruction list.
- **Honest planning:** Never hide unallocated work or promise an infeasible deadline.
- **Explainability:** Recommendations and schedule changes include a short reason.
- **Non-judgmental language:** Missed work triggers replanning, not blame.
- **Academic integrity:** PacePal supports planning and execution; it does not produce an entire assignment as its primary function.
- **Quiet companionship:** The pet helps users access the workflow without becoming a distraction.

## 4. In-scope capabilities

### 4.1 Account and persistence

- Email-based sign-in suitable for a web MVP.
- Persistent storage of the user's profile, assignment, subtasks, availability, schedule, study sessions, and relevant AI conversation context.
- User-level authorization so one user cannot access another user's data.
- User timezone stored and used consistently for deadlines and schedules.

### 4.2 Assignment management

- Create, read, edit, and delete an assignment.
- Store title, description, requirements, expected deliverable or word count, deadline, and priority.
- Display overall progress and the next deadline.
- Create, edit, reorder, and delete subtasks.
- Store each subtask's title, description, estimated duration, completion criteria, difficulty, dependencies, and status.

### 4.3 Conversational AI planning

- Ask focused clarification questions when essential information is missing.
- Generate a structured task breakdown rather than prose-only advice.
- Suggest multiple manageable next actions when useful.
- Further decompose a difficult subtask.
- Preserve relevant assignment and progress context.
- Refine the active task list and availability through a persistent conversation.
- Validate structured model output before displaying or saving it.
- Require explicit user confirmation before a generated plan becomes active.
- Provide a deterministic mock mode when no AI credential is configured.

### 4.4 Availability and initial scheduling

- Capture recurring or date-specific study availability.
- Capture preferred study periods and a simple energy profile.
- Generate an initial schedule from deadline, dependencies, durations, availability, priority, and energy suitability.
- Prevent required dependencies from being scheduled out of order.
- Allow the user to adjust or lock a scheduled block.
- Identify work that could not be allocated.

### 4.5 Context-aware next-step recommendation

- Ask how much time the user has and their current energy level.
- Only recommend eligible work whose required dependencies are complete.
- Consider urgency, difficulty, duration, energy, and recent progress.
- Show one primary recommendation, its estimated duration, completion criteria, and a concise reason.
- Let the user start it, choose another task, postpone it, or ask for help.

### 4.6 Execution and progress

- Start, pause, resume, complete, postpone, or mark a subtask as blocked.
- Record planned and actual time.
- Show assignment-level progress derived from real subtask state.
- Provide an "I'm stuck" path that offers a smaller action or further decomposition.

### 4.7 Dynamic rescheduling and risk

- Recalculate future work after completion, postponement, missed work, duration changes, or availability changes.
- Preserve completed work and respect user-locked future blocks where feasible.
- Never silently discard unfinished work.
- Warn when the remaining workload no longer fits before the deadline.
- Explain the most important schedule changes and allow the user to accept or adjust them.

### 4.8 Web companion pet

- Appear as an in-app companion, not an operating-system-level floating window.
- Open the quick check-in and recommendation experience.
- Provide quiet reminders, stuck-state support, and brief completion feedback.
- Support a quiet/reduced-motion behavior.
- Use real assignment and schedule state rather than isolated scripted chat.

### 4.9 Required interface states

All core screens and actions include functional loading, empty, success, and recoverable error states. Visible primary controls must perform a real action; non-functional placeholder controls are not allowed in the MVP release.

### 4.10 Minimal interface and copy

The web application must use a restrained, function-first visual style.

- Each screen has one clear purpose and one visually dominant primary action.
- Show only information needed to understand the current state or complete the current action.
- Use a single page title without a routine subtitle that repeats or explains it.
- Do not place explanatory microcopy beneath every title, field, card, or control.
- Prefer clear labels, familiar controls, and direct action text over instructional paragraphs.
- Keep navigation, cards, badges, colors, icons, borders, and decorative elements to the minimum needed for hierarchy and usability.
- Avoid decorative gradients, ornamental illustrations, excessive animation, crowded dashboards, and unnecessary status labels.
- Use whitespace and typography for hierarchy instead of adding more containers or text.
- Pet content must remain compact and must not compete visually with the active task.
- Keep essential validation, error recovery, recommendation reasons, accessibility labels, and security or consent information; express them as briefly as accuracy allows.

No screen should add content solely to make the product appear more feature-rich. If an element does not help the user decide, act, recover, or understand essential state, it should be omitted.

## 5. Out of scope

The following are deliberately excluded from the initial release:

- native desktop packaging or an operating-system-level floating pet;
- simultaneous optimization across multiple active assignments;
- social graphs, friends, leaderboards, or multiplayer features;
- XP, levels, achievements, and extensive gamification;
- Google Calendar, Outlook, learning-management-system, or university integrations;
- browser push notifications, email reminders, and background mobile notifications;
- AI generation of a complete essay or submission;
- real-time collaborative editing;
- native iOS or Android applications;
- advanced optimization or machine-learned scheduling;
- payment, subscription, and billing systems;
- administrative dashboards beyond basic operational diagnostics.

## 6. Scope resolution for PRD phase ambiguity

The PRD's development-priority section places advanced rescheduling, risk warnings, and the pet in later phases, while its successful-MVP scenario requires them. This baseline resolves that ambiguity as follows:

- **Dynamic rescheduling is part of the MVP**, implemented first with deterministic rules.
- **Deadline-risk warning is part of the MVP**, limited to a clear capacity-versus-workload calculation and explanation.
- **The companion pet is part of the MVP**, implemented as a minimal in-app interaction surface.
- Rich pet animation, proactive system notifications, advanced personalization, and gamification remain post-MVP.

This keeps the final release faithful to the PRD while allowing the engineering work to be delivered incrementally.

## 7. MVP release boundary

The MVP is releasable only when:

- the complete primary flow in `mvp-user-flows.md` works with persisted data;
- every required check in `mvp-acceptance-checklist.md` passes;
- AI failure does not corrupt or erase an existing plan;
- API secrets are never exposed to the browser or committed to the repository;
- scheduling and recommendation decisions can be reproduced and explained;
- the application can run in mock/demo mode without an AI credential;
- no required workflow depends on manually fabricated production data.
- every screen satisfies the minimal-interface checks in the acceptance checklist.
