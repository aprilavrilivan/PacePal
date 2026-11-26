import "server-only";

import { gateway, generateText, type LanguageModelUsage, Output } from "ai";

import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import {
  initialPlanDecisionSchema,
  refinementDecisionSchema,
  type InitialPlanDecision,
  type ModelUsage,
  type RefinementDecision,
} from "@/features/pacepal/planning/contracts";
import {
  applyPlanOperations,
  PlanValidationError,
  validateDraftPhases,
} from "@/features/pacepal/planning/engine";
import {
  classifyPlanningFailure,
  PlanningProviderError,
  safeProviderError,
} from "@/features/pacepal/planning/provider-error";
import {
  initialPlanSystemPrompt,
  initialPlanUserPrompt,
  refinementSystemPrompt,
  refinementUserPrompt,
} from "@/features/pacepal/planning/prompts";
import { withPlanningTimeout } from "@/features/pacepal/planning/timeout";

export const planningModel = "deepseek/deepseek-v4.1-flash-1017";
export const planningRequestTimeoutMs = 60_000;

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
    const reason = classifyPlanningFailure(error);
    console.error(
      `Planning model ${planningModel} failed (${reason}). ${safeProviderError(error)}`,
    );
    throw new PlanningProviderError(reason);
  }
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
        value: withoutTaskNoOps(response.output, assignment),
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
