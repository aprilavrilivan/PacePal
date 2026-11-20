import { z } from "zod";

const serverEnvironmentSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["mock", "gateway"]).default("mock"),
});

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY || undefined,
  AI_PROVIDER: process.env.AI_PROVIDER,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid server environment: ${parsedEnvironment.error.message}`,
  );
}

export const serverEnvironment = parsedEnvironment.data;
