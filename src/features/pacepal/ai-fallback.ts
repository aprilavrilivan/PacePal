import type { GatewayFailureReason } from "@/features/pacepal/gateway-error";
import type { RefinementOutput } from "@/features/pacepal/refinement";

const failureIntroductions: Record<GatewayFailureReason, string> = {
  authentication: "Gemini 密钥未被 Google 接受。",
  configuration: "Google 项目的 Gemini API 尚未启用或无权访问。",
  quota: "AI 规划服务当前达到调用频率或额度限制。",
  timeout: "AI 规划服务本次响应超时。",
  "invalid-output": "AI 返回的计划格式未通过完整校验。",
  "model-unavailable": "配置的 Gemini 模型当前不可用。",
  unavailable: "Gemini 当前未能及时响应。",
  "gateway-error": "AI 规划服务本次调用没有成功完成。",
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
