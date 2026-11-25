import "server-only";

import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import type {
  PlanApiResponse,
  RefinementApiResponse,
  RefinementDecision,
} from "@/features/pacepal/planning/contracts";
import {
  applyPlanOperations,
  materializeInitialPlan,
  snapshotPlan,
} from "@/features/pacepal/planning/engine";
import {
  generateLiveInitialPlan,
  generateLiveRefinement,
} from "@/features/pacepal/planning/live-model";
import {
  detectPlanningLanguage,
  generateMockInitialDecision,
  generateMockRefinementDecision,
} from "@/features/pacepal/planning/mock-model";
import { providerFailureReason } from "@/features/pacepal/planning/provider-error";
import { serverEnvironment } from "@/lib/env/server";

export async function createTaskPlan(
  assignment: AssignmentInput,
): Promise<PlanApiResponse> {
  let fallback = false;
  let fallbackReason: string | null = null;
  let model: string | null = null;
  let decision;

  if (serverEnvironment.AI_PROVIDER === "mock") {
    decision = generateMockInitialDecision(assignment);
  } else {
    try {
      const result = await generateLiveInitialPlan(assignment);
      decision = result.decision;
      model = result.model;
    } catch (error) {
      console.error(
        "Planning model failed; using the deterministic plan.",
        error,
      );
      fallback = true;
      fallbackReason = providerFailureReason(error);
      decision = generateMockInitialDecision(assignment);
    }
  }

  return {
    fallback,
    fallbackReason,
    model,
    ...materializeInitialPlan(assignment, decision),
  };
}

function safeFailureMessage(assignment: Assignment, message: string) {
  const language = detectPlanningLanguage(message || assignment.title);
  return language === "zh"
    ? "我暂时无法完成这次分析。你的现有计划没有发生任何变化，请稍后再试。"
    : "I could not complete that analysis. Your existing plan has not changed; please try again shortly.";
}

function unchangedResponse(
  assignment: Assignment,
  decision: RefinementDecision,
  options: {
    fallback: boolean;
    fallbackReason: string | null;
    model: string | null;
  },
): RefinementApiResponse {
  return {
    ...options,
    assistantMessage: decision.assistantMessage,
    changed: false,
    confirmationRequired: decision.confirmation === "requested",
    appliedOperations: [],
    plan: snapshotPlan(assignment, assignment.language ?? decision.language),
  };
}

export async function refineTaskPlan(
  assignment: Assignment,
  message: string,
): Promise<RefinementApiResponse> {
  let decision: RefinementDecision;
  let model: string | null = null;

  if (serverEnvironment.AI_PROVIDER === "mock") {
    decision = generateMockRefinementDecision(assignment, message);
  } else {
    try {
      const result = await generateLiveRefinement(assignment, message);
      decision = result.decision;
      model = result.model;
    } catch (error) {
      console.error(
        "Planning refinement failed; preserving the saved plan.",
        error,
      );
      const language = detectPlanningLanguage(message || assignment.title);
      return unchangedResponse(
        assignment,
        {
          language,
          intent: "question",
          assistantMessage: safeFailureMessage(assignment, message),
          confirmation: "not_required",
          operations: [],
        },
        {
          fallback: true,
          fallbackReason: providerFailureReason(error),
          model: null,
        },
      );
    }
  }

  if (
    decision.confirmation === "requested" ||
    decision.operations.length === 0
  ) {
    return unchangedResponse(assignment, decision, {
      fallback: false,
      fallbackReason: null,
      model,
    });
  }

  const result = applyPlanOperations(assignment, decision.operations, {
    language: decision.language,
    summary: decision.assistantMessage,
  });

  return {
    fallback: false,
    fallbackReason: null,
    model,
    assistantMessage: decision.assistantMessage,
    changed: result.changed,
    confirmationRequired: false,
    appliedOperations: decision.operations,
    plan: snapshotPlan(result.assignment, decision.language),
  };
}
