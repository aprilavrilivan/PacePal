const failurePatterns = [
  [
    "quota",
    /\b429\b|too many requests|resource exhausted|credit|quota|billing|payment|insufficient|rate[ _-]?limit/i,
  ],
  ["timeout", /abort|timeout|timed out|deadline exceeded/i],
  ["invalid-output", /output|schema|parse|json|validation|zod/i],
  [
    "authentication",
    /\b401\b|api[_ -]?key[_ -]?invalid|api key not valid|invalid api key|unauthenticated|invalid authentication credentials|oidc token/i,
  ],
  [
    "configuration",
    /service[_ -]?disabled|api has not been used|api is not enabled|access not configured|referer.+blocked|api[_ -]?key[_ -]?service[_ -]?blocked|project has been denied access|location.+not supported/i,
  ],
  [
    "model-unavailable",
    /\b403\b|permission denied|forbidden|\b404\b|model.+(?:not found|not supported|not available)|not found.+model|no longer available/i,
  ],
  [
    "unavailable",
    /\b(?:500|502|503|504)\b|unavailable|overload|capacity|provider|service unavailable/i,
  ],
] as const;

export type GatewayFailureReason =
  (typeof failurePatterns)[number][0] | "gateway-error";

export type PlanningFailureAttempt = {
  model: string;
  provider: "google" | "gateway";
  reason: GatewayFailureReason;
};

const failureReasons = new Set<GatewayFailureReason>([
  ...failurePatterns.map(([reason]) => reason),
  "gateway-error",
]);

export class PlanningModelsFailedError extends Error {
  readonly attempts: PlanningFailureAttempt[];
  readonly failureReason: GatewayFailureReason;

  constructor(
    failureReason: GatewayFailureReason,
    attempts: PlanningFailureAttempt[],
  ) {
    super(`All AI planning models failed (${failureReason}).`);
    this.name = "PlanningModelsFailedError";
    this.failureReason = failureReason;
    this.attempts = attempts;
  }
}

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
  if (error && typeof error === "object") {
    const failureReason = (error as { failureReason?: unknown }).failureReason;
    if (
      typeof failureReason === "string" &&
      failureReasons.has(failureReason as GatewayFailureReason)
    ) {
      return failureReason as GatewayFailureReason;
    }
  }

  const text = errorText(error);

  return (
    failurePatterns.find(([, pattern]) => pattern.test(text))?.[0] ??
    "gateway-error"
  );
}

export function shouldStopDirectGoogleFallbacks(
  error: unknown,
  failureReason = classifyGatewayFailure(error),
) {
  if (failureReason === "authentication") return true;
  if (failureReason !== "configuration") return false;

  const text = errorText(error);

  // Configuration is only assigned to explicit project-wide failures. A
  // model-level 403 is classified as model-unavailable and continues through
  // the direct Gemini candidates.
  return /service[_ -]?disabled|api has not been used|api is not enabled|access not configured|referer.+blocked|api[_ -]?key[_ -]?service[_ -]?blocked|project has been denied access|location.+not supported/i.test(
    text,
  );
}

function preferredFailureReason(attempts: PlanningFailureAttempt[]) {
  const directGoogleAttempts = attempts.filter(
    (attempt) => attempt.provider === "google",
  );
  const relevantAttempts = directGoogleAttempts.length
    ? directGoogleAttempts
    : attempts;
  const reasons = new Set(relevantAttempts.map((attempt) => attempt.reason));

  // Authentication and project configuration errors are deterministic. For
  // all other failures, prefer the most actionable provider condition instead
  // of whichever fallback happened to run last.
  for (const reason of [
    "authentication",
    "configuration",
    "quota",
    "unavailable",
    "timeout",
    "model-unavailable",
    "invalid-output",
    "gateway-error",
  ] as const) {
    if (reasons.has(reason)) return reason;
  }

  return "gateway-error";
}

export function planningModelsFailed(attempts: PlanningFailureAttempt[]) {
  return new PlanningModelsFailedError(
    preferredFailureReason(attempts),
    attempts,
  );
}

export function planningFailureAttempts(
  error: unknown,
): PlanningFailureAttempt[] {
  return error instanceof PlanningModelsFailedError ? error.attempts : [];
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
