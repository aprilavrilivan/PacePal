import { z } from "zod";

const taskRecordSchema = z.record(z.string(), z.unknown());

const validatedPlanSchema = z.object({
  tasks: z
    .array(
      z.object({
        completionCriteria: z.string().trim().min(1).max(160),
        description: z.string().trim().min(1).max(240),
        difficulty: z.enum(["low", "medium", "high"]),
        estimatedMinutes: z.number().int().min(5).max(240),
        title: z.string().trim().min(1).max(80),
      }),
    )
    .min(4)
    .max(12),
});

function trimToLength(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength).trim();
}

function readValue(task: Record<string, unknown>, keys: string[]) {
  return keys.map((key) => task[key]).find((value) => value != null);
}

function readString(task: Record<string, unknown>, keys: string[]) {
  const value = readValue(task, keys);
  return typeof value === "string" ? value : "";
}

function readEstimatedMinutes(task: Record<string, unknown>) {
  const value = readValue(task, [
    "estimatedMinutes",
    "estimated_minutes",
    "estimated_time",
    "durationMinutes",
    "duration",
    "time",
  ]);

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 30;
  }

  const amount = Number(value.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(amount)) {
    return 30;
  }

  return /hour|hr|小时/i.test(value) ? amount * 60 : amount;
}

function readDifficulty(
  task: Record<string, unknown>,
  estimatedMinutes: number,
) {
  const value = readString(task, ["difficulty", "complexity", "priority"])
    .trim()
    .toLowerCase();

  if (/high|hard|高|难/.test(value)) return "high" as const;
  if (/medium|moderate|中/.test(value)) return "medium" as const;
  if (/low|easy|低|易/.test(value)) return "low" as const;

  return estimatedMinutes <= 30
    ? ("low" as const)
    : estimatedMinutes <= 60
      ? ("medium" as const)
      : ("high" as const);
}

function findTasks(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  const record = taskRecordSchema.safeParse(value);
  if (!record.success) return [];

  for (const key of ["tasks", "subtasks", "steps", "items"]) {
    if (Array.isArray(record.data[key])) return record.data[key];
  }

  return findTasks(record.data.plan);
}

export function normalizeGatewayPlan(value: unknown) {
  return validatedPlanSchema.parse({
    tasks: findTasks(value)
      .slice(0, 12)
      .map((item) => {
        const task = taskRecordSchema.parse(item);
        const title = trimToLength(
          readString(task, ["title", "task_name", "name", "task", "step"]),
          80,
        );
        const description = trimToLength(
          readString(task, [
            "description",
            "details",
            "detail",
            "content",
            "action",
          ]) || title,
          240,
        );
        const estimatedMinutes = Math.min(
          240,
          Math.max(5, Math.round(readEstimatedMinutes(task))),
        );

        return {
          completionCriteria: trimToLength(
            readString(task, [
              "completionCriteria",
              "completion_criteria",
              "acceptanceCriteria",
              "acceptance_criteria",
              "criteria",
              "done_when",
            ]) || description,
            160,
          ),
          description,
          difficulty: readDifficulty(task, estimatedMinutes),
          estimatedMinutes,
          title,
        };
      }),
  });
}
