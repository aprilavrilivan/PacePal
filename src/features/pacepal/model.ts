import { z } from "zod";

export const prioritySchema = z.enum(["low", "medium", "high"]);
export const energySchema = z.enum(["low", "medium", "high"]);
export const subtaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "paused",
  "postponed",
  "blocked",
  "completed",
]);

export const assignmentInputSchema = z.object({
  title: z.string().trim().min(1),
  requirements: z.string().trim().max(12000),
  deliverable: z.string().trim().max(1200),
  deadline: z.string().min(1),
  priority: prioritySchema,
});

export const subtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  estimatedMinutes: z.number().int().min(5),
  completionCriteria: z.string().trim().min(1),
  difficulty: z.enum(["low", "medium", "high"]),
  dependencies: z.array(z.string()),
  status: subtaskStatusSchema,
  actualMinutes: z.number().int().min(0).default(0),
  activeSince: z.string().nullable().default(null),
  postponedUntil: z.string().nullable().default(null),
  phase: z.string().trim().min(1).optional(),
  taskPriority: prioritySchema.optional(),
});

export const planChangeSchema = z.object({
  version: z.number().int().positive(),
  createdAt: z.string().min(1),
  source: z.enum(["initial", "assistant"]),
  summary: z.string().trim().min(1),
  operationTypes: z.array(z.string().trim().min(1)).max(64),
});

export const scheduleBlockSchema = z.object({
  id: z.string().min(1),
  subtaskId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().positive(),
  locked: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
});

export const checkInSchema = z.object({
  availableMinutes: z.number().int().min(5).max(240),
  energy: energySchema,
});

export const chatErrorCodeSchema = z.enum([
  "model_unavailable",
  "network_error",
  "provider_unavailable",
  "rate_limited",
  "timeout",
  "invalid_output",
  "invalid_dependencies",
  "concurrent_modification",
]);

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
  createdAt: z.string().min(1),
  errorCode: chatErrorCodeSchema.optional(),
  retryForMessageId: z.string().min(1).optional(),
});

export const assignmentSchema = assignmentInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(["planning", "scheduled"]),
  subtasks: z.array(subtaskSchema),
  schedule: z.array(scheduleBlockSchema),
  scheduleVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  checkIn: checkInSchema.default({ availableMinutes: 30, energy: "medium" }),
  scheduleNotice: z.string().default(""),
  chatMessages: z.array(chatMessageSchema).default([]),
  language: z.enum(["zh", "en"]).optional(),
  planVersion: z.number().int().positive().optional(),
  planHistory: z.array(planChangeSchema).max(30).optional(),
  planningSummary: z.string().trim().min(1).optional(),
  planningAssumptions: z.array(z.string().trim().min(1)).max(6).optional(),
});

const legacyAppStateSchema = z.object({
  version: z.literal(1),
  assignment: assignmentSchema.nullable(),
});

const currentAppStateSchema = z.object({
  version: z.literal(2),
  assignments: z.array(assignmentSchema),
  selectedAssignmentId: z.string().nullable(),
});

export const appStateSchema = z
  .union([currentAppStateSchema, legacyAppStateSchema])
  .transform((state) => {
    if (state.version === 2) return state;
    return {
      version: 2 as const,
      assignments: state.assignment ? [state.assignment] : [],
      selectedAssignmentId: state.assignment?.id ?? null,
    };
  });

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type Subtask = z.infer<typeof subtaskSchema>;
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type Energy = z.infer<typeof energySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;
export type PlanChange = z.infer<typeof planChangeSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AppState = z.infer<typeof appStateSchema>;

export const emptyAppState: AppState = {
  version: 2,
  assignments: [],
  selectedAssignmentId: null,
};
