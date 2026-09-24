import assert from "node:assert/strict";

import {
  setAutomationMode,
  getAutomationMode,
  activateEmergencyStop,
  clearEmergencyStop,
  canStartAutomation,
  reserveDailySlot,
  markVideoCompleted,
  canPublish,
  createApprovalRequest,
  decideApproval,
  getCEOAutomationStatus,
  getCEOAutomationGuardStatus,
  resetDailyCounter
} from "../src/ceoAutomationGuard.js";

console.log("\n🧪 CEO AUTOMATION GUARD V2 TEST\n");

// Clean state first
await clearEmergencyStop();
await setAutomationMode("AUTO");
await resetDailyCounter();

// 1. Export check
for (const fn of [
  setAutomationMode,
  getAutomationMode,
  activateEmergencyStop,
  clearEmergencyStop,
  canStartAutomation,
  reserveDailySlot,
  markVideoCompleted,
  canPublish,
  createApprovalRequest,
  decideApproval,
  getCEOAutomationStatus,
  getCEOAutomationGuardStatus,
  resetDailyCounter
]) {
  assert.equal(typeof fn, "function");
}

console.log("✅ 1. All CEO Guard exports available");

// 2. Initial status
let status = await getCEOAutomationStatus();

assert.equal(status.daily.max, 5);
assert.equal(status.daily.started, 0);
assert.equal(status.daily.completed, 0);

console.log("✅ 2. Daily limit = 5");

// 3. AUTO mode
await setAutomationMode("AUTO");

assert.equal(await getAutomationMode(), "AUTO");

let startCheck = await canStartAutomation({ requestedVideos: 1 });
assert.equal(startCheck.allowed, true);

console.log("✅ 3. AUTO mode allows automation");

// 4. STOP mode
await setAutomationMode("STOP");

startCheck = await canStartAutomation({ requestedVideos: 1 });
assert.equal(startCheck.allowed, false);

console.log("✅ 4. STOP mode blocks automation");

// 5. Emergency stop
await setAutomationMode("AUTO");
await activateEmergencyStop("V2 test emergency stop");

startCheck = await canStartAutomation({ requestedVideos: 1 });
assert.equal(startCheck.allowed, false);

console.log("✅ 5. Emergency Stop blocks automation");

// 6. Clear emergency
await clearEmergencyStop();

startCheck = await canStartAutomation({ requestedVideos: 1 });
assert.equal(startCheck.allowed, true);

console.log("✅ 6. Emergency Stop cleared");

// 7. Reserve 5 daily slots
await resetDailyCounter();

for (let i = 1; i <= 5; i++) {
  const result = await reserveDailySlot();

  assert.equal(result.allowed, true);
}

status = await getCEOAutomationStatus();

assert.equal(status.daily.started, 5);
assert.equal(status.daily.remaining, 0);

console.log("✅ 7. Five daily slots reserved");

// 8. Sixth slot must fail
const sixth = await reserveDailySlot();

assert.equal(sixth.allowed, false);

console.log("✅ 8. Sixth video blocked by daily limit");

// 9. LOW risk publishing
await resetDailyCounter();
await setAutomationMode("AUTO");

let publishCheck = await canPublish({
  risk: "LOW",
  requiresApproval: false
});

assert.equal(publishCheck.allowed, true);

console.log("✅ 9. LOW risk can publish in AUTO");

// 10. MEDIUM risk requires approval
publishCheck = await canPublish({
  risk: "MEDIUM",
  requiresApproval: false
});

assert.equal(publishCheck.allowed, false);
assert.equal(publishCheck.status, "APPROVAL_REQUIRED");

console.log("✅ 10. MEDIUM risk requires CEO approval");

// 11. HIGH risk requires approval
publishCheck = await canPublish({
  risk: "HIGH",
  requiresApproval: false
});

assert.equal(publishCheck.allowed, false);
assert.equal(publishCheck.status, "APPROVAL_REQUIRED");

console.log("✅ 11. HIGH risk requires CEO approval");

// 12. REVIEW mode requires approval
await setAutomationMode("REVIEW");

publishCheck = await canPublish({
  risk: "LOW",
  requiresApproval: false
});

assert.equal(publishCheck.allowed, false);
assert.equal(publishCheck.status, "APPROVAL_REQUIRED");

console.log("✅ 12. REVIEW mode requires approval");

// 13. Create approval request
const approval = await createApprovalRequest({
  runId: "v2-test-run",
  reason: "CEO Guard V2 test",
  risk: "MEDIUM",
  metadata: {
    test: true
  }
});

assert.ok(approval.approvalId);
assert.equal(approval.status, "PENDING");

console.log("✅ 13. Approval request created");

// 14. Approve request
const decision = await decideApproval(
  approval.approvalId,
  "APPROVED",
  "V2 test approval"
);

assert.equal(decision.status, "APPROVED");

console.log("✅ 14. Approval decision works");

// 15. Video completed counter
await resetDailyCounter();
await setAutomationMode("AUTO");

await reserveDailySlot();
await markVideoCompleted();

status = await getCEOAutomationStatus();

assert.equal(status.daily.started, 1);
assert.equal(status.daily.completed, 1);

console.log("✅ 15. Video completion counter works");

// 16. Alias status
const aliasStatus = await getCEOAutomationGuardStatus();

assert.equal(aliasStatus.mode, status.mode);
assert.equal(aliasStatus.daily.max, 5);

console.log("✅ 16. Guard status alias works");

// Final clean state
await clearEmergencyStop();
await setAutomationMode("REVIEW");
await resetDailyCounter();

console.log("\n🎉 CEO AUTOMATION GUARD V2 TEST: GREEN\n");
