const failurePatterns = [
  [
    "quota",
    /\b429\b|too many requests|resource exhausted|credit|quota|billing|rate[ _-]?limit/i,
  ],
  ["timeout", /abort|timeout|timed out|deadline exceeded/i],
  [
    "invalid-output",
    /output|schema|parse|json|validation|zod|dependency|operation/i,
  ],
  [
    "authentication",
    /\b401\b|api[_ -]?key.+invalid|unauthenticated|invalid authentication|oidc token/i,
  ],
  [
    "configuration",
    /service[_ -]?disabled|api is not enabled|access not configured|project has been denied access|location.+not supported/i,
  ],
  [
    "model-unavailable",
    /\b403\b|permission denied|forbidden|\b404\b|model.+(?:not found|not supported|not available)/i,
  ],
  [
    "unavailable",
    /\b(?:500|502|503|504)\b|unavailable|overload|capacity|service unavailable/i,
  ],
] as const;

export type PlanningFailureReason =
  (typeof failurePatterns)[number][0] | "provider-error";

export function planningFailureMessage(reason: PlanningFailureReason) {
  return reason === "invalid-output"
    ? "本次 AI 生成结果未通过校验，请重试。"
    : "当前 AI 模型不可用，请稍后重试。";
}

function errorText(error: unknown, depth = 0): string {
  if (depth > 3 || error == null) return "";
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);
  const value = error as Record<string, unknown>;
  const own = [
    error instanceof Error ? error.name : "",
    error instanceof Error ? error.message : "",
    value.statusCode,
    value.status,
    value.responseBody,
    value.data,
  ]
    .filter((item) => item !== undefined && item !== null)
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .join(" ");
  return `${own} ${errorText(value.cause, depth + 1)}`.trim();
}

export function classifyPlanningFailure(error: unknown): PlanningFailureReason {
  const text = errorText(error);
  return (
    failurePatterns.find(([, pattern]) => pattern.test(text))?.[0] ??
    "provider-error"
  );
}

export class PlanningProviderError extends Error {
  constructor(readonly reason: PlanningFailureReason) {
    super("The planning model is unavailable.");
    this.name = "PlanningProviderError";
  }
}

export function safeProviderError(error: unknown) {
  return errorText(error)
    .replace(
      /((?:api[_ -]?key|authorization|bearer|token|key)["'=:\s]+)[^\s,;}\"]+/gi,
      "$1[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}
