import type {
  Assignment,
  AssignmentInput,
  PlanChange,
  Subtask,
} from "@/features/pacepal/model";
import { assignmentSchema, subtaskSchema } from "@/features/pacepal/model";
import type {
  DraftPhase,
  DraftTask,
  InitialPlanDecision,
  PlanOperation,
  PlanSnapshot,
  TaskGroupingProposal,
  TaskSplitProposal,
} from "@/features/pacepal/planning/contracts";
import { planSnapshotSchema } from "@/features/pacepal/planning/contracts";

export class PlanValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Plan validation failed: ${issues.join("; ")}`);
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

function slug(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
}

function uniqueId(base: string, used: Set<string>) {
  const root = base || "task";
  let candidate = root;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function dependencyCycle(
  ids: string[],
  dependenciesFor: (id: string) => string[],
) {
  const state = new Map<string, "visiting" | "visited">();
  const path: string[] = [];

  function visit(id: string): string[] | null {
    if (state.get(id) === "visited") return null;
    if (state.get(id) === "visiting") {
      const start = path.indexOf(id);
      return [...path.slice(Math.max(0, start)), id];
    }

    state.set(id, "visiting");
    path.push(id);
    for (const dependency of dependenciesFor(id)) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    path.pop();
    state.set(id, "visited");
    return null;
  }

  for (const id of ids) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateDraftPhases(phases: DraftPhase[]) {
  const tasks = phases.flatMap((phase) => phase.tasks);
  const ids = tasks.map((task) => task.tempId);
  const idSet = new Set(ids);
  const issues: string[] = [];

  if (tasks.length < 3 || tasks.length > 24) {
    issues.push("An initial plan must contain between 3 and 24 tasks.");
  }
  for (const duplicate of duplicateValues(ids)) {
    issues.push(`Duplicate task tempId: ${duplicate}.`);
  }
  for (const task of tasks) {
    for (const dependency of duplicateValues(task.dependencies)) {
      issues.push(`${task.tempId} repeats dependency ${dependency}.`);
    }
    for (const dependency of task.dependencies) {
      if (!idSet.has(dependency)) {
        issues.push(
          `${task.tempId} references missing dependency ${dependency}.`,
        );
      }
      if (dependency === task.tempId) {
        issues.push(`${task.tempId} cannot depend on itself.`);
      }
    }
  }
  const byId = new Map(tasks.map((task) => [task.tempId, task]));
  const position = new Map(ids.map((id, index) => [id, index]));
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (
        idSet.has(dependency) &&
        (position.get(dependency) ?? Number.MAX_SAFE_INTEGER) >=
          (position.get(task.tempId) ?? -1)
      ) {
        issues.push(
          `${task.tempId} must appear after its dependency ${dependency}.`,
        );
      }
    }
  }
  const cycle = dependencyCycle(ids, (id) => byId.get(id)?.dependencies ?? []);
  if (cycle) issues.push(`Circular dependency: ${cycle.join(" -> ")}.`);

  if (issues.length > 0) throw new PlanValidationError(issues);
}

export function validateSubtasks(subtasks: Subtask[]) {
  const issues: string[] = [];
  const parsed = subtaskSchema.array().safeParse(subtasks);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((issue) => issue.message));
  }
  if (subtasks.length < 1 || subtasks.length > 64) {
    issues.push("A plan must contain between 1 and 64 tasks.");
  }

  const ids = subtasks.map((task) => task.id);
  const idSet = new Set(ids);
  for (const duplicate of duplicateValues(ids)) {
    issues.push(`Duplicate task id: ${duplicate}.`);
  }
  for (const task of subtasks) {
    for (const dependency of duplicateValues(task.dependencies)) {
      issues.push(`${task.id} repeats dependency ${dependency}.`);
    }
    for (const dependency of task.dependencies) {
      if (!idSet.has(dependency)) {
        issues.push(`${task.id} references missing dependency ${dependency}.`);
      }
      if (dependency === task.id) {
        issues.push(`${task.id} cannot depend on itself.`);
      }
    }
  }

  const byId = new Map(subtasks.map((task) => [task.id, task]));
  const position = new Map(ids.map((id, index) => [id, index]));
  for (const task of subtasks) {
    for (const dependency of task.dependencies) {
      if (
        idSet.has(dependency) &&
        byId.get(dependency)?.status !== "completed" &&
        (position.get(dependency) ?? Number.MAX_SAFE_INTEGER) >=
          (position.get(task.id) ?? -1)
      ) {
        issues.push(`${task.id} must appear after dependency ${dependency}.`);
      }
    }
  }
  const cycle = dependencyCycle(ids, (id) => byId.get(id)?.dependencies ?? []);
  if (cycle) issues.push(`Circular dependency: ${cycle.join(" -> ")}.`);

  if (issues.length > 0) throw new PlanValidationError(issues);
}

function taskFromDraft(
  draft: DraftTask & { phase?: string },
  id: string,
  dependencies: string[],
): Subtask {
  return {
    id,
    title: draft.title,
    description: draft.description,
    estimatedMinutes: draft.estimatedMinutes,
    completionCriteria: draft.completionCriteria,
    difficulty: draft.difficulty,
    dependencies,
    status: "todo",
    actualMinutes: 0,
    activeSince: null,
    postponedUntil: null,
    phase: draft.phase,
    taskPriority: draft.priority,
  };
}

export function materializeInitialPlan(
  assignment: AssignmentInput,
  decision: InitialPlanDecision,
  now = new Date(),
) {
  validateDraftPhases(decision.phases);
  const used = new Set<string>();
  const prefix = slug(assignment.title).slice(0, 20) || "assignment";
  const idByTempId = new Map<string, string>();
  const flattened = decision.phases.flatMap((phase) =>
    phase.tasks.map((task) => ({ ...task, phase: phase.title })),
  );

  for (const task of flattened) {
    idByTempId.set(
      task.tempId,
      uniqueId(`${prefix}-${slug(task.tempId) || "task"}`, used),
    );
  }

  const subtasks = flattened.map((task) =>
    taskFromDraft(
      task,
      idByTempId.get(task.tempId)!,
      task.dependencies.map((dependency) => idByTempId.get(dependency)!),
    ),
  );
  validateSubtasks(subtasks);

  const initialChange: PlanChange = {
    version: 1,
    createdAt: now.toISOString(),
    source: "initial",
    summary: decision.taskUnderstanding,
    operationTypes: ["create_plan"],
  };

  return {
    assumptions: decision.assumptions,
    assistantMessage: decision.taskUnderstanding,
    language: decision.language,
    planHistory: [initialChange],
    planVersion: 1,
    subtasks,
  };
}

function planComparable(assignment: Assignment) {
  return {
    title: assignment.title,
    requirements: assignment.requirements,
    deliverable: assignment.deliverable,
    deadline: assignment.deadline,
    priority: assignment.priority,
    availability: assignment.availability,
    subtasks: assignment.subtasks,
  };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireTask(subtasks: Subtask[], taskId: string) {
  const task = subtasks.find((item) => item.id === taskId);
  if (!task) throw new PlanValidationError([`Unknown task id: ${taskId}.`]);
  return task;
}

function newTaskIdMap(assignment: Assignment, operations: PlanOperation[]) {
  const version = (assignment.planVersion ?? 1) + 1;
  const usedIds = new Set(assignment.subtasks.map((task) => task.id));
  const tempIds: string[] = [];
  for (const operation of operations) {
    if (operation.type === "add_task" || operation.type === "merge_tasks") {
      tempIds.push(operation.task.tempId);
    }
    if (operation.type === "split_task") {
      tempIds.push(...operation.tasks.map((task) => task.tempId));
    }
  }
  const duplicates = duplicateValues(tempIds);
  if (duplicates.length > 0) {
    throw new PlanValidationError(
      duplicates.map((id) => `Duplicate new-task tempId: ${id}.`),
    );
  }

  const result = new Map<string, string>();
  for (const tempId of tempIds) {
    result.set(
      tempId,
      uniqueId(
        `${slug(assignment.id).slice(0, 24) || "assignment"}-v${version}-${slug(tempId) || "task"}`,
        usedIds,
      ),
    );
  }
  return result;
}

function statusAfterMerge(tasks: Subtask[]): Subtask["status"] {
  if (tasks.some((task) => task.status === "in_progress")) return "in_progress";
  if (tasks.some((task) => task.status === "blocked")) return "blocked";
  if (tasks.some((task) => task.status === "paused")) return "paused";
  if (tasks.some((task) => task.status === "postponed")) return "postponed";
  return "todo";
}

const priorityRank = { low: 0, medium: 1, high: 2 } as const;
const difficultyRank = { low: 0, medium: 1, high: 2 } as const;

function strongestValue<T extends keyof typeof priorityRank>(
  values: T[],
  rank: Record<T, number>,
) {
  return values.reduce((best, value) =>
    rank[value] > rank[best] ? value : best,
  );
}

function joinedText(values: string[], maxLength: number) {
  const result = [...new Set(values)].join("；");
  return result.length <= maxLength
    ? result
    : `${result.slice(0, maxLength - 1)}…`;
}

export function normalizeTaskGrouping(
  assignment: Assignment,
  proposal: TaskGroupingProposal,
  targetCount: number,
) {
  if (proposal.groups.length !== targetCount) {
    throw new PlanValidationError([
      `Expected ${targetCount} task groups, received ${proposal.groups.length}.`,
    ]);
  }

  const taskById = new Map(assignment.subtasks.map((task) => [task.id, task]));
  const sourceIds = proposal.groups.flatMap((group) => group.sourceTaskIds);
  const duplicates = duplicateValues(sourceIds);
  const unknown = sourceIds.filter((id) => !taskById.has(id));
  const missing = assignment.subtasks
    .map((task) => task.id)
    .filter((id) => !sourceIds.includes(id));

  const issues = [
    ...duplicates.map((id) => `Task ${id} appears in more than one group.`),
    ...unknown.map((id) => `Unknown task id: ${id}.`),
    ...missing.map((id) => `Task ${id} is not included in any group.`),
  ];

  for (const group of proposal.groups) {
    if (
      group.sourceTaskIds.length > 1 &&
      group.sourceTaskIds.some((id) => taskById.get(id)?.status === "completed")
    ) {
      issues.push("Completed tasks must remain separate during regrouping.");
    }
  }
  if (issues.length > 0) throw new PlanValidationError(issues);

  const taskIndex = new Map(
    assignment.subtasks.map((task, index) => [task.id, index]),
  );
  return [...proposal.groups].sort(
    (left, right) =>
      Math.min(...left.sourceTaskIds.map((id) => taskIndex.get(id)!)) -
      Math.min(...right.sourceTaskIds.map((id) => taskIndex.get(id)!)),
  );
}

export function buildTaskGroupingOperations(
  assignment: Assignment,
  proposal: TaskGroupingProposal,
  targetCount: number,
): PlanOperation[] {
  const groups = normalizeTaskGrouping(assignment, proposal, targetCount);
  const taskById = new Map(assignment.subtasks.map((task) => [task.id, task]));
  const operations: PlanOperation[] = groups.flatMap((group, index) => {
    if (group.sourceTaskIds.length === 1) return [];
    const tasks = group.sourceTaskIds.map((id) => taskById.get(id)!);
    return [
      {
        type: "merge_tasks" as const,
        taskIds: group.sourceTaskIds,
        task: {
          tempId: `new-group-${index + 1}`,
          title: group.title,
          description: joinedText(
            tasks.map((task) => task.description),
            1200,
          ),
          completionCriteria: joinedText(
            tasks.map((task) => task.completionCriteria),
            600,
          ),
          estimatedMinutes: tasks.reduce(
            (total, task) => total + task.estimatedMinutes,
            0,
          ),
          difficulty: strongestValue(
            tasks.map((task) => task.difficulty),
            difficultyRank,
          ),
          priority: strongestValue(
            tasks.map((task) => task.taskPriority ?? assignment.priority),
            priorityRank,
          ),
          dependencies: [],
          phase: tasks[0]!.phase ?? "计划执行",
        },
      },
    ];
  });

  return operations.length > 0 ? [...operations, { type: "reschedule" }] : [];
}

export function buildTaskSplitOperations(
  assignment: Assignment,
  proposal: TaskSplitProposal,
): PlanOperation[] {
  const source = assignment.subtasks.find(
    (task) => task.id === proposal.sourceTaskId,
  );
  const issues: string[] = [];
  if (!source) issues.push(`Unknown task id: ${proposal.sourceTaskId}.`);
  if (source?.status === "completed") {
    issues.push("Completed tasks cannot be split.");
  }
  if (source && proposal.titles.length * 5 > source.estimatedMinutes) {
    issues.push("The source task is too short for that many subtasks.");
  }
  if (new Set(proposal.titles).size !== proposal.titles.length) {
    issues.push("Split task titles must be unique.");
  }
  if (issues.length > 0 || !source) throw new PlanValidationError(issues);

  const baseMinutes = Math.floor(
    source.estimatedMinutes / proposal.titles.length,
  );
  const remainder = source.estimatedMinutes % proposal.titles.length;
  return [
    {
      type: "split_task",
      taskId: source.id,
      tasks: proposal.titles.map((title, index) => ({
        tempId: `split-${index + 1}`,
        title,
        description: joinedText([source.description, title], 1200),
        estimatedMinutes: baseMinutes + (index < remainder ? 1 : 0),
        completionCriteria: joinedText([`${title}已完成。`], 600),
        difficulty: source.difficulty,
        priority: source.taskPriority ?? assignment.priority,
        dependencies: index === 0 ? [] : [`split-${index}`],
        phase: source.phase ?? "计划执行",
      })),
    },
    { type: "reschedule" },
  ];
}

function uniqueReferences(values: string[]) {
  return [...new Set(values)];
}

export type ApplyOperationsOptions = {
  language: "zh" | "en";
  now?: Date;
  summary: string;
};

export function applyPlanOperations(
  source: Assignment,
  rawOperations: PlanOperation[],
  options: ApplyOperationsOptions,
) {
  const assignment = assignmentSchema.parse(structuredClone(source));
  const before = planComparable(assignment);
  const idByTempId = newTaskIdMap(assignment, rawOperations);
  const resolveId = (reference: string) =>
    idByTempId.get(reference) ?? reference;
  let subtasks = assignment.subtasks.map((task) => ({
    ...task,
    dependencies: [...task.dependencies],
  }));
  let availability = { ...assignment.availability };
  let input = {
    title: assignment.title,
    requirements: assignment.requirements,
    deliverable: assignment.deliverable,
    deadline: assignment.deadline,
    priority: assignment.priority,
  };

  for (const operation of rawOperations) {
    if (operation.type === "set_status") {
      const task = requireTask(subtasks, resolveId(operation.taskId));
      if (task.status === "completed" && operation.status !== "completed") {
        throw new PlanValidationError([
          `Completed task ${task.id} can only be reopened with reopen_task.`,
        ]);
      }
      if (task.status === operation.status) {
        throw new PlanValidationError([
          `Task ${task.id} already has that status.`,
        ]);
      }
      task.status = operation.status;
      if (operation.status !== "in_progress") task.activeSince = null;
      if (operation.status !== "postponed") task.postponedUntil = null;
      continue;
    }

    if (operation.type === "reopen_task") {
      const task = requireTask(subtasks, resolveId(operation.taskId));
      if (task.status !== "completed") {
        throw new PlanValidationError([`Task ${task.id} is not completed.`]);
      }
      task.status = operation.status;
      task.activeSince = null;
      task.postponedUntil = null;
      continue;
    }

    if (operation.type === "update_task") {
      const task = requireTask(subtasks, resolveId(operation.taskId));
      if (task.status === "completed") {
        throw new PlanValidationError([
          `Completed task ${task.id} cannot be rewritten.`,
        ]);
      }
      const changes = operation.changes;
      const next = {
        ...task,
        ...(changes.title === undefined ? {} : { title: changes.title }),
        ...(changes.description === undefined
          ? {}
          : { description: changes.description }),
        ...(changes.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: changes.estimatedMinutes }),
        ...(changes.completionCriteria === undefined
          ? {}
          : { completionCriteria: changes.completionCriteria }),
        ...(changes.difficulty === undefined
          ? {}
          : { difficulty: changes.difficulty }),
        ...(changes.priority === undefined
          ? {}
          : { taskPriority: changes.priority }),
        ...(changes.phase === undefined ? {} : { phase: changes.phase }),
        ...(changes.dependencies === undefined
          ? {}
          : { dependencies: changes.dependencies.map(resolveId) }),
      };
      if (sameValue(task, next)) {
        throw new PlanValidationError([`Task ${task.id} update is a no-op.`]);
      }
      subtasks = subtasks.map((item) => (item.id === task.id ? next : item));
      continue;
    }

    if (operation.type === "add_task") {
      const id = idByTempId.get(operation.task.tempId)!;
      const task = taskFromDraft(
        operation.task,
        id,
        operation.task.dependencies.map(resolveId),
      );
      const afterId = operation.afterTaskId
        ? resolveId(operation.afterTaskId)
        : null;
      const index = afterId
        ? subtasks.findIndex((item) => item.id === afterId)
        : subtasks.length - 1;
      if (afterId && index < 0) {
        throw new PlanValidationError([`Unknown afterTaskId: ${afterId}.`]);
      }
      subtasks.splice(index + 1, 0, task);
      continue;
    }

    if (operation.type === "delete_task") {
      const task = requireTask(subtasks, resolveId(operation.taskId));
      if (task.status === "completed") {
        throw new PlanValidationError([
          `Completed task ${task.id} cannot be deleted.`,
        ]);
      }
      if (subtasks.length === 1) {
        throw new PlanValidationError(["A plan must keep at least one task."]);
      }
      subtasks = subtasks
        .filter((item) => item.id !== task.id)
        .map((item) => ({
          ...item,
          dependencies: uniqueReferences(
            item.dependencies.flatMap((dependency) =>
              dependency === task.id ? task.dependencies : [dependency],
            ),
          ),
        }));
      continue;
    }

    if (operation.type === "split_task") {
      const taskId = resolveId(operation.taskId);
      const targetIndex = subtasks.findIndex((task) => task.id === taskId);
      const target = requireTask(subtasks, taskId);
      if (target.status === "completed") {
        throw new PlanValidationError([
          `Completed task ${target.id} cannot be split.`,
        ]);
      }
      const replacements = operation.tasks.map((draft, index) => {
        const replacement = taskFromDraft(
          draft,
          idByTempId.get(draft.tempId)!,
          uniqueReferences([
            ...(index === 0 ? target.dependencies : []),
            ...draft.dependencies.map(resolveId),
          ]),
        );
        if (index === 0) {
          replacement.status = target.status;
          replacement.actualMinutes = target.actualMinutes;
          replacement.activeSince = target.activeSince;
          replacement.postponedUntil = target.postponedUntil;
        }
        return replacement;
      });
      const finalReplacementId = replacements.at(-1)!.id;
      subtasks = subtasks.map((task) => ({
        ...task,
        dependencies: task.dependencies.map((dependency) =>
          dependency === target.id ? finalReplacementId : dependency,
        ),
      }));
      subtasks.splice(targetIndex, 1, ...replacements);
      continue;
    }

    if (operation.type === "merge_tasks") {
      const taskIds = operation.taskIds.map(resolveId);
      if (duplicateValues(taskIds).length > 0) {
        throw new PlanValidationError(["merge_tasks contains duplicate ids."]);
      }
      const targets = taskIds.map((id) => requireTask(subtasks, id));
      if (targets.some((task) => task.status === "completed")) {
        throw new PlanValidationError(["Completed tasks cannot be merged."]);
      }
      const targetIds = new Set(taskIds);
      const mergedId = idByTempId.get(operation.task.tempId)!;
      const inheritedDependencies = targets.flatMap((task) =>
        task.dependencies.filter((dependency) => !targetIds.has(dependency)),
      );
      const merged = taskFromDraft(
        operation.task,
        mergedId,
        uniqueReferences([
          ...inheritedDependencies,
          ...operation.task.dependencies.map(resolveId),
        ]).filter((dependency) => !targetIds.has(dependency)),
      );
      merged.status = statusAfterMerge(targets);
      merged.actualMinutes = targets.reduce(
        (total, task) => total + task.actualMinutes,
        0,
      );
      if (merged.status === "in_progress") {
        merged.activeSince =
          targets.find((task) => task.status === "in_progress")?.activeSince ??
          null;
      }
      if (merged.status === "postponed") {
        merged.postponedUntil =
          targets.find((task) => task.status === "postponed")?.postponedUntil ??
          null;
      }
      const firstIndex = Math.min(
        ...taskIds.map((id) => subtasks.findIndex((task) => task.id === id)),
      );
      subtasks = subtasks
        .filter((task) => !targetIds.has(task.id))
        .map((task) => ({
          ...task,
          dependencies: uniqueReferences(
            task.dependencies.map((dependency) =>
              targetIds.has(dependency) ? mergedId : dependency,
            ),
          ),
        }));
      subtasks.splice(firstIndex, 0, merged);
      continue;
    }

    if (operation.type === "reorder_tasks") {
      const requestedIds = operation.taskIds.map(resolveId);
      if (duplicateValues(requestedIds).length > 0) {
        throw new PlanValidationError([
          "reorder_tasks contains duplicate ids.",
        ]);
      }
      const pending = subtasks.filter((task) => task.status !== "completed");
      const pendingIds = new Set(pending.map((task) => task.id));
      for (const id of requestedIds) {
        if (!pendingIds.has(id)) {
          throw new PlanValidationError([
            `Only existing unfinished tasks can be reordered: ${id}.`,
          ]);
        }
      }
      const order = new Map(requestedIds.map((id, index) => [id, index]));
      const reordered = [...pending].sort((left, right) => {
        const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
      if (
        sameValue(
          pending.map((task) => task.id),
          reordered.map((task) => task.id),
        )
      ) {
        throw new PlanValidationError([
          "reorder_tasks does not change the order.",
        ]);
      }
      let pendingIndex = 0;
      subtasks = subtasks.map((task) =>
        task.status === "completed" ? task : reordered[pendingIndex++]!,
      );
      continue;
    }

    if (operation.type === "rename_phase") {
      if (!subtasks.some((task) => task.phase === operation.from)) {
        throw new PlanValidationError([`Unknown phase: ${operation.from}.`]);
      }
      if (operation.from === operation.to) {
        throw new PlanValidationError(["Phase rename is a no-op."]);
      }
      subtasks = subtasks.map((task) =>
        task.phase === operation.from ? { ...task, phase: operation.to } : task,
      );
      continue;
    }

    if (operation.type === "set_availability") {
      const next = { ...availability, ...operation.availability };
      if (sameValue(availability, next)) {
        throw new PlanValidationError(["Availability update is a no-op."]);
      }
      availability = next;
      continue;
    }

    if (operation.type === "update_assignment") {
      const next = { ...input, ...operation.changes };
      if (sameValue(input, next)) {
        throw new PlanValidationError(["Assignment update is a no-op."]);
      }
      if (!Number.isFinite(new Date(next.deadline).getTime())) {
        throw new PlanValidationError(["The updated deadline is invalid."]);
      }
      input = next;
    }
  }

  validateSubtasks(subtasks);
  const candidate = assignmentSchema.parse({
    ...assignment,
    ...input,
    availability,
    subtasks,
  });
  const dataChanged = !sameValue(before, planComparable(candidate));
  const requestedReschedule = rawOperations.some(
    (operation) => operation.type === "reschedule",
  );
  if (rawOperations.length > 0 && !dataChanged && !requestedReschedule) {
    throw new PlanValidationError(["The operations do not change the plan."]);
  }

  if (dataChanged) {
    const version = (assignment.planVersion ?? 1) + 1;
    const change: PlanChange = {
      version,
      createdAt: (options.now ?? new Date()).toISOString(),
      source: "assistant",
      summary: options.summary,
      operationTypes: rawOperations.map((operation) => operation.type),
    };
    candidate.planVersion = version;
    candidate.planHistory = [...(assignment.planHistory ?? []), change].slice(
      -30,
    );
    candidate.language = options.language;
  }

  return {
    assignment: candidate,
    changed: dataChanged || requestedReschedule,
    dataChanged,
  };
}

export function snapshotPlan(
  assignment: Assignment,
  language = assignment.language ?? "zh",
): PlanSnapshot {
  return planSnapshotSchema.parse({
    title: assignment.title,
    requirements: assignment.requirements,
    deliverable: assignment.deliverable,
    deadline: assignment.deadline,
    priority: assignment.priority,
    availability: assignment.availability,
    subtasks: assignment.subtasks,
    language,
    planVersion: assignment.planVersion ?? 1,
    planHistory: assignment.planHistory ?? [],
  });
}
