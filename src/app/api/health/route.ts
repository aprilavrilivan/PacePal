import { appConfig } from "@/lib/app-config";
import {
  planningModel,
  probePlanningModel,
} from "@/features/pacepal/planning/live-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const health = {
    app: appConfig.name,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    planningModel,
    provider: "vercel-ai-gateway",
    status: "ok",
  };

  if (new URL(request.url).searchParams.get("probe") !== "ai") {
    return Response.json(health);
  }

  const planningModelProbe = await probePlanningModel();
  const degraded = !planningModelProbe.reachable;

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
