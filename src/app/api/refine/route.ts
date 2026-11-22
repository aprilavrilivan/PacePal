import { ZodError } from "zod";

import { classifyGatewayFailure } from "@/features/pacepal/gateway-error";
import { gatewayModel } from "@/features/pacepal/gateway-planner";
import { generateGatewayRefinement } from "@/features/pacepal/gateway-refiner";
import { generateMockRefinement } from "@/features/pacepal/mock-refiner";
import {
  refinementRequestSchema,
  type RefinementOutput,
} from "@/features/pacepal/refinement";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fallbackPlan(output: RefinementOutput, fallbackReason: string) {
  return {
    ...output,
    assistantMessage: output.changed
      ? output.assistantMessage
      : "AI 暂时不可用，我没有擅自修改你的计划。请稍后重试。",
    fallback: true,
    fallbackReason,
    model: gatewayModel,
  };
}

export async function POST(request: Request) {
  try {
    const { assignment, message } = refinementRequestSchema.parse(
      await request.json(),
    );
    const mockOutput = generateMockRefinement(assignment, message);

    if (serverEnvironment.AI_PROVIDER === "mock") {
      return Response.json({
        ...mockOutput,
        fallback: false,
        fallbackReason: null,
        model: null,
      });
    }

    let gatewayError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return Response.json({
          ...(await generateGatewayRefinement(assignment, message)),
          fallback: false,
          fallbackReason: null,
          model: gatewayModel,
        });
      } catch (error) {
        gatewayError = error;
      }
    }

    try {
      throw gatewayError;
    } catch (error) {
      console.error("AI Gateway refinement failed", error);
      return Response.json(
        fallbackPlan(mockOutput, classifyGatewayFailure(error)),
      );
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid refinement." }, { status: 400 });
    }
    throw error;
  }
}
