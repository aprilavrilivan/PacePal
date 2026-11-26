export function assistantMessageValidationError(message: string) {
  const text = message.trim();
  if (
    /[:：]$/.test(text) ||
    /(?:如下|如下所示)\s*[。.!！]?$/.test(text) ||
    /(?:as follows|here(?:'s| is))\s*[.!]?$/.test(text)
  ) {
    return "The assistant message introduces content that it does not include.";
  }
  return "";
}
