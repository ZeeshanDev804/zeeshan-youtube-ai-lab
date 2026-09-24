import assert from "node:assert/strict";

import {
  evaluateProductionProtection,
  getProductionProtectionStatus,
  getFinalProductionProtectionHealth
} from "../src/finalProductionProtection.js";

console.log("=== FINAL PRODUCTION PROTECTION TEST ===");

// 1. Protection status
const status = await getProductionProtectionStatus();

assert.equal(
  status.protection,
  "FINAL_PRODUCTION_PROTECTION"
);

assert.equal(
  status.dailyLimit,
  5
);

assert.equal(
  typeof status.emergencyStop,
  "boolean"
);

assert.equal(
  typeof status.safe,
  "boolean"
);

console.log("1. Protection status: PASS");

// 2. Missing final video must be blocked
const blockedWithoutVideo =
  await evaluateProductionProtection({
    risk: "low",
    qa: {
      status: "PASS"
    },
    finalVideoPath: "",
    approved: true,
    dryRun: false
  });

assert.equal(
  blockedWithoutVideo.allowed,
  false
);

assert.ok(
  blockedWithoutVideo.reasons.some((reason) =>
    reason.toLowerCase().includes("video")
  )
);

console.log("2. Missing final video protection: PASS");

// 3. Missing / failed QA must be blocked
const blockedWithoutQA =
  await evaluateProductionProtection({
    risk: "low",
    finalVideoPath: "output/test-final.mp4",
    approved: true,
    dryRun: false
  });

assert.equal(
  blockedWithoutQA.allowed,
  false
);

assert.ok(
  blockedWithoutQA.reasons.some((reason) =>
    reason.toLowerCase().includes("qa")
  )
);

console.log("3. Failed/missing QA protection: PASS");

// 4. Medium risk requires CEO approval
const mediumRisk =
  await evaluateProductionProtection({
    risk: "medium",
    finalVideoPath: "output/test-final.mp4",
    qa: {
      status: "PASS"
    },
    approved: false,
    dryRun: false
  });

assert.equal(
  mediumRisk.allowed,
  false
);

assert.ok(
  mediumRisk.reasons.some((reason) =>
    reason.toLowerCase().includes("approval")
  )
);

console.log("4. Medium-risk approval gate: PASS");

// 5. High risk requires CEO approval
const highRisk =
  await evaluateProductionProtection({
    risk: "high",
    finalVideoPath: "output/test-final.mp4",
    qa: {
      status: "PASS"
    },
    approved: false,
    dryRun: false
  });

assert.equal(
  highRisk.allowed,
  false
);

assert.ok(
  highRisk.reasons.some((reason) =>
    reason.toLowerCase().includes("approval")
  )
);

console.log("5. High-risk approval gate: PASS");

// 6. Dry-run must never publish
const dryRun =
  await evaluateProductionProtection({
    risk: "low",
    finalVideoPath: "output/test-final.mp4",
    qa: {
      status: "PASS"
    },
    approved: true,
    dryRun: true
  });

assert.equal(
  dryRun.allowed,
  false
);

assert.ok(
  dryRun.warnings.some((warning) =>
    warning.toLowerCase().includes("dry-run")
  )
);

console.log("6. Dry-run publish protection: PASS");

// 7. Health check
const health =
  await getFinalProductionProtectionHealth();

assert.ok(
  ["HEALTHY", "BLOCKED"].includes(
    health.status
  )
);

assert.equal(
  typeof health.healthy,
  "boolean"
);

console.log(
  "7. Production health check: PASS"
);

console.log(
  "=== FINAL PRODUCTION PROTECTION TEST: GREEN ==="
);
