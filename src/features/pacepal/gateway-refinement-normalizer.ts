import { z } from "zod";

import type { Assignment, Subtask } from "@/features/pacepal/model";
import {
  refinementOutputSchema,
  type RefinementOperation,
  type RefinementOutput,
} from "@/features/pacepal/refinement";

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

function directOperation(
  value: unknown,
  assignment: Assignment,
): RefinementOperation | null {
  const source = record(value);
  const rawType = stringFor(source, ["type", "operation", "action"])
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const taskId = stringFor(source, ["taskId", "task_id", "id"]);

  if (/complete|status|progress|reopen|block|pause|postpone/.test(rawType)) {
    const status = statusFor(
      valueFor(source, ["status", "value", "newStatus"]) || rawType,
    );
    return taskId && status ? { type: "set_status", taskId, status } : null;
  }

  if (/update|modify|edit/.test(rawType) && taskId) {
    const current = assignment.subtasks.find((task) => task.id === taskId);
    if (!current) return null;
    const patch = taskPatch(
      valueFor(source, ["patch", "changes", "task"]) ?? source,
      current,
    );
    return Object.keys(patch).length > 0
      ? {
          type: "update_task",
          taskId,
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

  if (/remove|delete/.test(rawType) && taskId) {
    return { type: "remove_task", taskId };
  }

  if (/reorder|sort/.test(rawType)) {
    const taskIds = valueFor(source, ["taskIds", "task_ids", "order"]);
    return Array.isArray(taskIds)
      ? {
          type: "reorder_tasks",
          taskIds: taskIds.map(String).filter(Boolean),
        }
      : null;
  }

  if (/availability|capacity|time/.test(rawType)) {
    const availability = availabilityPatch(source);
    return Object.keys(availability).length > 0
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
    if (Object.keys(patch).length > 0) {
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
    if (status && status !== current.status) {
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

export function normalizeGatewayRefinement(
  value: unknown,
  assignment: Assignment,
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
      if (assignment.subtasks.some((task) => task.id === taskId)) {
        operations.push({ type: "set_status", taskId, status: "completed" });
      }
    }
  }

  const deduplicated = operations
    .filter(
      (operation, index, all) =>
        all.findIndex(
          (candidate) =>
            JSON.stringify(candidate) === JSON.stringify(operation),
        ) === index,
    )
    .slice(0, 24);
  const changed = deduplicated.length > 0;

  return refinementOutputSchema.parse({
    assistantMessage:
      stringFor(source, [
        "assistantMessage",
        "assistant_message",
        "message",
        "response",
        "summary",
      ]) ||
      (changed
        ? "已根据你的最新情况更新计划。"
        : "我没有找到需要修改的计划内容。"),
    changed,
    operations: deduplicated,
  });
}
