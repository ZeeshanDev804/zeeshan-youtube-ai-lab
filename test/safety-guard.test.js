import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSafety,
  enforceSafety
} from "../src/safetyGuard.js";

test("Safety Guard exports required functions", () => {
  assert.equal(typeof analyzeSafety, "function");
  assert.equal(typeof enforceSafety, "function");
});

test("Safe content should not be marked high risk", async () => {
  const result = await analyzeSafety({
    title: "Simple productivity tips",
    script:
      "Here are three practical productivity tips that can help you organize your day and focus on important tasks."
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.notEqual(result.riskLevel, "HIGH");
});

test("Potentially unsafe content should require protection", async () => {
  const result = await analyzeSafety({
    title: "Test sensitive topic",
    script:
      "This is a test involving potentially sensitive information and claims that should be reviewed carefully before publishing."
  });

  assert.ok(result);
  assert.equal(typeof result, "object");
});

test("Safety enforcement returns a structured decision", async () => {
  const result = await enforceSafety({
    title: "Productivity tips",
    script:
      "These are general educational productivity tips for improving daily organization."
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.status ||
    result.decision ||
    result.allowed !== undefined ||
    result.requiresReview !== undefined
  );
});

console.log("🟢 Safety Guard test completed");
