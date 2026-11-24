import { ZodError } from "zod";

import { refinementFallback } from "@/features/pacepal/ai-fallback";
import { classifyGatewayFailure } from "@/features/pacepal/gateway-error";
import { normalizeGatewayRefinement } from "@/features/pacepal/gateway-refinement-normalizer";
import { generateGatewayRefinement } from "@/features/pacepal/gateway-refiner";
import { generateMockRefinement } from "@/features/pacepal/mock-refiner";
import { refinementRequestSchema } from "@/features/pacepal/refinement";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { assignment, message } = refinementRequestSchema.parse(
      await request.json(),
    );
    const mockOutput = normalizeGatewayRefinement(
      generateMockRefinement(assignment, message),
      assignment,
      message,
    );

    if (serverEnvironment.AI_PROVIDER === "mock") {
      return Response.json({
        ...mockOutput,
        fallback: false,
        fallbackReason: null,
        model: null,
      });
    }

    try {
      const refinement = await generateGatewayRefinement(assignment, message);
      return Response.json({
        ...refinement.output,
        fallback: false,
        fallbackReason: null,
        model: refinement.model,
      });
    } catch (error) {
      console.error("AI Gateway refinement failed", error);
      return Response.json(
        refinementFallback(mockOutput, classifyGatewayFailure(error)),
      );
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid refinement." }, { status: 400 });
    }
    throw error;
  }
}
