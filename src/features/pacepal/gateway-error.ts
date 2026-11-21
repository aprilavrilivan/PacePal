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
