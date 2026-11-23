import { z } from "zod";

import type { Assignment } from "@/features/pacepal/model";
import {
  applyRefinement,
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

export type GatewayRefinementContext = Pick<
  GatewayRefinementDecision,
  | "understanding"
  | "intents"
  | "planChangeRequested"
  | "needsClarification"
  | "clarificationQuestion"
  | "changeSummary"
>;

const contextSchema = gatewayRefinementDecisionSchema.omit({
  operations: true,
});

const intentAliases: Array<
  [GatewayRefinementDecision["intents"][number], RegExp]
> = [
  ["progress_update", /progress|complete|done|finish|进度|完成|做完|正在/i],
  ["remaining_scope", /remain|left|only|还剩|只剩|其他.*完成|剩余/i],
  ["blocker", /block|stuck|卡住|受阻|无法继续|等到|等待/i],
  ["reopen", /reopen|not actually done|其实.*没完成|撤销完成|恢复.*待/i],
  ["task_breakdown", /break.?down|split|拆解|拆小|细分|小步骤/i],
  ["task_edit", /edit|update|change|rename|修改|改成|调整内容|更名/i],
  ["task_structure", /add|remove|delete|merge|新增|添加|删除|合并/i],
  ["reorder", /reorder|sort|prioriti[sz]e|先.+再|顺序|排序|优先|提前/i],
  ["reestimate", /estimate|duration|minutes?|hours?|耗时|估时|分钟|小时/i],
  [
    "schedule",
    /schedule|reschedule|replan|rebalance|安排|日程|重新规划|重新平衡/i,
  ],
  ["advice", /advice|suggest|how should|建议|怎么做|怎么办/i],
  ["clarification", /clarif|不清楚|需要确认|请确认/i],
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|是)$/i.test(value.trim())) return true;
    if (/^(false|no|否)$/i.test(value.trim())) return false;
  }
  return fallback;
}

function intentValues(value: unknown, message: string) {
  const candidates = Array.isArray(value) ? value : [];
  const intents = candidates.flatMap((candidate) => {
    const parsed = refinementIntentSchema.safeParse(candidate);
    if (parsed.success) return [parsed.data];
    const text = String(candidate);
    return intentAliases
      .filter(([, pattern]) => pattern.test(text))
      .map(([intent]) => intent);
  });
  const inferred = intentAliases
    .filter(([, pattern]) => pattern.test(message))
    .map(([intent]) => intent);
  return [...new Set([...intents, ...inferred])].slice(0, 8);
}

export function coerceGatewayRefinementContext(
  value: unknown,
  message: string,
  assignmentTitle: string,
): GatewayRefinementContext {
  const strict = gatewayRefinementDecisionSchema.safeParse(value);
  if (strict.success) {
    const { operations, ...context } = strict.data;
    void operations;
    return context;
  }

  const source = record(value);
  const operations = Array.isArray(source.operations)
    ? source.operations
    : Array.isArray(source.actions)
      ? source.actions
      : Array.isArray(source.changes)
        ? source.changes
        : [];
  const intents = intentValues(
    source.intents ?? source.intent ?? source.intentions,
    message,
  );
  const effectiveIntents =
    intents.length > 0 ? intents : ["task_edit" as const];
  const needsClarification = booleanValue(
    source.needsClarification ?? source.needs_clarification,
    false,
  );
  const understanding =
    firstString(source, ["understanding", "interpretation", "analysis"]) ||
    `我理解你希望根据最新说明调整“${assignmentTitle}”的任务计划。`;
  const changeSummary =
    firstString(source, [
      "changeSummary",
      "change_summary",
      "assistantMessage",
      "assistant_message",
      "message",
      "summary",
    ]) || "我已根据你的说明更新相关任务，并重新计算后续安排。";

  return contextSchema.parse({
    understanding,
    intents: effectiveIntents,
    planChangeRequested: booleanValue(
      source.planChangeRequested ?? source.plan_change_requested,
      operations.length > 0 ||
        effectiveIntents.some(
          (intent) => intent !== "advice" && intent !== "clarification",
        ),
    ),
    needsClarification,
    clarificationQuestion: firstString(source, [
      "clarificationQuestion",
      "clarification_question",
      "question",
    ]),
    changeSummary,
  });
}

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
  decision: GatewayRefinementContext,
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

  if (mutations.length > 0) {
    const applied = applyRefinement(assignment, output);
    const before = JSON.stringify({
      availability: assignment.availability,
      subtasks: assignment.subtasks,
    });
    const after = JSON.stringify({
      availability: applied.availability,
      subtasks: applied.subtasks,
    });
    if (before === after) {
      issues.push(
        "The proposed task mutations do not change the saved plan after validation.",
      );
    }
  }

  return issues;
}
