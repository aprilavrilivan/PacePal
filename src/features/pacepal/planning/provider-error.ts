const failurePatterns = [
  [
    "quota",
    /\b429\b|too many requests|resource exhausted|credit|quota|billing|rate[ _-]?limit/i,
  ],
  ["timeout", /abort|timeout|timed out|deadline exceeded/i],
  [
    "network",
    /connection reset|econnreset|network|fetch failed|http2|framing layer|socket hang up/i,
  ],
  [
    "invalid-output",
    /output|schema|parse|json|validation|zod|dependency|operation|empty response|no object generated/i,
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
  | (typeof failurePatterns)[number][0]
  | "invalid-dependencies"
  | "provider-error";

export function planningFailureMessage(reason: PlanningFailureReason) {
  if (reason === "quota") return "AI 请求过于频繁，请稍后重试。";
  if (reason === "timeout") return "AI 响应超时，请重试。";
  if (reason === "network") return "连接中断，请检查网络后重试。";
  if (reason === "invalid-output") {
    return "AI 返回的任务数据格式有误，未保存任何更改。";
  }
  if (reason === "invalid-dependencies") {
    return "AI 提议的任务依赖无效，未保存任何更改。";
  }
  return "AI 服务暂时不可用，请稍后重试。";
}

export function planningFailureCode(reason: PlanningFailureReason) {
  if (reason === "quota") return "rate_limited";
  if (reason === "timeout") return "timeout";
  if (reason === "network") return "network_error";
  if (reason === "invalid-output") return "invalid_output";
  if (reason === "invalid-dependencies") return "invalid_dependencies";
  return "provider_unavailable";
}

export function planningFailureStatus(reason: PlanningFailureReason) {
  if (reason === "quota") return 429;
  if (reason === "timeout") return 504;
  if (["invalid-output", "invalid-dependencies"].includes(reason)) return 422;
  return 503;
}

export function planningFailureRetryable(reason: PlanningFailureReason) {
  return !["authentication", "configuration", "model-unavailable"].includes(
    reason,
  );
}

export function planningFailure(reason: PlanningFailureReason) {
  return {
    body: {
      code: planningFailureCode(reason),
      error: planningFailureMessage(reason),
      reason,
      retryable: planningFailureRetryable(reason),
    },
    status: planningFailureStatus(reason),
  };
}

export function classifyPlanValidation(
  issues: string[],
): PlanningFailureReason {
  return issues.some((issue) =>
    /dependency|circular|cycle|self-reference/i.test(issue),
  )
    ? "invalid-dependencies"
    : "invalid-output";
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

export class PlanningRequestError extends Error {
  constructor(readonly reason: PlanningFailureReason) {
    super(`Planning request failed: ${reason}.`);
    this.name = "PlanningRequestError";
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
