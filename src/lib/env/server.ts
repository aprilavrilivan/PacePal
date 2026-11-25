import { z } from "zod";

function normalizeEnvironmentValue(value: string | undefined) {
  if (!value) return undefined;
  let normalized = value.trim();
  const assignmentIndex = normalized.indexOf("=");
  if (assignmentIndex > 0) {
    const possibleName = normalized.slice(0, assignmentIndex).trim();
    if (/^[A-Z][A-Z0-9_]+$/.test(possibleName)) {
      normalized = normalized.slice(assignmentIndex + 1).trim();
    }
  }
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized || undefined;
}

const serverEnvironmentSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
});

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  AI_GATEWAY_API_KEY: normalizeEnvironmentValue(process.env.AI_GATEWAY_API_KEY),
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid server environment: ${parsedEnvironment.error.message}`,
  );
}

export const serverEnvironment = parsedEnvironment.data;
