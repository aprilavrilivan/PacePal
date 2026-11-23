import { z } from "zod";

import type { Assignment } from "@/features/pacepal/model";
import {
  refinementOperationSchema,
  type RefinementOutput,
} from "@/features/pacepal/refinement";

export const refinementIntentSchema = z.enum([
  "progress_update",
  "remaining_scope",
  "blocker",
  "reopen",
  "task_breakdown",
  "task_edit",
  "task_structure",
  "reorder",
  "reestimate",
  "schedule",
  "advice",
  "clarification",
]);

export const gatewayRefinementDecisionSchema = z.object({
  understanding: z.string().trim().min(1).max(1200),
  intents: z.array(refinementIntentSchema).min(1).max(8),
  planChangeRequested: z.boolean(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().trim().max(600),
  changeSummary: z.string().trim().max(1600),
  operations: z.array(refinementOperationSchema).max(64),
});

export type GatewayRefinementDecision = z.infer<
  typeof gatewayRefinementDecisionSchema
>;

const mutationIntents = new Set<GatewayRefinementDecision["intents"][number]>([
  "progress_update",
  "remaining_scope",
  "blocker",
  "reopen",
  "task_breakdown",
  "task_edit",
  "task_structure",
  "reorder",
  "reestimate",
]);

export function refinementQualityIssues(
  decision: GatewayRefinementDecision,
  output: RefinementOutput,
  assignment: Assignment,
) {
  const issues: string[] = [];
  const operations = output.operations;
  const mutations = operations.filter(
    (operation) => operation.type !== "reschedule",
  );
  const hasIntent = (...intents: GatewayRefinementDecision["intents"]) =>
    intents.some((intent) => decision.intents.includes(intent));

  if (decision.needsClarification) {
    if (!decision.clarificationQuestion) {
      issues.push(
        "Clarification is marked as required but no question is given.",
      );
    }
    return issues;
  }

  const requiresMutation = decision.intents.some((intent) =>
    mutationIntents.has(intent),
  );
  if (requiresMutation && mutations.length === 0) {
    issues.push(
      "The request requires a real task mutation, but the result only reschedules or does nothing.",
    );
  }

  if (
    decision.planChangeRequested &&
    operations.length === 0 &&
    !hasIntent("advice")
  ) {
    issues.push(
      "The user requested a plan change but no operation was produced.",
    );
  }

  if (
    hasIntent("progress_update", "remaining_scope") &&
    !operations.some((operation) => operation.type === "set_status")
  ) {
    issues.push("A progress update must change at least one task status.");
  }

  if (
    hasIntent("blocker") &&
    !operations.some(
      (operation) =>
        operation.type === "set_status" && operation.status === "blocked",
    )
  ) {
    issues.push("A blocker report must mark the matching task as blocked.");
  }

  if (
    hasIntent("reopen") &&
    !operations.some((operation) => operation.type === "reopen_task")
  ) {
    issues.push("A reopen request must reopen the matching completed task.");
  }

  if (
    hasIntent("task_breakdown") &&
    !operations.some(
      (operation) =>
        operation.type === "add_task" ||
        operation.type === "update_task" ||
        operation.type === "remove_task",
    )
  ) {
    issues.push("A task breakdown request must add or rewrite task steps.");
  }

  if (
    hasIntent("task_edit", "task_structure") &&
    !operations.some((operation) =>
      ["add_task", "update_task", "remove_task"].includes(operation.type),
    )
  ) {
    issues.push(
      "A task edit request must change the task structure or content.",
    );
  }

  if (
    hasIntent("reorder") &&
    assignment.subtasks.filter((task) => task.status !== "completed").length >
      1 &&
    !operations.some((operation) => operation.type === "reorder_tasks")
  ) {
    issues.push("A reorder request must return a new unfinished-task order.");
  }

  if (
    hasIntent("reestimate") &&
    !operations.some(
      (operation) =>
        operation.type === "update_task" &&
        operation.patch.estimatedMinutes !== undefined,
    )
  ) {
    issues.push("A re-estimation request must update at least one duration.");
  }

  if (
    operations.some((operation) => operation.type !== "reschedule") &&
    !operations.some((operation) => operation.type === "reschedule")
  ) {
    issues.push("Task mutations must be followed by a schedule recalculation.");
  }

  if (output.changed && decision.changeSummary.length < 12) {
    issues.push("The change summary is too short to explain what changed.");
  }

  return issues;
}
