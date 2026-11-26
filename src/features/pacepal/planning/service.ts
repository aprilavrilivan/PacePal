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

function destructiveTaskIds(decision: RefinementDecision) {
  return decision.operations.flatMap((operation) => {
    if (operation.type === "delete_task") return [operation.taskId];
    if (operation.type === "merge_tasks") return operation.taskIds;
    return [];
  });
}

function destructiveConfirmationMessage(
  assignment: Assignment,
  decision: RefinementDecision,
) {
  const targetIds = new Set(destructiveTaskIds(decision));
  const targets = assignment.subtasks
    .filter((task) => targetIds.has(task.id))
    .map((task) => task.title);
  const dependents = assignment.subtasks
    .filter((task) => task.dependencies.some((id) => targetIds.has(id)))
    .map((task) => task.title);
  const targetText =
    targets.length > 0 ? `“${targets.join("、")}”` : "这些任务";
  const dependentText =
    dependents.length > 0 ? `，并会影响依赖它的“${dependents.join("、")}”` : "";

  if (decision.language === "zh") {
    return `删除或合并${targetText}${dependentText}，可能让后续工作缺少必要输入。为保护现有计划，我尚未应用任何更改。请确认：这些必要产出是否已在其他地方完成，并且你仍要继续？如果只是想节省时间，建议先把这一步缩短为轻量版本。`;
  }
  return `Deleting or merging ${targets.join(", ") || "these tasks"}${
    dependents.length > 0 ? ` would affect ${dependents.join(", ")}` : ""
  } and may leave later work without required inputs. I have not changed the plan. Please confirm that those outputs are already covered elsewhere and that you still want to continue. If the goal is to save time, consider keeping a lightweight version instead.`;
}

export async function refineTaskPlan(
  assignment: Assignment,
  message: string,
): Promise<RefinementApiResponse> {
  const { decision, model, usage } = await generateLiveRefinement(
    assignment,
    message,
  );

  const destructive = destructiveTaskIds(decision).length > 0;
  if (destructive && decision.confirmation !== "confirmed") {
    return unchangedResponse(
      assignment,
      {
        ...decision,
        assistantMessage:
          decision.confirmation === "requested"
            ? decision.assistantMessage
            : destructiveConfirmationMessage(assignment, decision),
        confirmation: "requested",
      },
      { model, usage },
    );
  }

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
