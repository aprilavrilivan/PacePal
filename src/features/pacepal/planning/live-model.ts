import "server-only";

import { gateway, generateText, type LanguageModelUsage, Output } from "ai";

import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import {
  initialPlanDecisionSchema,
  refinementDecisionSchema,
  taskGroupingProposalSchema,
  taskSplitProposalSchema,
  type InitialPlanDecision,
  type ModelUsage,
  type RefinementDecision,
} from "@/features/pacepal/planning/contracts";
import {
  applyPlanOperations,
  buildTaskGroupingOperations,
  buildTaskSplitOperations,
  normalizeTaskGrouping,
  PlanValidationError,
  validateDraftPhases,
} from "@/features/pacepal/planning/engine";
import {
  classifyPlanValidation,
  classifyPlanningFailure,
  PlanningRequestError,
  safeProviderError,
} from "@/features/pacepal/planning/provider-error";
import {
  initialPlanSystemPrompt,
  initialPlanUserPrompt,
  refinementSystemPrompt,
  refinementUserPrompt,
  requestedTaskGroupingCount,
  requestsTaskCount,
  requestsTaskSplit,
  resolveTaskSplitSourceIndex,
  taskGroupingPrompt,
  taskSplitPrompt,
} from "@/features/pacepal/planning/prompts";
import { withPlanningTimeout } from "@/features/pacepal/planning/timeout";

export const planningModel = "deepseek/deepseek-v4.1-flash-1017";
export const planningRequestTimeoutMs = 75_000;

function modelUsage(usage: LanguageModelUsage): ModelUsage {
  return {
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? 0,
    totalTokens:
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };
}

function withoutTaskNoOps(
  decision: RefinementDecision,
  assignment: Assignment,
): RefinementDecision {
  const operations = decision.operations.filter((operation) => {
    const task =
      "taskId" in operation
        ? assignment.subtasks.find((item) => item.id === operation.taskId)
        : undefined;
    if (operation.type === "set_status") {
      return !task || task.status !== operation.status;
    }
    if (operation.type !== "update_task" || !task) return true;

    const changes = operation.changes;
    return (
      (changes.title !== undefined && changes.title !== task.title) ||
      (changes.description !== undefined &&
        changes.description !== task.description) ||
      (changes.estimatedMinutes !== undefined &&
        changes.estimatedMinutes !== task.estimatedMinutes) ||
      (changes.completionCriteria !== undefined &&
        changes.completionCriteria !== task.completionCriteria) ||
      (changes.difficulty !== undefined &&
        changes.difficulty !== task.difficulty) ||
      (changes.priority !== undefined &&
        changes.priority !== task.taskPriority) ||
      (changes.phase !== undefined && changes.phase !== task.phase) ||
      (changes.dependencies !== undefined &&
        JSON.stringify(changes.dependencies) !==
          JSON.stringify(task.dependencies))
    );
  });
  return operations.length === decision.operations.length
    ? decision
    : { ...decision, operations };
}

function explicitlyRequestsRebuild(message: string) {
  return /(?:完全|整体|全部).{0,20}(?:换一种|重新|重建|重做|重新安排)|(?:重新|重建|重做).{0,20}(?:计划|规划|后续|剩余)|(?:rebuild|replace|redo|start over).{0,30}(?:plan|remaining work)/i.test(
    message,
  );
}

function normalizeRefinementDecision(
  decision: RefinementDecision,
  assignment: Assignment,
  message: string,
) {
  const normalized = withoutTaskNoOps(decision, assignment);
  const destructive = normalized.operations.some((operation) =>
    ["delete_task", "merge_tasks"].includes(operation.type),
  );
  return destructive && explicitlyRequestsRebuild(message)
    ? { ...normalized, confirmation: "confirmed" as const }
    : normalized;
}

function decisionValidationError(
  decision: RefinementDecision,
  assignment: Assignment,
) {
  if (decision.confirmation === "requested") {
    // The service discards every proposed operation until the user confirms.
    return "";
  }
  const destructive = decision.operations.some((operation) =>
    ["delete_task", "merge_tasks"].includes(operation.type),
  );
  if (destructive && decision.confirmation !== "confirmed") {
    // The service converts an unconfirmed destructive proposal into a safe
    // confirmation response without applying it.
    return "";
  }

  try {
    applyPlanOperations(assignment, decision.operations, {
      language: decision.language,
      summary: decision.assistantMessage,
      now: new Date(0),
    });
    return "";
  } catch (error) {
    if (error instanceof PlanValidationError) return error.issues.join(" | ");
    throw error;
  }
}

async function runPlanningCall<T>(options: {
  generate: (
    abortSignal: AbortSignal,
  ) => Promise<{ usage: LanguageModelUsage; value: T }>;
  validate: (value: T) => string;
}): Promise<{ usage: ModelUsage; value: T }> {
  try {
    const result = await withPlanningTimeout(
      options.generate,
      planningRequestTimeoutMs,
    );
    const issue = options.validate(result.value);
    if (issue) throw new PlanValidationError([issue]);
    return { usage: modelUsage(result.usage), value: result.value };
  } catch (error) {
    const reason =
      error instanceof PlanValidationError
        ? classifyPlanValidation(error.issues)
        : classifyPlanningFailure(error);
    console.error(
      `Planning model ${planningModel} failed (${reason}). ${safeProviderError(error)}`,
    );
    throw new PlanningRequestError(reason);
  }
}

function groupingMessage(
  language: "zh" | "en",
  beforeCount: number,
  titles: string[],
) {
  return language === "zh"
    ? `已将 ${beforeCount} 个任务整理为 ${titles.length} 步：${titles.join("、")}。原有工作内容、状态和耗时均已保留，依赖关系由系统重新生成。`
    : `I grouped the ${beforeCount} tasks into ${titles.length} steps: ${titles.join(", ")}. The original work, progress, and durations were preserved, and dependencies were rebuilt by the system.`;
}

async function generateLiveTaskGrouping(
  assignment: Assignment,
  targetCount: number,
) {
  const result = await runPlanningCall({
    generate: async (abortSignal) => {
      const response = await generateText({
        abortSignal,
        maxOutputTokens: 4000,
        maxRetries: 0,
        model: gateway(planningModel),
        output: Output.object({
          description:
            "A complete mapping from existing task ids to a fixed number of semantic groups.",
          name: "pacepal_task_grouping",
          schema: taskGroupingProposalSchema,
        }),
        reasoning: "low",
        prompt: taskGroupingPrompt(assignment, targetCount),
      });
      return { usage: response.usage, value: response.output };
    },
    validate: (value) => {
      try {
        normalizeTaskGrouping(assignment, value, targetCount);
        return "";
      } catch (error) {
        return error instanceof PlanValidationError
          ? error.issues.join(" | ")
          : "The generated grouping is invalid.";
      }
    },
  });
  const groups = normalizeTaskGrouping(assignment, result.value, targetCount);
  return {
    decision: {
      language: result.value.language,
      intent: "plan_modification" as const,
      assistantMessage: groupingMessage(
        result.value.language,
        assignment.subtasks.length,
        groups.map((group) => group.title),
      ),
      confirmation: "confirmed" as const,
      operations: buildTaskGroupingOperations(
        assignment,
        result.value,
        targetCount,
      ),
    },
    model: planningModel,
    usage: result.usage,
  };
}

async function generateLiveTaskSplit(assignment: Assignment, message: string) {
  const sourceTaskIndex = resolveTaskSplitSourceIndex(assignment, message);
  const language: "zh" | "en" = /[\p{Script=Han}]/u.test(message) ? "zh" : "en";
  if (!sourceTaskIndex) {
    return {
      decision: {
        language,
        intent: "task_breakdown" as const,
        assistantMessage:
          language === "zh"
            ? "我还不能确定你想拆分哪一个任务，请直接告诉我任务名称。"
            : "I cannot tell which task you want to split yet. Please name the task.",
        confirmation: "not_required" as const,
        operations: [],
      },
      model: planningModel,
      usage: {
        cacheReadTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
    };
  }
  const result = await runPlanningCall({
    generate: async (abortSignal) => {
      const response = await generateText({
        abortSignal,
        maxOutputTokens: 1000,
        maxRetries: 0,
        model: gateway(planningModel),
        reasoning: "low",
        prompt: taskSplitPrompt(assignment, message, sourceTaskIndex),
      });
      const titles = response.text
        .split("\n")
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
        .filter((line) => line && !line.startsWith("```"));
      return {
        usage: response.usage,
        value: taskSplitProposalSchema.parse({ titles }),
      };
    },
    validate: (value) => {
      try {
        const operations = buildTaskSplitOperations(
          assignment,
          value,
          sourceTaskIndex,
        );
        applyPlanOperations(assignment, operations, {
          language,
          summary: "Validate task split.",
          now: new Date(0),
        });
        return "";
      } catch (error) {
        return error instanceof PlanValidationError
          ? error.issues.join(" | ")
          : "The generated task split is invalid.";
      }
    },
  });
  const operations = buildTaskSplitOperations(
    assignment,
    result.value,
    sourceTaskIndex,
  );
  const source = assignment.subtasks[sourceTaskIndex - 1]!;
  return {
    decision: {
      language,
      intent: "task_breakdown" as const,
      assistantMessage:
        language === "zh"
          ? `已将“${source.title}”拆成 ${result.value.titles.length} 步：${result.value.titles.join("、")}。原任务的进度、总耗时和依赖均已保留。`
          : `I split “${source.title}” into ${result.value.titles.length} steps: ${result.value.titles.join(", ")}. Its progress, total duration, and dependencies were preserved.`,
      confirmation: "not_required" as const,
      operations,
    },
    model: planningModel,
    usage: result.usage,
  };
}

function taskCountDecision(assignment: Assignment) {
  const completed = assignment.subtasks.filter(
    (task) => task.status === "completed",
  ).length;
  const remaining = assignment.subtasks.length - completed;
  const language = assignment.language ?? "zh";
  return {
    decision: {
      language,
      intent: "question" as const,
      assistantMessage:
        language === "en"
          ? `This project has ${assignment.subtasks.length} tasks: ${completed} completed and ${remaining} remaining.`
          : `这个项目共有 ${assignment.subtasks.length} 个子任务，其中 ${completed} 个已完成，${remaining} 个未完成。`,
      confirmation: "not_required" as const,
      operations: [],
    },
    model: planningModel,
    usage: {
      cacheReadTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    },
  };
}

export async function generateLiveInitialPlan(
  assignment: AssignmentInput,
): Promise<{
  decision: InitialPlanDecision;
  model: string;
  usage: ModelUsage;
}> {
  const result = await runPlanningCall({
    generate: async (abortSignal) => {
      const response = await generateText({
        abortSignal,
        maxOutputTokens: 8000,
        maxRetries: 0,
        model: gateway(planningModel),
        output: Output.object({
          description: "A phased, dependency-aware task plan proposal.",
          name: "pacepal_initial_plan",
          schema: initialPlanDecisionSchema,
        }),
        reasoning: "medium",
        system: initialPlanSystemPrompt(),
        prompt: initialPlanUserPrompt(assignment),
      });
      return { usage: response.usage, value: response.output };
    },
    validate: (value) => {
      if (value.needsClarification) {
        if (!value.clarifyingQuestion) {
          return "A clarification decision must include one question.";
        }
        if (value.phases.length > 0) {
          return "A clarification decision must not include plan phases.";
        }
        return "";
      }
      if (value.clarifyingQuestion) {
        return "A plan decision must not include a clarification question.";
      }
      try {
        validateDraftPhases(value.phases);
        return "";
      } catch (error) {
        return error instanceof PlanValidationError
          ? error.issues.join(" | ")
          : "The generated plan is invalid.";
      }
    },
  });

  return {
    decision: result.value,
    model: planningModel,
    usage: result.usage,
  };
}

export async function generateLiveRefinement(
  assignment: Assignment,
  message: string,
): Promise<{
  decision: RefinementDecision;
  model: string;
  usage: ModelUsage;
}> {
  if (requestsTaskCount(message)) return taskCountDecision(assignment);
  const groupingCount = requestedTaskGroupingCount(message);
  if (groupingCount !== null && groupingCount < assignment.subtasks.length) {
    return generateLiveTaskGrouping(assignment, groupingCount);
  }
  if (requestsTaskSplit(message)) {
    return generateLiveTaskSplit(assignment, message);
  }

  const result = await runPlanningCall({
    generate: async (abortSignal) => {
      const response = await generateText({
        abortSignal,
        maxOutputTokens: 8000,
        maxRetries: 0,
        model: gateway(planningModel),
        output: Output.object({
          description:
            "A conversational response and the smallest validated plan-operation set needed for the user's request.",
          name: "pacepal_plan_refinement",
          schema: refinementDecisionSchema,
        }),
        reasoning: "low",
        system: refinementSystemPrompt(),
        prompt: refinementUserPrompt(assignment, message, ""),
      });
      return {
        usage: response.usage,
        value: normalizeRefinementDecision(
          response.output,
          assignment,
          message,
        ),
      };
    },
    validate: (value) => decisionValidationError(value, assignment),
  });

  return {
    decision: result.value,
    model: planningModel,
    usage: result.usage,
  };
}

export type PlanningModelProbe = {
  configured: boolean;
  model: string;
  reachable: boolean;
  reason: string | null;
};

export async function probePlanningModel(): Promise<PlanningModelProbe> {
  try {
    const { text } = await withPlanningTimeout(
      (abortSignal) =>
        generateText({
          abortSignal,
          maxOutputTokens: 64,
          maxRetries: 0,
          model: gateway(planningModel),
          prompt: "Reply with only OK.",
          reasoning: "low",
        }),
      10_000,
    );
    const reachable = text.trim().length > 0;
    return {
      configured: true,
      model: planningModel,
      reachable,
      reason: reachable ? null : "Unexpected probe response.",
    };
  } catch (error) {
    const reason = classifyPlanningFailure(error);
    return {
      configured: !["authentication", "configuration"].includes(reason),
      model: planningModel,
      reachable: false,
      reason,
    };
  }
}
