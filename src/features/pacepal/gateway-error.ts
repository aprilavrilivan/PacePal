const failurePatterns = [
  [
    "authentication",
    /\b(?:401|403)\b|auth|credential|oidc|token|api[ _-]?key|permission denied|unauthorized|forbidden/i,
  ],
  [
    "quota",
    /\b429\b|too many requests|resource exhausted|credit|quota|billing|payment|insufficient|rate[ _-]?limit/i,
  ],
  ["timeout", /abort|timeout|timed out|deadline exceeded/i],
  ["invalid-output", /output|schema|parse|json|validation|zod/i],
  [
    "unavailable",
    /\b(?:500|502|503|504)\b|unavailable|overload|capacity|provider|service unavailable/i,
  ],
] as const;

export type GatewayFailureReason =
  (typeof failurePatterns)[number][0] | "gateway-error";

function errorText(error: unknown, depth = 0): string {
  if (depth > 3 || error == null) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const record = error as Record<string, unknown>;
  const own = [
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    record.statusCode,
    record.status,
    record.responseBody,
    record.data,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" ");

  return `${own} ${errorText(record.cause, depth + 1)}`.trim();
}

export function classifyGatewayFailure(error: unknown): GatewayFailureReason {
  const text = errorText(error);

  return (
    failurePatterns.find(([, pattern]) => pattern.test(text))?.[0] ??
    "gateway-error"
  );
}

export function gatewayFailureLog(error: unknown) {
  const text = errorText(error)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted-google-api-key]")
    .replace(
      /((?:api[_ -]?key|authorization|bearer|token|key)["'=:\s]+)[^\s,;}\"]+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 800) || "Unknown AI provider failure";
}
