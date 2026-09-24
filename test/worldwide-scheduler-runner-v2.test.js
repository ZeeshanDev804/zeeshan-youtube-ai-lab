import assert from "node:assert/strict";

import {
  evaluateSchedule,
  reserveScheduledRun,
  getSchedulerStatus
} from "../src/worldwideScheduler.js";

import {
  runScheduledAutomation,
  previewScheduledAutomation,
  getScheduledAutomationStatus,
  emergencySafeStatus
} from "../src/scheduledAutomationRunner.js";

import {
  setAutomationMode,
  activateEmergencyStop,
  clearEmergencyStop,
  resetDailyCounter
} from "../src/ceoAutomationGuard.js";

console.log("\n🧪 WORLDWIDE SCHEDULER + RUNNER V2 TEST\n");

async function main() {
  // Clean test state
  await clearEmergencyStop();
  await setAutomationMode("AUTO");
  await resetDailyCounter();

  // --------------------------------------------------
  // 1. Scheduler exports
  // --------------------------------------------------

  assert.equal(typeof evaluateSchedule, "function");
  assert.equal(typeof reserveScheduledRun, "function");
  assert.equal(typeof getSchedulerStatus, "function");

  console.log("✅ 1. Scheduler functions available");

  // --------------------------------------------------
  // 2. Runner exports
  // --------------------------------------------------

  assert.equal(typeof runScheduledAutomation, "function");
  assert.equal(typeof previewScheduledAutomation, "function");
  assert.equal(typeof getScheduledAutomationStatus, "function");
  assert.equal(typeof emergencySafeStatus, "function");

  console.log("✅ 2. Scheduled Runner functions available");

  // --------------------------------------------------
  // 3. Scheduler status
  // --------------------------------------------------

  const schedulerStatus = await getSchedulerStatus();

  assert.ok(schedulerStatus);
  assert.ok(schedulerStatus.regions);
  assert.ok(
    schedulerStatus.regions.USA ||
    schedulerStatus.regions.UK ||
    schedulerStatus.regions.EUROPE
  );

  console.log("✅ 3. Worldwide scheduler status available");

  // --------------------------------------------------
  // 4. USA schedule evaluation
  // --------------------------------------------------

  const usaSchedule = await evaluateSchedule({
    region: "USA"
  });

  assert.ok(usaSchedule);
  assert.equal(typeof usaSchedule, "object");

  console.log("✅ 4. USA schedule evaluation works");

  // --------------------------------------------------
  // 5. UK schedule evaluation
  // --------------------------------------------------

  const ukSchedule = await evaluateSchedule({
    region: "UK"
  });

  assert.ok(ukSchedule);
  assert.equal(typeof ukSchedule, "object");

  console.log("✅ 5. UK schedule evaluation works");

  // --------------------------------------------------
  // 6. Europe schedule evaluation
  // --------------------------------------------------

  const europeSchedule = await evaluateSchedule({
    region: "EUROPE"
  });

  assert.ok(europeSchedule);
  assert.equal(typeof europeSchedule, "object");

  console.log("✅ 6. Europe schedule evaluation works");

  // --------------------------------------------------
  // 7. Scheduled slot reservation
  // --------------------------------------------------

  await resetDailyCounter();
  await setAutomationMode("AUTO");

  const reservation = await reserveScheduledRun({
    region: "USA"
  });

  assert.ok(reservation);
  assert.equal(typeof reservation, "object");

  console.log("✅ 7. Scheduled run reservation works");

  // --------------------------------------------------
  // 8. Preview must be safe
  // --------------------------------------------------

  const preview = await previewScheduledAutomation({
    region: "USA"
  });

  assert.ok(preview);
  assert.equal(typeof preview, "object");

  console.log("✅ 8. Scheduled automation preview works");

  // --------------------------------------------------
  // 9. Emergency Stop safety
  // --------------------------------------------------

  await activateEmergencyStop("Worldwide Scheduler V2 test");

  const emergencyStatus = await emergencySafeStatus();

  assert.ok(emergencyStatus);
  assert.equal(typeof emergencyStatus, "object");

  const emergencyRun = await runScheduledAutomation({
    region: "USA",
    dryRun: true
  });

  assert.ok(emergencyRun);
  assert.equal(typeof emergencyRun, "object");

  console.log("✅ 9. Emergency Stop safety check works");

  // --------------------------------------------------
  // 10. Clear Emergency Stop
  // --------------------------------------------------

  await clearEmergencyStop();

  const normalSafeStatus = await emergencySafeStatus();

  assert.ok(normalSafeStatus);
  assert.equal(typeof normalSafeStatus, "object");

  console.log("✅ 10. Emergency Stop can be cleared");

  // --------------------------------------------------
  // 11. Runner status
  // --------------------------------------------------

  const runnerStatus = await getScheduledAutomationStatus();

  assert.ok(runnerStatus);
  assert.equal(typeof runnerStatus, "object");

  console.log("✅ 11. Scheduled Runner status available");

  // --------------------------------------------------
  // 12. Daily limit protection
  // --------------------------------------------------

  await resetDailyCounter();
  await setAutomationMode("AUTO");

  for (let i = 0; i < 5; i++) {
    await reserveScheduledRun({
      region: "USA"
    });
  }

  const sixthReservation = await reserveScheduledRun({
    region: "USA"
  });

  assert.equal(sixthReservation.allowed, false);

  console.log("✅ 12. Sixth scheduled run blocked by daily limit");

  // --------------------------------------------------
  // 13. Final clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("REVIEW");
  await resetDailyCounter();

  console.log("\n🎉 WORLDWIDE SCHEDULER + RUNNER V2 TEST: GREEN\n");
}

main().catch((error) => {
  console.error("\n❌ WORLDWIDE SCHEDULER + RUNNER V2 TEST: RED\n");
  console.error(error);
  process.exit(1);
});
