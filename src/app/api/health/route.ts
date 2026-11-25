import { appConfig } from "@/lib/app-config";
import { probePlanningModel } from "@/features/pacepal/planning/live-model";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const health = {
    aiProvider: serverEnvironment.AI_PROVIDER,
    app: appConfig.name,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    directGeminiConfigured: Boolean(
      serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY,
    ),
    status: "ok",
  };

  if (new URL(request.url).searchParams.get("probe") !== "ai") {
    return Response.json(health);
  }

  const planningModelProbe = await probePlanningModel();
  const degraded =
    planningModelProbe.configured && !planningModelProbe.reachable;

  return Response.json(
    {
      ...health,
      status: degraded ? "degraded" : "ok",
      planningModelProbe,
    },
    {
      status: degraded ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
