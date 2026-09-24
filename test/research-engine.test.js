import assert from "node:assert/strict";
import test from "node:test";

import {
  researchTopic,
  getResearchStatus
} from "../src/researchEngine.js";

test("Research Engine should return a safe research result", async () => {
  const result = await researchTopic({
    title: "Test technology topic",
    topic: "Artificial intelligence"
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    [
      "READY_FOR_RESEARCH_PROVIDER",
      "RESEARCH_READY",
      "INSUFFICIENT_RESEARCH",
      "REVIEW_REQUIRED"
    ].includes(result.status),
    `Unexpected research status: ${result.status}`
  );

  assert.ok(
    result.researchStatus ||
      result.status ||
      result.message,
    "Research result should contain a status or message"
  );
});

test("Research Engine status should be available", () => {
  const status = getResearchStatus();

  assert.ok(status);
  assert.equal(typeof status, "object");
});

console.log("🟢 Research Engine test completed");
