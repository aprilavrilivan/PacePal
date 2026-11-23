import { z } from "zod";

import type { Assignment, Subtask } from "@/features/pacepal/model";
import {
  refinementOutputSchema,
  type RefinementOperation,
  type RefinementOutput,
} from "@/features/pacepal/refinement";
import { findReferencedTask } from "@/features/pacepal/refinement-intent";

const recordSchema = z.record(z.string(), z.unknown());

function record(value: unknown) {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function valueFor(source: Record<string, unknown>, keys: string[]) {
  return keys.map((key) => source[key]).find((value) => value != null);
}

function stringFor(source: Record<string, unknown>, keys: string[]) {
  const value = valueFor(source, keys);
  return typeof value === "string" ? value.trim() : "";
}

function minutesFor(source: Record<string, unknown>, fallback = 30) {
  const value = valueFor(source, [
    "estimatedMinutes",
    "estimated_minutes",
    "durationMinutes",
    "duration",
    "time",
  ]);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;

  const amount = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(amount)) return fallback;
  return /hour|hr|小时/i.test(value) ? amount * 60 : amount;
}

function difficultyFor(
  source: Record<string, unknown>,
  minutes: number,
  fallback?: Subtask["difficulty"],
) {
  const value = stringFor(source, ["difficulty", "complexity", "priority"])
    .toLowerCase()
    .trim();
  if (/high|hard|高|难/.test(value)) return "high" as const;
  if (/low|easy|低|易/.test(value)) return "low" as const;
  if (/medium|moderate|中/.test(value)) return "medium" as const;
  if (fallback) return fallback;
  return minutes <= 30 ? "low" : minutes <= 60 ? "medium" : "high";
}

function dependenciesFor(
  source: Record<string, unknown>,
  fallback: string[] = [],
) {
  const value = valueFor(source, ["dependencies", "dependsOn", "depends_on"]);
  if (!Array.isArray(value)) return fallback;
  return value
    .map((dependency) =>
      typeof dependency === "string" || typeof dependency === "number"
        ? String(dependency)
        : "",
    )
    .filter(Boolean);
}

function taskFrom(value: unknown, fallback?: Subtask) {
  const source = record(value);
  const estimatedMinutes = Math.min(
    600,
    Math.max(5, Math.round(minutesFor(source, fallback?.estimatedMinutes))),
  );
  const title =
    stringFor(source, ["title", "task_name", "name", "task", "step"]) ||
    fallback?.title ||
    "新任务";
  const description =
    stringFor(source, ["description", "details", "action", "content"]) ||
    fallback?.description ||
    title;

  return {
    completionCriteria:
      stringFor(source, [
        "completionCriteria",
        "completion_criteria",
        "acceptanceCriteria",
        "criteria",
        "done_when",
      ]) ||
      fallback?.completionCriteria ||
      description,
    dependencies: dependenciesFor(source, fallback?.dependencies),
    description,
    difficulty: difficultyFor(source, estimatedMinutes, fallback?.difficulty),
    estimatedMinutes,
    id:
      stringFor(source, ["id", "taskId", "task_id"]) ||
      fallback?.id ||
      "ai-task",
    title,
  };
}

function statusFor(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (/complete|done|完成|已做完/.test(text)) return "completed" as const;
  if (/progress|进行/.test(text)) return "in_progress" as const;
  if (/pause|暂停/.test(text)) return "paused" as const;
  if (/postpone|defer|延期/.test(text)) return "postponed" as const;
  if (/block|受阻|卡住/.test(text)) return "blocked" as const;
  if (/todo|待开始|未开始|reopen/.test(text)) return "todo" as const;
  return null;
}

function availabilityPatch(source: Record<string, unknown>) {
  const nested = record(
    valueFor(source, ["availability", "schedulePreferences", "capacity"]),
  );
  const input = Object.keys(nested).length > 0 ? nested : source;
  const rawMinutes = valueFor(input, [
    "dailyMinutes",
    "daily_minutes",
    "minutesPerDay",
  ]);
  const parsedMinutes =
    typeof rawMinutes === "number"
      ? rawMinutes
      : Number(String(rawMinutes ?? "").match(/\d+/)?.[0]);
  const preferredTime = stringFor(input, [
    "preferredTime",
    "preferred_time",
    "startTime",
  ]);
  const availability: Partial<Assignment["availability"]> = {};
  if (Number.isFinite(parsedMinutes)) {
    availability.dailyMinutes = Math.min(
      240,
      Math.max(15, Math.round(parsedMinutes)),
    );
  }
  if (/^\d{2}:\d{2}$/.test(preferredTime)) {
    availability.preferredTime = preferredTime;
  }
  return availability;
}

function taskPatch(value: unknown, current: Subtask) {
  const next = taskFrom(value, current);
  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "description",
    "estimatedMinutes",
    "completionCriteria",
    "difficulty",
    "dependencies",
  ] as const) {
    if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) {
      patch[key] = next[key];
    }
  }
  return patch;
}

function referencedTask(
  assignment: Assignment,
  reference: string,
  includeCompleted = false,
) {
  const candidates = assignment.subtasks.filter(
    (task) => includeCompleted || task.status !== "completed",
  );
  const normalized = reference.trim().toLocaleLowerCase();
  const exact = candidates.find(
    (task) =>
      task.id.toLocaleLowerCase() === normalized ||
      task.title.toLocaleLowerCase() === normalized,
  );
  if (exact) return exact;

  const partial = candidates.find((task) => {
    const title = task.title.toLocaleLowerCase();
    return (
      normalized.length >= 3 &&
      (title.includes(normalized) || normalized.includes(title))
    );
  });
  if (partial) return partial;

  return reference ? findReferencedTask(assignment, reference) : null;
}

function directOperation(
  value: unknown,
  assignment: Assignment,
): RefinementOperation | null {
  const source = record(value);
  const rawType = stringFor(source, ["type", "operation", "action"])
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const taskReference = stringFor(source, [
    "taskId",
    "task_id",
    "id",
    "taskTitle",
    "task_title",
    "target",
  ]);

  if (/reopen|重新打开|撤销完成/.test(rawType)) {
    const status =
      statusFor(valueFor(source, ["status", "value", "newStatus"])) ?? "todo";
    const current = referencedTask(assignment, taskReference, true);
    return current && current.status === "completed" && status !== "completed"
      ? { type: "reopen_task", taskId: current.id, status }
      : null;
  }

  if (/complete|status|progress|reopen|block|pause|postpone/.test(rawType)) {
    const status = statusFor(
      valueFor(source, ["status", "value", "newStatus"]) || rawType,
    );
    const current = referencedTask(assignment, taskReference);
    return current &&
      status &&
      current.status !== "completed" &&
      current.status !== status
      ? { type: "set_status", taskId: current.id, status }
      : null;
  }

  if (/update|modify|edit/.test(rawType) && taskReference) {
    const current = referencedTask(assignment, taskReference);
    if (!current || current.status === "completed") return null;
    const patch = taskPatch(
      valueFor(source, ["patch", "changes", "task"]) ?? source,
      current,
    );
    return Object.keys(patch).length > 0
      ? {
          type: "update_task",
          taskId: current.id,
          patch: patch as Extract<
            RefinementOperation,
            { type: "update_task" }
          >["patch"],
        }
      : null;
  }

  if (/add|create|insert/.test(rawType)) {
    const task = taskFrom(valueFor(source, ["task", "item"]) ?? source);
    const afterTaskId =
      stringFor(source, ["afterTaskId", "after_task_id", "after"]) || null;
    return { type: "add_task", afterTaskId, task };
  }

  if (/remove|delete/.test(rawType) && taskReference) {
    const current = referencedTask(assignment, taskReference);
    return current && current.status !== "completed"
      ? { type: "remove_task", taskId: current.id }
      : null;
  }

  if (/reorder|sort/.test(rawType)) {
    const taskIds = valueFor(source, ["taskIds", "task_ids", "order"]);
    if (!Array.isArray(taskIds)) return null;
    const currentOrder = assignment.subtasks
      .filter((task) => task.status !== "completed")
      .map((task) => task.id);
    const validIds = new Set(currentOrder);
    const requested = taskIds
      .map(
        (reference) =>
          referencedTask(assignment, String(reference))?.id ??
          String(reference),
      )
      .filter(
        (id, index, all) => validIds.has(id) && all.indexOf(id) === index,
      );
    const completeOrder = [
      ...requested,
      ...currentOrder.filter((id) => !requested.includes(id)),
    ];
    return completeOrder.some((id, index) => id !== currentOrder[index])
      ? { type: "reorder_tasks", taskIds: completeOrder }
      : null;
  }

  if (/availability|capacity|time/.test(rawType)) {
    const availability = availabilityPatch(source);
    const changesAvailability = Object.entries(availability).some(
      ([key, next]) =>
        assignment.availability[key as keyof typeof availability] !== next,
    );
    return changesAvailability
      ? { type: "set_availability", availability }
      : null;
  }

  if (/reschedule|rebalance|replan/.test(rawType)) {
    return { type: "reschedule" };
  }
  return null;
}

function taskArray(value: unknown) {
  const source = record(value);
  for (const key of ["subtasks", "tasks", "steps", "items"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function operationsFromLegacyPlan(value: unknown, assignment: Assignment) {
  const operations: RefinementOperation[] = [];
  const rawTasks = taskArray(value).slice(0, 16);

  rawTasks.forEach((rawTask, index) => {
    const source = record(rawTask);
    const proposedId = stringFor(source, ["id", "taskId", "task_id"]);
    const current =
      assignment.subtasks.find((task) => task.id === proposedId) ??
      assignment.subtasks[index];
    if (!current) {
      operations.push({
        type: "add_task",
        afterTaskId: assignment.subtasks.at(-1)?.id ?? null,
        task: taskFrom(rawTask),
      });
      return;
    }

    const patch = taskPatch(rawTask, current);
    if (current.status !== "completed" && Object.keys(patch).length > 0) {
      operations.push({
        type: "update_task",
        taskId: current.id,
        patch: patch as Extract<
          RefinementOperation,
          { type: "update_task" }
        >["patch"],
      });
    }
    const status = statusFor(valueFor(source, ["status", "state"]));
    if (current.status !== "completed" && status && status !== current.status) {
      operations.push({ type: "set_status", taskId: current.id, status });
    }
  });

  const availability = availabilityPatch(record(value));
  if (
    Object.entries(availability).some(
      ([key, next]) =>
        assignment.availability[key as keyof typeof availability] !== next,
    )
  ) {
    operations.push({ type: "set_availability", availability });
  }
  return operations;
}

function sanitizeOperationReferences(
  operations: RefinementOperation[],
  assignment: Assignment,
) {
  const existingIds = new Set(assignment.subtasks.map((task) => task.id));
  const usedIds = new Set(existingIds);

  const withUniqueAddedIds = operations.map((operation) => {
    if (operation.type !== "add_task") return operation;

    const baseId = operation.task.id || "ai-task";
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return {
      ...operation,
      task: { ...operation.task, id },
    };
  });

  const knownIds = new Set(usedIds);
  return withUniqueAddedIds.map((operation) => {
    if (operation.type === "add_task") {
      return {
        ...operation,
        afterTaskId:
          operation.afterTaskId && knownIds.has(operation.afterTaskId)
            ? operation.afterTaskId
            : null,
        task: {
          ...operation.task,
          dependencies: operation.task.dependencies.filter(
            (dependency, index, all) =>
              dependency !== operation.task.id &&
              knownIds.has(dependency) &&
              all.indexOf(dependency) === index,
          ),
        },
      };
    }

    if (
      operation.type === "update_task" &&
      operation.patch.dependencies !== undefined
    ) {
      return {
        ...operation,
        patch: {
          ...operation.patch,
          dependencies: operation.patch.dependencies.filter(
            (dependency, index, all) =>
              dependency !== operation.taskId &&
              knownIds.has(dependency) &&
              all.indexOf(dependency) === index,
          ),
        },
      };
    }

    if (operation.type === "reorder_tasks") {
      return {
        ...operation,
        taskIds: operation.taskIds.filter(
          (taskId, index, all) =>
            knownIds.has(taskId) && all.indexOf(taskId) === index,
        ),
      };
    }

    return operation;
  });
}

export function normalizeGatewayRefinement(
  value: unknown,
  assignment: Assignment,
  message = "",
): RefinementOutput {
  const source = record(value);
  const rawOperations = valueFor(source, ["operations", "changes", "actions"]);
  const operations = Array.isArray(rawOperations)
    ? rawOperations
        .map((operation) => directOperation(operation, assignment))
        .filter((operation): operation is RefinementOperation =>
          Boolean(operation),
        )
    : operationsFromLegacyPlan(value, assignment);

  const completedIds = valueFor(source, [
    "completedTaskIds",
    "completed_task_ids",
    "completedTasks",
  ]);
  if (Array.isArray(completedIds)) {
    for (const taskId of completedIds.map(String)) {
      if (
        assignment.subtasks.some(
          (task) => task.id === taskId && task.status !== "completed",
        )
      ) {
        operations.push({ type: "set_status", taskId, status: "completed" });
      }
    }
  }

  const reportsBlocker = /(卡住|受阻|无法继续|blocked)/i.test(message);
  if (
    reportsBlocker &&
    !operations.some(
      (operation) =>
        operation.type === "set_status" && operation.status === "blocked",
    )
  ) {
    const blockedTask = findReferencedTask(assignment, message);
    if (blockedTask) {
      operations.unshift({
        type: "set_status",
        taskId: blockedTask.id,
        status: "blocked",
      });
    }
  }

  const asksForExplicitOrder = /(先[\s\S]+再|优先|顺序|排序|重排)/.test(
    message,
  );
  if (asksForExplicitOrder) {
    const reorder = operations.find(
      (
        operation,
      ): operation is Extract<RefinementOperation, { type: "reorder_tasks" }> =>
        operation.type === "reorder_tasks",
    );
    if (reorder) {
      const position = new Map(
        reorder.taskIds.map((taskId, index) => [taskId, index]),
      );
      for (const taskId of reorder.taskIds) {
        const task = assignment.subtasks.find((item) => item.id === taskId);
        if (!task || task.status === "completed") continue;
        const dependencies = task.dependencies.filter((dependency) => {
          const dependencyPosition = position.get(dependency);
          return (
            dependencyPosition == null ||
            dependencyPosition < (position.get(taskId) ?? 0)
          );
        });
        if (dependencies.length !== task.dependencies.length) {
          operations.unshift({
            type: "update_task",
            taskId,
            patch: { dependencies },
          });
        }
      }
    }
  }

  const sanitizedOperations = sanitizeOperationReferences(
    operations,
    assignment,
  );

  if (
    sanitizedOperations.some((operation) => operation.type !== "reschedule") &&
    !sanitizedOperations.some((operation) => operation.type === "reschedule")
  ) {
    sanitizedOperations.push({ type: "reschedule" });
  }

  const deduplicated = sanitizedOperations
    .filter(
      (operation, index, all) =>
        all.findIndex(
          (candidate) =>
            JSON.stringify(candidate) === JSON.stringify(operation),
        ) === index,
    )
    .slice(0, 64);
  const changed = deduplicated.length > 0;

  const taskById = new Map(
    assignment.subtasks.map((task) => [task.id, task.title]),
  );
  const blocked = deduplicated.find(
    (operation) =>
      operation.type === "set_status" && operation.status === "blocked",
  );
  const reordered = deduplicated.some(
    (operation) => operation.type === "reorder_tasks",
  );
  const dependenciesChanged = deduplicated.some(
    (operation) =>
      operation.type === "update_task" &&
      operation.patch.dependencies !== undefined,
  );
  const availabilityChanged = deduplicated.some(
    (operation) => operation.type === "set_availability",
  );
  const onlyRescheduled =
    deduplicated.length === 1 && deduplicated[0]?.type === "reschedule";

  let verifiedMessage = stringFor(source, [
    "assistantMessage",
    "assistant_message",
    "message",
    "response",
    "summary",
  ]);
  const hasGroundedNarrative =
    stringFor(source, ["understanding"]).length > 0 &&
    (stringFor(source, ["changeSummary", "change_summary"]).length > 0 ||
      Boolean(valueFor(source, ["needsClarification", "needs_clarification"])));
  if (!hasGroundedNarrative) {
    if (blocked?.type === "set_status") {
      verifiedMessage = `已将“${taskById.get(blocked.taskId) ?? "相关任务"}”标记为卡住，并重新安排其他可执行任务。`;
    } else if (reordered && dependenciesChanged) {
      verifiedMessage = "已调整任务顺序和依赖关系，并重新计算后续日程。";
    } else if (reordered) {
      verifiedMessage = "已调整任务顺序，并重新计算后续日程。";
    } else if (availabilityChanged) {
      verifiedMessage = "已更新可用时间，并重新计算后续日程。";
    } else if (onlyRescheduled) {
      verifiedMessage = "已重新计算后续日程，任务内容和顺序保持不变。";
    }
  }

  return refinementOutputSchema.parse({
    assistantMessage:
      verifiedMessage ||
      (changed
        ? "已根据你的最新情况更新计划。"
        : "我没有找到需要修改的计划内容。"),
    changed,
    operations: deduplicated,
  });
}
