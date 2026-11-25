import { z } from "zod";

import {
  assignmentInputSchema,
  assignmentSchema,
  availabilitySchema,
  planChangeSchema,
  prioritySchema,
  subtaskSchema,
  subtaskStatusSchema,
} from "@/features/pacepal/model";

export const planningLanguageSchema = z.enum(["zh", "en"]);

export const draftTaskSchema = z.object({
  tempId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1200),
  estimatedMinutes: z.number().int().min(5).max(600),
  completionCriteria: z.string().trim().min(1).max(600),
  difficulty: z.enum(["low", "medium", "high"]),
  priority: prioritySchema,
  dependencies: z.array(z.string().trim().min(1)).max(12),
});

export const draftPhaseSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  tasks: z.array(draftTaskSchema).min(1).max(12),
});

export const initialPlanDecisionSchema = z.object({
  language: planningLanguageSchema,
  needsClarification: z.boolean(),
  clarifyingQuestion: z.string().trim().min(1).max(600).nullable(),
  taskUnderstanding: z.string().trim().min(1).max(1200),
  assumptions: z.array(z.string().trim().min(1).max(300)).max(6),
  phases: z.array(draftPhaseSchema).max(8),
});

const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(1200).optional(),
    estimatedMinutes: z.number().int().min(5).max(600).optional(),
    completionCriteria: z.string().trim().min(1).max(600).optional(),
    difficulty: z.enum(["low", "medium", "high"]).optional(),
    priority: prioritySchema.optional(),
    phase: z.string().trim().min(1).max(120).optional(),
    dependencies: z.array(z.string().trim().min(1)).max(12).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "A task update must contain at least one change.",
  });

export const planOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_status"),
    taskId: z.string().trim().min(1),
    status: subtaskStatusSchema,
  }),
  z.object({
    type: z.literal("reopen_task"),
    taskId: z.string().trim().min(1),
    status: z.enum(["todo", "in_progress", "paused", "postponed", "blocked"]),
  }),
  z.object({
    type: z.literal("update_task"),
    taskId: z.string().trim().min(1),
    changes: taskPatchSchema,
  }),
  z.object({
    type: z.literal("add_task"),
    afterTaskId: z.string().trim().min(1).nullable(),
    task: draftTaskSchema.extend({ phase: z.string().trim().min(1).max(120) }),
  }),
  z.object({
    type: z.literal("delete_task"),
    taskId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("split_task"),
    taskId: z.string().trim().min(1),
    tasks: z
      .array(
        draftTaskSchema.extend({ phase: z.string().trim().min(1).max(120) }),
      )
      .min(2)
      .max(8),
  }),
  z.object({
    type: z.literal("merge_tasks"),
    taskIds: z.array(z.string().trim().min(1)).min(2).max(8),
    task: draftTaskSchema.extend({ phase: z.string().trim().min(1).max(120) }),
  }),
  z.object({
    type: z.literal("reorder_tasks"),
    taskIds: z.array(z.string().trim().min(1)).min(1).max(64),
  }),
  z.object({
    type: z.literal("rename_phase"),
    from: z.string().trim().min(1).max(120),
    to: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal("set_availability"),
    availability: availabilitySchema.partial(),
  }),
  z.object({
    type: z.literal("update_assignment"),
    changes: assignmentInputSchema.partial(),
  }),
  z.object({ type: z.literal("reschedule") }),
]);

export const refinementIntentSchema = z.enum([
  "progress_update",
  "plan_modification",
  "task_breakdown",
  "circumstance_change",
  "question",
  "difficulty",
  "unrelated",
  "confirmation",
]);

export const refinementDecisionSchema = z.object({
  language: planningLanguageSchema,
  intent: refinementIntentSchema,
  assistantMessage: z.string().trim().min(1).max(4000),
  confirmation: z.enum(["not_required", "requested", "confirmed"]),
  operations: z.array(planOperationSchema).max(64),
});

export const refinementRequestSchema = z.object({
  assignment: assignmentSchema,
  message: z.string().trim().min(1).max(6000),
});

export const planSnapshotSchema = z.object({
  title: z.string().trim().min(1),
  requirements: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  deadline: z.string().min(1),
  priority: prioritySchema,
  availability: availabilitySchema,
  subtasks: z.array(subtaskSchema).min(1),
  language: planningLanguageSchema,
  planVersion: z.number().int().positive(),
  planHistory: z.array(planChangeSchema).max(30),
});

export const modelUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const planApiResponseSchema = z
  .object({
    model: z.string().min(1),
    usage: modelUsageSchema,
    needsClarification: z.boolean(),
    language: planningLanguageSchema,
    assistantMessage: z.string().trim().min(1),
    assumptions: z.array(z.string()),
    planVersion: z.number().int().positive(),
    planHistory: z.array(planChangeSchema),
    subtasks: z.array(subtaskSchema),
  })
  .superRefine((value, context) => {
    if (value.needsClarification && value.subtasks.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A clarification response must not include tasks.",
        path: ["subtasks"],
      });
    }
    if (!value.needsClarification && value.subtasks.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A plan response must include tasks.",
        path: ["subtasks"],
      });
    }
  });

export const refinementApiResponseSchema = z.object({
  model: z.string().min(1),
  usage: modelUsageSchema,
  assistantMessage: z.string().trim().min(1),
  changed: z.boolean(),
  confirmationRequired: z.boolean(),
  appliedOperations: z.array(planOperationSchema),
  plan: planSnapshotSchema,
});

export type DraftTask = z.infer<typeof draftTaskSchema>;
export type DraftPhase = z.infer<typeof draftPhaseSchema>;
export type InitialPlanDecision = z.infer<typeof initialPlanDecisionSchema>;
export type PlanOperation = z.infer<typeof planOperationSchema>;
export type RefinementDecision = z.infer<typeof refinementDecisionSchema>;
export type PlanSnapshot = z.infer<typeof planSnapshotSchema>;
export type ModelUsage = z.infer<typeof modelUsageSchema>;
export type PlanApiResponse = z.infer<typeof planApiResponseSchema>;
export type RefinementApiResponse = z.infer<typeof refinementApiResponseSchema>;
