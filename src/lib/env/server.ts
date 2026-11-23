import { z } from "zod";

const serverEnvironmentSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["mock", "gateway"]).default("mock"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_MODEL: z.string().min(1).default("gemini-3.8-flash"),
});

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY || undefined,
  AI_PROVIDER: process.env.AI_PROVIDER,
  GOOGLE_GENERATIVE_AI_API_KEY:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined,
  GOOGLE_GENERATIVE_AI_MODEL: process.env.GOOGLE_GENERATIVE_AI_MODEL,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid server environment: ${parsedEnvironment.error.message}`,
  );
}

export const serverEnvironment = parsedEnvironment.data;
