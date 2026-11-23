import { describe, expect, it } from "vitest";

import { extractGatewayJson } from "@/features/pacepal/gateway-json";

describe("gateway JSON extraction", () => {
  it("keeps a plain JSON object intact", () => {
    expect(extractGatewayJson('{"tasks":[]}')).toBe('{"tasks":[]}');
  });

  it("extracts a fenced object after conversational text", () => {
    expect(
      extractGatewayJson('Here is the plan:\n```json\n{"tasks":[]}\n```'),
    ).toBe('{"tasks":[]}');
  });

  it("ignores braces in prose and JSON strings", () => {
    expect(
      extractGatewayJson(
        'Use {this shape} as context. Final: {"message":"keep {details}","operations":[]}',
      ),
    ).toBe('{"message":"keep {details}","operations":[]}');
  });
});
