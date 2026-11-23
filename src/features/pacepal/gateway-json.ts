export function extractGatewayJson(text: string) {
  const input = text.trim();
  try {
    JSON.parse(input);
    return input;
  } catch {
    // Models sometimes wrap an otherwise valid object in prose or a code fence.
  }

  const fenced = [...input.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fenced.reverse()) {
    const candidate = match[1]?.trim() ?? "";
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(input.slice(start, index + 1));
        start = -1;
      }
    }
  }

  for (const candidate of candidates.reverse()) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Keep searching for a complete object.
    }
  }
  return text;
}
