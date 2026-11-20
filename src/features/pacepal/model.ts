import { z } from "zod";

export const prioritySchema = z.enum(["low", "medium", "high"]);
export const subtaskStatusSchema = z.enum(["todo", "completed"]);

export const assignmentInputSchema = z.object({
  title: z.string().trim().min(1),
  requirements: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
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
});

export const availabilitySchema = z.object({
  dailyMinutes: z.number().int().min(15).max(240),
  preferredTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const scheduleBlockSchema = z.object({
  id: z.string().min(1),
  subtaskId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive(),
});

export const assignmentSchema = assignmentInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  status: z.enum(["planning", "scheduled"]),
  subtasks: z.array(subtaskSchema),
  availability: availabilitySchema,
  schedule: z.array(scheduleBlockSchema),
  unscheduledMinutes: z.number().int().min(0),
});

export const appStateSchema = z.object({
  version: z.literal(1),
  assignment: assignmentSchema.nullable(),
});

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type Subtask = z.infer<typeof subtaskSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type ScheduleBlock = z.infer<typeof scheduleBlockSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type AppState = z.infer<typeof appStateSchema>;

export const emptyAppState: AppState = {
  version: 1,
  assignment: null,
};
