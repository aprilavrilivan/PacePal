import { ZodError } from "zod";

import {
  gatewayModel,
  generateGatewayPlan,
} from "@/features/pacepal/gateway-planner";
import { classifyGatewayFailure } from "@/features/pacepal/gateway-error";
import { assignmentInputSchema } from "@/features/pacepal/model";
import { generateMockPlan } from "@/features/pacepal/mock-planner";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = assignmentInputSchema.parse(await request.json());

    if (serverEnvironment.AI_PROVIDER === "mock") {
      return Response.json({
        fallback: false,
        model: null,
        subtasks: generateMockPlan(input),
      });
    }

    try {
      return Response.json({
        fallback: false,
        model: gatewayModel,
        subtasks: await generateGatewayPlan(input),
      });
    } catch (error) {
      console.error("AI Gateway plan generation failed", error);
      return Response.json({
        fallback: true,
        fallbackReason: classifyGatewayFailure(error),
        model: gatewayModel,
        subtasks: generateMockPlan(input),
      });
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid assignment." }, { status: 400 });
    }
    throw error;
  }
}
