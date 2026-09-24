import assert from "node:assert/strict";

import {
  getProductionProtectionStatus,
  evaluateProductionProtection,
  enforceProductionProtection,
  recordProductionDecision,
  getProductionAuditLog,
  getFinalProductionProtectionHealth
} from "../src/finalProductionProtection.js";

import {
  getCEOAutomationStatus,
  clearEmergencyStop,
  setAutomationMode,
  resetDailyCounter
} from "../src/ceoAutomationGuard.js";

import {
  getLiveAutomationDashboard
} from "../src/automationDashboardStatus.js";

console.log("\n🧪 FINAL PRODUCTION INTEGRATION V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("AUTO");
  await resetDailyCounter();

  console.log("✅ 1. Production test state prepared");

  // --------------------------------------------------
  // 2. Production protection exports
  // --------------------------------------------------

  assert.equal(typeof getProductionProtectionStatus, "function");
  assert.equal(typeof evaluateProductionProtection, "function");
  assert.equal(typeof enforceProductionProtection, "function");
  assert.equal(typeof recordProductionDecision, "function");
  assert.equal(typeof getProductionAuditLog, "function");
  assert.equal(typeof getFinalProductionProtectionHealth, "function");

  console.log("✅ 2. Production protection functions available");

  // --------------------------------------------------
  // 3. Protection status
  // --------------------------------------------------

  const protectionStatus = await getProductionProtectionStatus();

  assert.ok(protectionStatus);
  assert.equal(typeof protectionStatus, "object");

  console.log("✅ 3. Production protection status available");

  // --------------------------------------------------
  // 4. Health check
  // --------------------------------------------------

  const health = await getFinalProductionProtectionHealth();

  assert.ok(health);
  assert.equal(typeof health, "object");

  console.log("✅ 4. Production protection health available");

  // --------------------------------------------------
  // 5. Missing video must not be allowed
  // --------------------------------------------------

  const missingVideo = await evaluateProductionProtection({
    videoPath: null,
    qaPassed: true,
    risk: "LOW",
    approved: true,
    dryRun: false
  });

  assert.ok(missingVideo);
  assert.equal(missingVideo.allowed, false);

  console.log("✅ 5. Missing video is blocked");

  // --------------------------------------------------
  // 6. Failed QA must be blocked
  // --------------------------------------------------

  const failedQA = await evaluateProductionProtection({
    videoPath: "test-video.mp4",
    qaPassed: false,
    risk: "LOW",
    approved: true,
    dryRun: false
  });

  assert.ok(failedQA);
  assert.equal(failedQA.allowed, false);

  console.log("✅ 6. Failed QA is blocked");

  // --------------------------------------------------
  // 7. Dry-run must not become real production
  // --------------------------------------------------

  const dryRun = await evaluateProductionProtection({
    videoPath: "test-video.mp4",
    qaPassed: true,
    risk: "LOW",
    approved: true,
    dryRun: true
  });

  assert.ok(dryRun);
  assert.equal(dryRun.allowed, false);

  console.log("✅ 7. Dry-run production is blocked");

  // --------------------------------------------------
  // 8. HIGH risk without approval
  // --------------------------------------------------

  const highRisk = await evaluateProductionProtection({
    videoPath: "test-video.mp4",
    qaPassed: true,
    risk: "HIGH",
    approved: false,
    dryRun: false
  });

  assert.ok(highRisk);
  assert.equal(highRisk.allowed, false);

  console.log("✅ 8. HIGH-risk content without approval is blocked");

  // --------------------------------------------------
  // 9. MEDIUM risk without approval
  // --------------------------------------------------

  const mediumRisk = await evaluateProductionProtection({
    videoPath: "test-video.mp4",
    qaPassed: true,
    risk: "MEDIUM",
    approved: false,
    dryRun: false
  });

  assert.ok(mediumRisk);
  assert.equal(mediumRisk.allowed, false);

  console.log("✅ 9. MEDIUM-risk content without approval is blocked");

  // --------------------------------------------------
  // 10. Emergency Stop protection
  // --------------------------------------------------

  await clearEmergencyStop();

  const beforeStop = await getCEOAutomationStatus();

  assert.equal(beforeStop.emergencyStop, false);

  console.log("✅ 10. Emergency Stop initially clear");

  // --------------------------------------------------
  // 11. Dashboard integration
  // --------------------------------------------------

  const dashboard = await getLiveAutomationDashboard();

  assert.ok(dashboard);
  assert.equal(typeof dashboard, "object");

  const dashboardText = JSON.stringify(dashboard).toLowerCase();

  assert.ok(
    dashboardText.includes("production") ||
    dashboardText.includes("safety") ||
    dashboardText.includes("automation")
  );

  console.log("✅ 11. Dashboard exposes production/automation information");

  // --------------------------------------------------
  // 12. Record production decision
  // --------------------------------------------------

  const decision = await recordProductionDecision({
    runId: "production-v2-test",
    decision: "BLOCKED",
    reason: "V2 integration test"
  });

  assert.ok(decision);

  console.log("✅ 12. Production decision can be recorded");

  // --------------------------------------------------
  // 13. Audit log
  // --------------------------------------------------

  const auditLog = await getProductionAuditLog();

  assert.ok(Array.isArray(auditLog));

  console.log("✅ 13. Production audit log available");

  // --------------------------------------------------
  // 14. Enforce protection
  // --------------------------------------------------

  const enforced = await enforceProductionProtection({
    videoPath: null,
    qaPassed: false,
    risk: "HIGH",
    approved: false,
    dryRun: false
  });

  assert.ok(enforced);
  assert.equal(enforced.allowed, false);

  console.log("✅ 14. Production protection enforcement works");

  // --------------------------------------------------
  // 15. Final status
  // --------------------------------------------------

  const finalStatus = await getProductionProtectionStatus();

  assert.ok(finalStatus);

  console.log("✅ 15. Final production status available");

  // --------------------------------------------------
  // 16. Clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("REVIEW");
  await resetDailyCounter();

  console.log("✅ 16. Test state cleaned");

  console.log(
    "\n🎉 FINAL PRODUCTION INTEGRATION V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ FINAL PRODUCTION INTEGRATION V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
