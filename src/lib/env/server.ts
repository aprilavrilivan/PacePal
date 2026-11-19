import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
    OPENAI_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((environment, context) => {
    if (environment.AI_PROVIDER === "openai" && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai.",
        path: ["OPENAI_API_KEY"],
      });
    }
  });

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || undefined,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid server environment: ${parsedEnvironment.error.message}`,
  );
}

export const serverEnvironment = parsedEnvironment.data;
