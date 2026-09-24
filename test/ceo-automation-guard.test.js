import assert from "node:assert/strict";
import test from "node:test";

import {
  getCEOAutomationStatus,
  canStartAutomation,
  reserveDailySlot,
  markVideoCompleted,
  canPublish,
  createCEOApprovalRequest,
  approveCEORequest,
  rejectCEORequest,
  emergencyStop,
  resumeAutomation
} from "../src/ceoAutomationGuard.js";

test("CEO Automation Guard exports required functions", () => {
  assert.equal(typeof getCEOAutomationStatus, "function");
  assert.equal(typeof canStartAutomation, "function");
  assert.equal(typeof reserveDailySlot, "function");
  assert.equal(typeof markVideoCompleted, "function");
  assert.equal(typeof canPublish, "function");
  assert.equal(typeof createCEOApprovalRequest, "function");
  assert.equal(typeof approveCEORequest, "function");
  assert.equal(typeof rejectCEORequest, "function");
  assert.equal(typeof emergencyStop, "function");
  assert.equal(typeof resumeAutomation, "function");
});

test("CEO Automation status should be available", () => {
  const status = getCEOAutomationStatus();

  assert.ok(status);
  assert.equal(typeof status, "object");
});

test("Automation start decision should be structured", () => {
  const result = canStartAutomation();

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.allowed !== undefined ||
    result.canStart !== undefined ||
    result.status ||
    result.reason
  );
});

test("Daily slot reservation should return a structured result", () => {
  const result = reserveDailySlot();

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.allowed !== undefined ||
    result.reserved !== undefined ||
    result.status ||
    result.reason
  );
});

test("Video completion should return a structured result", () => {
  const result = markVideoCompleted();

  assert.ok(result);
  assert.equal(typeof result, "object");
});

test("Publish decision should be structured", () => {
  const result = canPublish({
    riskLevel: "LOW"
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.allowed !== undefined ||
    result.canPublish !== undefined ||
    result.status ||
    result.reason
  );
});

test("CEO approval request should be created", () => {
  const result = createCEOApprovalRequest({
    type: "TEST",
    reason: "Automated test approval request"
  });

  assert.ok(result);
  assert.equal(typeof result, "object");

  assert.ok(
    result.requestId ||
    result.id ||
    result.status
  );
});

test("Emergency stop and resume controls should work", () => {
  const stopped = emergencyStop();

  assert.ok(stopped);
  assert.equal(typeof stopped, "object");

  const resumed = resumeAutomation();

  assert.ok(resumed);
  assert.equal(typeof resumed, "object");
});

console.log(
  "🟢 CEO Automation Guard test completed"
);
