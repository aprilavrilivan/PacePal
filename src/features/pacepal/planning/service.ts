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

export async function createTaskPlan(
  assignment: AssignmentInput,
): Promise<PlanApiResponse> {
  const result = await generateLiveInitialPlan(assignment);
  if (result.decision.needsClarification) {
    return {
      model: result.model,
      usage: result.usage,
      needsClarification: true,
      language: result.decision.language,
      assistantMessage: result.decision.clarifyingQuestion!,
      assumptions: [],
      planVersion: 1,
      planHistory: [],
      subtasks: [],
    };
  }
  return {
    model: result.model,
    usage: result.usage,
    needsClarification: false,
    ...materializeInitialPlan(assignment, result.decision),
  };
}

function unchangedResponse(
  assignment: Assignment,
  decision: RefinementDecision,
  options: {
    model: string;
    usage: RefinementApiResponse["usage"];
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
  const { decision, model, usage } = await generateLiveRefinement(
    assignment,
    message,
  );

  if (
    decision.confirmation === "requested" ||
    decision.operations.length === 0
  ) {
    return unchangedResponse(assignment, decision, {
      model,
      usage,
    });
  }

  const result = applyPlanOperations(assignment, decision.operations, {
    language: decision.language,
    summary: decision.assistantMessage,
  });

  return {
    model,
    usage,
    assistantMessage: decision.assistantMessage,
    changed: result.changed,
    confirmationRequired: false,
    appliedOperations: decision.operations,
    plan: snapshotPlan(result.assignment, decision.language),
  };
}
