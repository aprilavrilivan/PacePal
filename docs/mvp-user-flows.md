# PacePal MVP User Flows

## 1. Primary end-to-end flow

### A. Enter PacePal

1. The student signs in.
2. A first-time user sees a concise explanation of what PacePal will do.
3. The dashboard presents one clear action: create the active assignment.

### B. Create the assignment

1. The student enters the title, requirements, expected deliverable, deadline, and priority.
2. PacePal validates the deadline and required fields.
3. The assignment is saved before AI processing begins, preventing input loss.

### C. Plan with AI

1. PacePal reviews the supplied requirements.
2. If critical information is missing, it asks one or a few focused questions.
3. AI returns structured proposed subtasks with durations, completion criteria, difficulty, and dependencies.
4. The student can edit, delete, add, reorder, or further decompose a subtask.
5. PacePal validates the plan, including dependency cycles and total duration.
6. The student explicitly approves the plan.

### D. Set availability and schedule

1. The student supplies available study periods and a simple daily energy profile.
2. PacePal creates valid time slots before the deadline.
3. The scheduling engine allocates eligible subtasks in dependency order.
4. The student reviews the schedule and may move or lock blocks.
5. PacePal explains any unallocated work or deadline risk.
6. The student accepts the initial schedule.

### E. Decide what to do now

1. From the dashboard or pet, the student opens a quick check-in.
2. The student reports available time and current energy.
3. PacePal recommends one eligible subtask and explains why it fits.
4. The student starts it, selects an alternative, postpones, or asks for a smaller step.

### F. Execute and record progress

1. PacePal records the start of a study session.
2. The student can pause or resume the session.
3. On completion, the student records whether the subtask is complete and optionally adjusts actual or remaining time.
4. PacePal updates assignment progress and provides brief positive feedback.
5. The remaining schedule is recalculated if the new information changes capacity or timing.

### G. Recover from disruption

1. The student postpones a planned subtask or misses a study block.
2. PacePal preserves completed and manually locked work.
3. It recalculates only the affected future plan.
4. It summarizes what moved and why.
5. If remaining capacity is insufficient, it displays the workload gap and deadline risk.
6. The student accepts the revision or makes a manual adjustment.

## 2. "I'm stuck" recovery flow

1. The student selects "I'm stuck" from an active or recommended task.
2. PacePal asks for the main obstacle using concise choices plus optional free text.
3. It responds with one of the following:
   - a smaller first action;
   - a further task breakdown;
   - a lower-energy alternative;
   - a schedule adjustment if time is the obstacle.
4. The student chooses an action before the task state changes.

## 3. AI-unavailable flow

1. The AI request fails or times out.
2. PacePal preserves all existing user input and plans.
3. It explains that AI planning is temporarily unavailable.
4. The user can retry, continue editing manually, or use the demo breakdown when mock mode is enabled.
5. Scheduling continues to work for manually entered subtasks because it is not dependent on the LLM.

## 4. Infeasible-deadline flow

1. The scheduling engine compares remaining estimated work with usable study capacity before the deadline.
2. If work exceeds capacity, PacePal does not label the plan feasible.
3. It shows the estimated shortfall and identifies the largest constraints.
4. It offers valid planning actions such as increasing availability, reducing task scope, revising estimates, or discussing the deadline with the instructor.
5. No unfinished task is silently omitted from the schedule.

## 5. Returning-user flow

1. The student returns in the same local timezone context.
2. The dashboard shows today's plan, progress, next deadline, and any plan changes requiring attention.
3. The pet remains quiet unless the user opens it or a meaningful in-app reminder is due.
4. The student can resume the last active task or perform a new check-in.
