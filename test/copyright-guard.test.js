import assert from "node:assert/strict";
import test from "node:test";

import {
  checkCopyrightSafety,
  createCopyrightReviewRequest,
  getContentFingerprint
} from "../src/copyrightGuard.js";

test("Copyright Guard exports required functions", () => {
  assert.equal(
    typeof checkCopyrightSafety,
    "function"
  );

  assert.equal(
    typeof createCopyrightReviewRequest,
    "function"
  );

  assert.equal(
    typeof getContentFingerprint,
    "function"
  );
});

test("Original test content should return a structured safety result", async () => {
  const result = await checkCopyrightSafety({
    title: "Original productivity tips",
    script:
      "These are original productivity ideas written specifically for this test."
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.status ||
    result.decision ||
    result.riskLevel ||
    result.safe !== undefined
  );
});

test("Copyright fingerprint should be deterministic", () => {
  const first =
    getContentFingerprint(
      "Original test content"
    );

  const second =
    getContentFingerprint(
      "Original test content"
    );

  assert.equal(first, second);
  assert.ok(first);
});

test("Different content should produce different fingerprints", () => {
  const first =
    getContentFingerprint(
      "Original test content one"
    );

  const second =
    getContentFingerprint(
      "Original test content two"
    );

  assert.notEqual(first, second);
});

test("Copyright review request should return structured data", async () => {
  const result =
    await createCopyrightReviewRequest({
      title: "Test copyright review",
      script:
        "This is original test material that requires a copyright review."
    });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.status ||
    result.reason ||
    result.requestId ||
    result.reviewRequired !== undefined
  );
});

console.log(
  "🟢 Copyright Guard test completed"
);
