# PacePal MVP Acceptance Checklist

This checklist is the release gate for the web MVP. A checked item must be demonstrated in the deployed production-like environment, not only in a design mockup.

## 1. Account and data isolation

- [ ] A new user can sign in and sign out.
- [ ] The user's assignment and progress remain after signing out and returning.
- [ ] User A cannot read or modify User B's data.
- [ ] Deadlines and schedule blocks render in the user's configured timezone.

## 2. Assignment and subtask management

- [ ] A user can create, view, edit, and delete an assignment.
- [ ] Required fields and invalid deadlines show actionable validation messages.
- [ ] A user can add, edit, reorder, and delete subtasks.
- [ ] Each subtask can store duration, completion criteria, difficulty, dependencies, and status.
- [ ] Overall progress is calculated from stored task state rather than a hard-coded value.

## 3. AI-assisted planning

- [ ] AI can produce a structured breakdown for the reference course-paper scenario.
- [ ] Missing critical information results in focused clarification rather than an arbitrary plan.
- [ ] Generated output is schema-validated before use.
- [ ] A user can modify the proposed plan before approval.
- [ ] A difficult subtask can be decomposed further.
- [ ] AI output does not become the active plan without explicit approval.
- [ ] AI failure preserves existing user input and provides retry/manual options.
- [ ] Mock mode completes the planning flow without an AI credential.

## 4. Initial scheduling

- [ ] A user can enter available study periods and a basic energy profile.
- [ ] The engine schedules required dependencies in a valid order.
- [ ] No task is placed outside the user's availability.
- [ ] Long work can be divided into usable study blocks without losing the original estimate.
- [ ] A user can manually move or lock a schedule block.
- [ ] Unallocated work is visible.
- [ ] The same inputs produce a deterministic, testable result.

## 5. Next-step recommendation

- [ ] A user can report available time and current energy.
- [ ] A task with an incomplete required dependency is not recommended.
- [ ] The recommendation fits the user's reported time or clearly proposes partial progress.
- [ ] The recommendation shows a concise reason and completion criterion.
- [ ] A user can start, replace, postpone, or request help with the recommendation.

## 6. Execution and progress

- [ ] A user can start, pause, resume, complete, postpone, or block a subtask.
- [ ] Planned and actual time are stored separately.
- [ ] Completing a task updates assignment progress and future eligibility.
- [ ] The "I'm stuck" flow can produce a smaller action or further decomposition.
- [ ] Refreshing the page does not lose session or progress records.

## 7. Dynamic rescheduling and deadline risk

- [ ] Postponing a scheduled task triggers a future-plan recalculation.
- [ ] Completed work is never moved back into the remaining plan.
- [ ] User-locked blocks are respected where feasible and conflicts are explained.
- [ ] No unfinished task disappears during rescheduling.
- [ ] The user can see a concise summary of changed blocks.
- [ ] When remaining work exceeds capacity, the system displays the estimated shortfall.
- [ ] The revised plan remains editable and requires user acceptance when changes are material.

## 8. Companion experience

- [ ] The in-app pet can open the quick check-in.
- [ ] Pet recommendations use real assignment and schedule state.
- [ ] The pet reacts briefly to completion and stuck states.
- [ ] Quiet/reduced-motion behavior is available.
- [ ] The pet does not block core controls or repeatedly interrupt focused work.

## 9. Reliability and security

- [ ] AI credentials and server secrets are absent from client bundles and repository history.
- [ ] Core screens have loading, empty, error, and success states.
- [ ] All visible primary controls are functional.
- [ ] The scheduler has automated coverage for dependencies, availability, postponement, insufficient capacity, and timezone boundaries.
- [ ] The primary end-to-end scenario passes in an automated browser test.
- [ ] The deployed application contains no required workflow that depends on manually fabricated data.

## 10. Minimal interface and copy

- [ ] Every screen has one clear purpose and one dominant primary action.
- [ ] Page titles are not routinely followed by explanatory subtitles.
- [ ] Field labels and action text are sufficient without repetitive helper paragraphs.
- [ ] Explanatory text appears only when needed for decisions, validation, error recovery, recommendation reasons, accessibility, or consent.
- [ ] No decorative card, badge, icon, animation, illustration, or status label exists without a functional or hierarchy purpose.
- [ ] The dashboard shows only information needed for today's action, assignment progress, and deadline awareness.
- [ ] The pet remains visually secondary to the current task and uses concise messages.
- [ ] A user can identify the next action without reading a block of introductory text.

## 11. Reference release demonstration

The release candidate must demonstrate this uninterrupted scenario:

1. Sign in as a new student.
2. Create a course paper due in ten days.
3. Generate and edit an AI breakdown.
4. Approve the breakdown.
5. Enter availability and generate a schedule.
6. Check in with limited time and energy.
7. Start and complete the recommended task.
8. Postpone a later task.
9. Review the automatically revised schedule.
10. Observe a clear warning when the revised workload cannot fit.
11. Receive a brief, non-judgmental companion response.
