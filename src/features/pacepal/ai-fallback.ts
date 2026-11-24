import type { GatewayFailureReason } from "@/features/pacepal/gateway-error";
import type { RefinementOutput } from "@/features/pacepal/refinement";

const failureIntroductions: Record<GatewayFailureReason, string> = {
  authentication: "Gemini 的 API 配置暂时未通过验证。",
  quota: "Gemini 当前达到调用频率或额度限制。",
  timeout: "Gemini 本次规划响应超时。",
  "invalid-output": "Gemini 返回的计划格式未通过完整校验。",
  unavailable: "Gemini 服务当前暂时不可用。",
  "gateway-error": "Gemini 本次规划调用没有成功完成。",
};

export function refinementFallback(
  output: RefinementOutput,
  fallbackReason: GatewayFailureReason,
) {
  const introduction = failureIntroductions[fallbackReason];
  const assistantMessage = output.changed
    ? [
        introduction,
        "我已用本地安全规则应用了能够从你原话中确定的调整；无法可靠推断的部分保持不变。",
        output.assistantMessage,
      ].join("\n\n")
    : `${introduction}\n\n为避免误改，我没有更改你的计划。请稍后重试。`;

  return {
    ...output,
    assistantMessage,
    fallback: true,
    fallbackReason,
    model: null,
  };
}
