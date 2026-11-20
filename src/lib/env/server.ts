import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    AI_PROVIDER: z.enum(["mock", "openrouter"]).default("mock"),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.AI_PROVIDER === "openrouter" &&
      !environment.OPENROUTER_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        message: "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter.",
        path: ["OPENROUTER_API_KEY"],
      });
    }
  });

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || undefined,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid server environment: ${parsedEnvironment.error.message}`,
  );
}

export const serverEnvironment = parsedEnvironment.data;
