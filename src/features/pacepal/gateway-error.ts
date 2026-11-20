const failurePatterns = [
  ["authentication", /auth|credential|oidc|token|api[ _-]?key/i],
  ["quota", /credit|quota|billing|payment|insufficient|rate[ _-]?limit/i],
  ["timeout", /abort|timeout|timed out/i],
  ["invalid-output", /output|schema|parse|json|validation/i],
  ["unavailable", /unavailable|overload|capacity|provider/i],
] as const;

export type GatewayFailureReason =
  (typeof failurePatterns)[number][0] | "gateway-error";

export function classifyGatewayFailure(error: unknown): GatewayFailureReason {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";

  return (
    failurePatterns.find(([, pattern]) => pattern.test(text))?.[0] ??
    "gateway-error"
  );
}
import { NoObjectGeneratedError } from "ai";
import { ZodError } from "zod";

export function describeGatewayFailure(error: unknown) {
  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      cause:
        error.cause instanceof Error
          ? {
              message: error.cause.message.slice(0, 500),
              name: error.cause.name,
            }
          : null,
      finishReason: error.finishReason,
      generatedTextLength: error.text?.length ?? 0,
      type: "no-object-generated",
    };
  }

  if (error instanceof ZodError) {
    return {
      issues: error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
      })),
      type: "validation",
    };
  }

  return {
    name: error instanceof Error ? error.name : typeof error,
    type: "gateway-error",
  };
}
