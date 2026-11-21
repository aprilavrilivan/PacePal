import { z } from "zod";

import type { Assignment } from "@/features/pacepal/model";
import {
  refinementOutputSchema,
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

function minutesFor(source: Record<string, unknown>) {
  const value = valueFor(source, [
    "estimatedMinutes",
    "estimated_minutes",
    "durationMinutes",
    "duration",
    "time",
  ]);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 30;

  const amount = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(amount)) return 30;
  return /hour|hr|小时/i.test(value) ? amount * 60 : amount;
}

function difficultyFor(source: Record<string, unknown>, minutes: number) {
  const value = stringFor(source, ["difficulty", "complexity", "priority"])
    .toLowerCase()
    .trim();
  if (/high|hard|高|难/.test(value)) return "high" as const;
  if (/low|easy|低|易/.test(value)) return "low" as const;
  if (/medium|moderate|中/.test(value)) return "medium" as const;
  return minutes <= 30 ? "low" : minutes <= 60 ? "medium" : "high";
}

function taskArray(value: unknown) {
  if (Array.isArray(value)) return value;
  const source = record(value);
  for (const key of ["subtasks", "tasks", "steps", "items"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  if (source.plan == null) return [];
  return taskArray(source.plan);
}

function availabilityFor(
  source: Record<string, unknown>,
  assignment: Assignment,
) {
  const availability = record(
    valueFor(source, ["availability", "schedulePreferences", "capacity"]),
  );
  const rawMinutes = valueFor(availability, [
    "dailyMinutes",
    "daily_minutes",
    "minutesPerDay",
  ]);
  const parsedMinutes =
    typeof rawMinutes === "number"
      ? rawMinutes
      : Number(String(rawMinutes ?? "").match(/\d+/)?.[0]);
  const dailyMinutes = Number.isFinite(parsedMinutes)
    ? Math.min(240, Math.max(15, Math.round(parsedMinutes)))
    : assignment.availability.dailyMinutes;
  const preferredTime = stringFor(availability, [
    "preferredTime",
    "preferred_time",
    "startTime",
  ]);

  return {
    dailyMinutes,
    preferredTime: /^\d{2}:\d{2}$/.test(preferredTime)
      ? preferredTime
      : assignment.availability.preferredTime,
  };
}

function dependenciesFor(source: Record<string, unknown>) {
  const value = valueFor(source, ["dependencies", "dependsOn", "depends_on"]);
  if (!Array.isArray(value)) return [];
  return value
    .map((dependency) =>
      typeof dependency === "string" || typeof dependency === "number"
        ? String(dependency)
        : "",
    )
    .filter(Boolean);
}

export function normalizeGatewayRefinement(
  value: unknown,
  assignment: Assignment,
): RefinementOutput {
  const source = record(value);
  const existingIds = new Set(assignment.subtasks.map((task) => task.id));
  const usedIds = new Set<string>();
  const rawTasks = taskArray(value).slice(0, 16);
  const tasks = (rawTasks.length > 0 ? rawTasks : assignment.subtasks).map(
    (item, index) => {
      const task = record(item);
      const previous = assignment.subtasks[index];
      const proposedId = stringFor(task, ["id", "taskId", "task_id"]);
      let id =
        (proposedId && existingIds.has(proposedId) && proposedId) ||
        previous?.id ||
        proposedId ||
        `ai-task-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);

      const title =
        stringFor(task, ["title", "task_name", "name", "task", "step"]) ||
        previous?.title ||
        `任务 ${index + 1}`;
      const description =
        stringFor(task, ["description", "details", "action", "content"]) ||
        previous?.description ||
        title;
      const estimatedMinutes = Math.min(
        600,
        Math.max(5, Math.round(minutesFor(task))),
      );

      return {
        completionCriteria:
          stringFor(task, [
            "completionCriteria",
            "completion_criteria",
            "acceptanceCriteria",
            "criteria",
            "done_when",
          ]) ||
          previous?.completionCriteria ||
          description,
        dependencies: dependenciesFor(task),
        description,
        difficulty: difficultyFor(task, estimatedMinutes),
        estimatedMinutes,
        id,
        title,
      };
    },
  );

  const validIds = new Set(tasks.map((task) => task.id));
  const subtasks = tasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter(
      (dependency) => validIds.has(dependency) && dependency !== task.id,
    ),
  }));
  const availability = availabilityFor(source, assignment);
  const proposedChanged = valueFor(source, ["changed", "planChanged"]);
  const currentTasks = assignment.subtasks.map(
    ({
      id,
      title,
      description,
      estimatedMinutes,
      completionCriteria,
      difficulty,
      dependencies,
    }) => ({
      completionCriteria,
      dependencies,
      description,
      difficulty,
      estimatedMinutes,
      id,
      title,
    }),
  );
  const inferredChanged =
    JSON.stringify(subtasks) !== JSON.stringify(currentTasks) ||
    JSON.stringify(availability) !== JSON.stringify(assignment.availability);
  const changed =
    typeof proposedChanged === "boolean"
      ? proposedChanged || inferredChanged
      : inferredChanged;

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
        ? "已根据你的要求更新任务和安排。"
        : "当前计划没有需要修改的地方。"),
    availability,
    changed,
    subtasks,
  });
}
