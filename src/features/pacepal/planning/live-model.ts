import "server-only";

import { createGoogle } from "@ai-sdk/google";
import { gateway, generateText, Output } from "ai";

import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import {
  initialPlanDecisionSchema,
  refinementDecisionSchema,
  type InitialPlanDecision,
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
  type PlanningFailureAttempt,
} from "@/features/pacepal/planning/provider-error";
import {
  initialPlanSystemPrompt,
  initialPlanUserPrompt,
  refinementSystemPrompt,
  refinementUserPrompt,
} from "@/features/pacepal/planning/prompts";
import { withPlanningTimeout } from "@/features/pacepal/planning/timeout";
import { serverEnvironment } from "@/lib/env/server";

export const planningRequestTimeoutMs = 55_000;
export const planningAttemptTimeoutsMs = [36_000, 16_000] as const;

export type ModelProfile = {
  id: string;
  provider: "google" | "gateway";
};

export function planningModelProfiles(): ModelProfile[] {
  const gatewayProfile: ModelProfile = {
    id: `google/${serverEnvironment.GOOGLE_GENERATIVE_AI_MODEL}`,
    provider: "gateway",
  };
  if (serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY) {
    return [
      {
        id: serverEnvironment.GOOGLE_GENERATIVE_AI_MODEL,
        provider: "google",
      },
      gatewayProfile,
    ];
  }
  return [gatewayProfile];
}

export function publicPlanningModelName(profile: ModelProfile) {
  return profile.provider === "google"
    ? `google/${profile.id}:generate-content`
    : profile.id;
}

function languageModel(profile: ModelProfile) {
  if (profile.provider === "google") {
    return createGoogle({
      apiKey: serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY,
    })(profile.id);
  }
  return gateway(profile.id);
}

function decisionValidationError(
  decision: RefinementDecision,
  assignment: Assignment,
) {
  if (decision.confirmation === "requested" && decision.operations.length > 0) {
    return "A confirmation request must not contain operations.";
  }
  const destructive = decision.operations.some((operation) =>
    ["delete_task", "merge_tasks"].includes(operation.type),
  );
  if (destructive && decision.confirmation !== "confirmed") {
    return "Destructive operations require confirmation=confirmed.";
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

async function generateWithRetries<T>(options: {
  run: (
    profile: ModelProfile,
    abortSignal: AbortSignal,
    feedback: string,
  ) => Promise<T>;
  validate: (value: T) => string;
}): Promise<{ profile: ModelProfile; value: T }> {
  const deadline = Date.now() + planningRequestTimeoutMs;
  const failures: PlanningFailureAttempt[] = [];
  const profiles = planningModelProfiles();
  const attempts =
    profiles.length > 1
      ? profiles.map((profile, index) => ({
          profile,
          timeoutMs: index === 0 ? 28_000 : 25_000,
        }))
      : planningAttemptTimeoutsMs.map((timeoutMs) => ({
          profile: profiles[0]!,
          timeoutMs,
        }));
  let feedback = "";

  for (const [index, attempt] of attempts.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    const { profile, timeoutMs } = attempt;
    try {
      const value = await withPlanningTimeout(
        (abortSignal) => options.run(profile, abortSignal, feedback),
        Math.min(timeoutMs, remaining - 1_000),
      );
      const issue = options.validate(value);
      if (!issue) return { profile, value };
      feedback = issue.slice(0, 1200);
      throw new PlanValidationError([issue]);
    } catch (error) {
      const reason = classifyPlanningFailure(error);
      failures.push({
        model: publicPlanningModelName(profile),
        provider: profile.provider,
        reason,
      });
      const canRetry =
        index + 1 < attempts.length &&
        // A direct credential, regional endpoint, or model permission can fail
        // while Vercel's OIDC-authenticated gateway remains healthy. Only stop
        // early when there is no different transport left to try.
        (attempts[index + 1]?.profile.provider !== profile.provider ||
          ![
            "authentication",
            "configuration",
            "model-unavailable",
            "quota",
          ].includes(reason));
      console.warn(
        `Planning model attempt failed (${reason}); ${canRetry ? "retrying" : "stopping"}. ${safeProviderError(error)}`,
      );
      if (!canRetry) break;
    }
  }

  throw new PlanningProviderError(failures);
}

export async function generateLiveInitialPlan(
  assignment: AssignmentInput,
): Promise<{ decision: InitialPlanDecision; model: string }> {
  const result = await generateWithRetries({
    run: async (profile, abortSignal, feedback) => {
      const { output } = await generateText({
        abortSignal,
        maxOutputTokens: 6000,
        maxRetries: 0,
        model: languageModel(profile),
        output: Output.object({
          description: "A phased, dependency-aware task plan proposal.",
          name: "pacepal_initial_plan",
          schema: initialPlanDecisionSchema,
        }),
        reasoning: "high",
        system: initialPlanSystemPrompt(),
        prompt: [
          initialPlanUserPrompt(assignment),
          feedback ? `CORRECT_THE_PREVIOUS_OUTPUT: ${feedback}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      return output;
    },
    validate: (value) => {
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
    model: publicPlanningModelName(result.profile),
  };
}

export async function generateLiveRefinement(
  assignment: Assignment,
  message: string,
): Promise<{ decision: RefinementDecision; model: string }> {
  const result = await generateWithRetries({
    run: async (profile, abortSignal, feedback) => {
      const { output } = await generateText({
        abortSignal,
        maxOutputTokens: 6000,
        maxRetries: 0,
        model: languageModel(profile),
        output: Output.object({
          description:
            "A conversational response and the smallest validated plan-operation set needed for the user's request.",
          name: "pacepal_plan_refinement",
          schema: refinementDecisionSchema,
        }),
        reasoning: "high",
        system: refinementSystemPrompt(),
        prompt: refinementUserPrompt(assignment, message, feedback),
      });
      return output;
    },
    validate: (value) => decisionValidationError(value, assignment),
  });

  return {
    decision: result.value,
    model: publicPlanningModelName(result.profile),
  };
}

export type PlanningModelProbe = {
  configured: boolean;
  model: string | null;
  reachable: boolean;
  reason: string | null;
};

export async function probePlanningModel(): Promise<PlanningModelProbe> {
  const profiles = planningModelProfiles();
  if (
    profiles.every((profile) => profile.provider === "gateway") &&
    !serverEnvironment.AI_GATEWAY_API_KEY &&
    !process.env.VERCEL_OIDC_TOKEN
  ) {
    return {
      configured: false,
      model: publicPlanningModelName(profiles[0]!),
      reachable: false,
      reason: "No planning-model credential is configured.",
    };
  }
  let lastReason = "provider-error";
  for (const profile of profiles) {
    try {
      const { text } = await withPlanningTimeout(
        (abortSignal) =>
          generateText({
            abortSignal,
            maxOutputTokens: 8,
            maxRetries: 0,
            model: languageModel(profile),
            prompt: "Reply with only OK.",
          }),
        10_000,
      );
      if (/^OK[.!]?$/i.test(text.trim())) {
        return {
          configured: true,
          model: publicPlanningModelName(profile),
          reachable: true,
          reason: null,
        };
      }
      lastReason = "Unexpected probe response.";
    } catch (error) {
      lastReason = classifyPlanningFailure(error);
    }
  }
  return {
    configured: true,
    model: null,
    reachable: false,
    reason: lastReason,
  };
}
