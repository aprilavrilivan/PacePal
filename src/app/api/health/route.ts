import { appConfig } from "@/lib/app-config";
import { serverEnvironment } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    aiProvider: serverEnvironment.AI_PROVIDER,
    app: appConfig.name,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    directGeminiConfigured: Boolean(
      serverEnvironment.GOOGLE_GENERATIVE_AI_API_KEY,
    ),
    status: "ok",
  });
}
