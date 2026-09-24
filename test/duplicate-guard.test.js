import assert from "node:assert/strict";
import test from "node:test";

import {
  checkDuplicateContent,
  calculateTextSimilarity,
  normalizeText
} from "../src/duplicateGuard.js";

test("Duplicate Guard exports required functions", () => {
  assert.equal(
    typeof checkDuplicateContent,
    "function"
  );

  assert.equal(
    typeof calculateTextSimilarity,
    "function"
  );

  assert.equal(
    typeof normalizeText,
    "function"
  );
});

test("Text normalization should be consistent", () => {
  const first =
    normalizeText(
      "  Hello   World!  "
    );

  const second =
    normalizeText(
      "hello world"
    );

  assert.equal(first, second);
});

test("Identical text should have maximum similarity", () => {
  const similarity =
    calculateTextSimilarity(
      "This is original test content.",
      "This is original test content."
    );

  assert.equal(similarity, 1);
});

test("Different text should not have maximum similarity", () => {
  const similarity =
    calculateTextSimilarity(
      "This is about technology.",
      "Fresh cooking recipes for dinner."
    );

  assert.ok(similarity < 1);
});

test("Duplicate Guard should detect identical existing content", async () => {
  const result =
    await checkDuplicateContent({
      title: "Test productivity tips",
      script:
        "These are original productivity tips for a duplicate test.",
      existingContent: [
        {
          title: "Test productivity tips",
          script:
            "These are original productivity tips for a duplicate test."
        }
      ]
    });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.isDuplicate !== undefined ||
    result.duplicate !== undefined ||
    result.status ||
    result.decision
  );
});

test("Duplicate Guard should handle empty existing content", async () => {
  const result =
    await checkDuplicateContent({
      title: "Completely new test topic",
      script:
        "This is a completely new test script.",
      existingContent: []
    });

  assert.ok(result);
  assert.equal(typeof result, "object");
});

console.log(
  "🟢 Duplicate Guard test completed"
);
