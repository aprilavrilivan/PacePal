import "server-only";

import { createGoogle, type GoogleInteractionsModelId } from "@ai-sdk/google";
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
  reasoning: "high" | "medium" | "low";
  timeoutMs: number;
  transport?: "generate-content" | "interactions";
};

export function planningModelProfiles(): ModelProfile[] {
  const configuredModel = serverEnvironment.GOOGLE_GENERATIVE_AI_MODEL;
  const profiles: ModelProfile[] = [];
  if (serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY) {
    const directCandidates = [
      {
        id: configuredModel,
        transport: configuredModel.startsWith("gemini-3.")
          ? ("interactions" as const)
          : ("generate-content" as const),
      },
      { id: "gemini-2.5-flash", transport: "generate-content" as const },
      {
        id: "gemini-2.5-flash-lite",
        transport: "generate-content" as const,
      },
    ].filter(
      (candidate, index, candidates) =>
        candidates.findIndex(
          (value) =>
            value.id === candidate.id &&
            value.transport === candidate.transport,
        ) === index,
    );
    profiles.push(
      ...directCandidates.map((candidate, index): ModelProfile => ({
        ...candidate,
        provider: "google",
        reasoning: index === 0 ? "high" : index === 1 ? "medium" : "low",
        timeoutMs: index === 0 ? 18_000 : index === 1 ? 15_000 : 9_000,
      })),
    );
  }
  profiles.push(
    {
      id: `google/${configuredModel}`,
      provider: "gateway",
      reasoning: "medium",
      timeoutMs: 9_000,
    },
    {
      id: "nvidia/nemotron-3.5-lightning-free",
      provider: "gateway",
      reasoning: "low",
      timeoutMs: 24_000,
    },
    {
      id: "recursive/flint-v1.0",
      provider: "gateway",
      reasoning: "low",
      timeoutMs: 14_000,
    },
    {
      id: "reflection/beam-free",
      provider: "gateway",
      reasoning: "low",
      timeoutMs: 10_000,
    },
  );
  return profiles.filter(
    (profile, index, all) =>
      all.findIndex(
        (value) =>
          value.id === profile.id &&
          value.provider === profile.provider &&
          value.transport === profile.transport,
      ) === index,
  );
}

export function publicPlanningModelName(profile: ModelProfile) {
  if (profile.provider === "google") {
    return `google/${profile.id}:${profile.transport}`;
  }
  return profile.id;
}

function languageModel(profile: ModelProfile) {
  if (profile.provider === "google") {
    const google = createGoogle({
      apiKey: serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    return profile.transport === "interactions"
      ? google.interactions(profile.id as GoogleInteractionsModelId)
      : google(profile.id);
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
      ? profiles.map((profile) => ({
          profile,
          timeoutMs: profile.timeoutMs,
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
      const canRetry = index + 1 < attempts.length;
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
        reasoning: profile.reasoning,
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
        reasoning: profile.reasoning,
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
