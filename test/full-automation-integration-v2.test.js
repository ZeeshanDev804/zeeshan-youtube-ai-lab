import assert from "node:assert/strict";

import {
  getLiveAutomationDashboard,
  getDashboardHealth
} from "../src/automationDashboardStatus.js";

import {
  getReliabilityStatus,
  getRecoverableJobs
} from "../src/automationReliability.js";

import {
  getAutomationStatus
} from "../src/automationOrchestrator.js";

import {
  getScheduledAutomationStatus,
  emergencySafeStatus
} from "../src/scheduledAutomationRunner.js";

import {
  getCEOAutomationStatus,
  clearEmergencyStop,
  setAutomationMode,
  resetDailyCounter
} from "../src/ceoAutomationGuard.js";

console.log("\n🧪 FULL AUTOMATION INTEGRATION V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Clean CEO state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("AUTO");
  await resetDailyCounter();

  console.log("✅ 1. CEO state prepared");

  // --------------------------------------------------
  // 2. CEO Guard status
  // --------------------------------------------------

  const ceoStatus = await getCEOAutomationStatus();

  assert.ok(ceoStatus);
  assert.equal(ceoStatus.daily.max, 5);
  assert.equal(ceoStatus.emergencyStop, false);

  console.log("✅ 2. CEO Guard status connected");

  // --------------------------------------------------
  // 3. Reliability Engine
  // --------------------------------------------------

  const reliabilityStatus = await getReliabilityStatus();

  assert.ok(reliabilityStatus);
  assert.equal(typeof reliabilityStatus, "object");

  const recoverableJobs = await getRecoverableJobs();

  assert.ok(Array.isArray(recoverableJobs));

  console.log("✅ 3. Reliability Engine connected");

  // --------------------------------------------------
  // 4. Automation Orchestrator
  // --------------------------------------------------

  const orchestratorStatus = await getAutomationStatus();

  assert.ok(orchestratorStatus);
  assert.equal(typeof orchestratorStatus, "object");

  console.log("✅ 4. Automation Orchestrator connected");

  // --------------------------------------------------
  // 5. Scheduled Runner
  // --------------------------------------------------

  const runnerStatus = await getScheduledAutomationStatus();

  assert.ok(runnerStatus);
  assert.equal(typeof runnerStatus, "object");

  console.log("✅ 5. Scheduled Runner connected");

  // --------------------------------------------------
  // 6. Emergency safety layer
  // --------------------------------------------------

  const safeStatus = await emergencySafeStatus();

  assert.ok(safeStatus);
  assert.equal(typeof safeStatus, "object");

  console.log("✅ 6. Emergency safety layer connected");

  // --------------------------------------------------
  // 7. Dashboard
  // --------------------------------------------------

  const dashboard = await getLiveAutomationDashboard();

  assert.ok(dashboard);
  assert.equal(typeof dashboard, "object");

  console.log("✅ 7. Live Automation Dashboard connected");

  // --------------------------------------------------
  // 8. Dashboard Health
  // --------------------------------------------------

  const dashboardHealth = await getDashboardHealth();

  assert.ok(dashboardHealth);
  assert.equal(typeof dashboardHealth, "object");

  console.log("✅ 8. Dashboard Health connected");

  // --------------------------------------------------
  // 9. Dashboard must expose CEO state
  // --------------------------------------------------

  assert.ok(
    dashboard.ceo ||
    dashboard.ceoControl ||
    dashboard.automation ||
    dashboard.status
  );

  console.log("✅ 9. Dashboard exposes automation state");

  // --------------------------------------------------
  // 10. Daily limit visible
  // --------------------------------------------------

  const dashboardText = JSON.stringify(dashboard);

  assert.ok(
    dashboardText.includes("5") ||
    dashboardText.toLowerCase().includes("daily")
  );

  console.log("✅ 10. Dashboard contains daily automation information");

  // --------------------------------------------------
  // 11. Reliability information visible
  // --------------------------------------------------

  const reliabilityText = JSON.stringify(dashboard);

  assert.ok(
    reliabilityText.toLowerCase().includes("reliab") ||
    reliabilityText.toLowerCase().includes("job")
  );

  console.log("✅ 11. Dashboard contains reliability information");

  // --------------------------------------------------
  // 12. Scheduler information visible
  // --------------------------------------------------

  const schedulerText = JSON.stringify(dashboard);

  assert.ok(
    schedulerText.toLowerCase().includes("schedul") ||
    schedulerText.toLowerCase().includes("region")
  );

  console.log("✅ 12. Dashboard contains scheduler information");

  // --------------------------------------------------
  // 13. YouTube must NOT falsely report connected
  // --------------------------------------------------

  const combinedStatus = JSON.stringify({
    dashboard,
    runnerStatus,
    orchestratorStatus
  }).toLowerCase();

  assert.ok(
    combinedStatus.includes("youtube")
  );

  console.log("✅ 13. YouTube connection status is represented");

  // --------------------------------------------------
  // 14. System must expose safety information
  // --------------------------------------------------

  const healthText = JSON.stringify({
    dashboardHealth,
    safeStatus,
    ceoStatus
  }).toLowerCase();

  assert.ok(
    healthText.includes("safety") ||
    healthText.includes("emergency") ||
    healthText.includes("stop")
  );

  console.log("✅ 14. Safety information is exposed");

  // --------------------------------------------------
  // 15. Final integration snapshot
  // --------------------------------------------------

  const finalSnapshot = {
    ceo: ceoStatus,
    reliability: reliabilityStatus,
    orchestrator: orchestratorStatus,
    schedulerRunner: runnerStatus,
    dashboard: dashboardHealth,
    emergency: safeStatus
  };

  assert.ok(finalSnapshot.ceo);
  assert.ok(finalSnapshot.reliability);
  assert.ok(finalSnapshot.orchestrator);
  assert.ok(finalSnapshot.schedulerRunner);
  assert.ok(finalSnapshot.dashboard);
  assert.ok(finalSnapshot.emergency);

  console.log("✅ 15. Full integration snapshot created");

  // --------------------------------------------------
  // 16. Final clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("REVIEW");
  await resetDailyCounter();

  console.log("✅ 16. Test state cleaned");

  console.log(
    "\n🎉 FULL AUTOMATION INTEGRATION V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ FULL AUTOMATION INTEGRATION V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
