import assert from "node:assert/strict";

import {
  researchTopic
} from "../src/researchEngine.js";

import {
  analyzeSafety
} from "../src/safetyGuard.js";

import {
  checkCopyrightSafety
} from "../src/copyrightGuard.js";

import {
  checkDuplicateContent
} from "../src/duplicateGuard.js";

import {
  createTTSJob
} from "../src/ttsProvider.js";

import {
  createVisualJob
} from "../src/visualProvider.js";

import {
  produceFinalShort
} from "../src/finalShortProductionPipeline.js";

import {
  checkFinalShortQuality
} from "../src/finalShortQAPipeline.js";

import {
  getProductionProtectionStatus
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

import {
  getReliabilityStatus
} from "../src/automationReliability.js";

import {
  getAutomationStatus
} from "../src/automationOrchestrator.js";

import {
  getScheduledAutomationStatus
} from "../src/scheduledAutomationRunner.js";

console.log("\n🧪 MASTER SYSTEM E2E V2 TEST\n");

async function main() {
  // --------------------------------------------------
  // 1. Clean system state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("AUTO");
  await resetDailyCounter();

  console.log("✅ 1. System state prepared");

  // --------------------------------------------------
  // 2. Research
  // --------------------------------------------------

  const research = await researchTopic({
    topic: "AI productivity tools and useful technology"
  });

  assert.ok(research);
  assert.equal(typeof research, "object");

  console.log("✅ 2. Research stage");

  // --------------------------------------------------
  // 3. Safety
  // --------------------------------------------------

  const safety = await analyzeSafety({
    topic: "AI productivity tools and useful technology",
    research
  });

  assert.ok(safety);
  assert.equal(typeof safety, "object");

  console.log("✅ 3. Safety stage");

  // --------------------------------------------------
  // 4. Copyright
  // --------------------------------------------------

  const copyright = await checkCopyrightSafety({
    title: "AI Productivity Tools",
    script:
      "AI tools can help people organize work, learn faster, and automate repetitive tasks."
  });

  assert.ok(copyright);
  assert.equal(typeof copyright, "object");

  console.log("✅ 4. Copyright stage");

  // --------------------------------------------------
  // 5. Duplicate
  // --------------------------------------------------

  const duplicate = await checkDuplicateContent({
    title: "AI Productivity Tools",
    script:
      "AI tools can help people organize work, learn faster, and automate repetitive tasks.",
    existingContent: []
  });

  assert.ok(duplicate);
  assert.equal(typeof duplicate, "object");

  console.log("✅ 5. Duplicate stage");

  // --------------------------------------------------
  // 6. Voice
  // --------------------------------------------------

  const voice = await createTTSJob({
    text:
      "AI tools can help people save time and work more efficiently."
  });

  assert.ok(voice);
  assert.equal(typeof voice, "object");

  console.log("✅ 6. Voice stage");

  // --------------------------------------------------
  // 7. Visual
  // --------------------------------------------------

  const visual = await createVisualJob({
    prompt:
      "Vertical YouTube Shorts visual about AI productivity and modern technology.",
    aspectRatio: "9:16"
  });

  assert.ok(visual);
  assert.equal(typeof visual, "object");

  console.log("✅ 7. Visual stage");

  // --------------------------------------------------
  // 8. Final production function
  // --------------------------------------------------

  assert.equal(typeof produceFinalShort, "function");

  console.log("✅ 8. Final production pipeline available");

  // --------------------------------------------------
  // 9. QA function
  // --------------------------------------------------

  assert.equal(typeof checkFinalShortQuality, "function");

  console.log("✅ 9. Final video QA available");

  // --------------------------------------------------
  // 10. Production protection
  // --------------------------------------------------

  const protection = await getProductionProtectionStatus();

  assert.ok(protection);
  assert.equal(typeof protection, "object");

  console.log("✅ 10. Production protection available");

  // --------------------------------------------------
  // 11. CEO control
  // --------------------------------------------------

  const ceo = await getCEOAutomationStatus();

  assert.ok(ceo);
  assert.equal(ceo.daily.max, 5);
  assert.equal(ceo.emergencyStop, false);

  console.log("✅ 11. CEO control connected");

  // --------------------------------------------------
  // 12. Reliability
  // --------------------------------------------------

  const reliability = await getReliabilityStatus();

  assert.ok(reliability);
  assert.equal(typeof reliability, "object");

  console.log("✅ 12. Reliability system connected");

  // --------------------------------------------------
  // 13. Orchestrator
  // --------------------------------------------------

  const orchestrator = await getAutomationStatus();

  assert.ok(orchestrator);
  assert.equal(typeof orchestrator, "object");

  console.log("✅ 13. Automation Orchestrator connected");

  // --------------------------------------------------
  // 14. Scheduler Runner
  // --------------------------------------------------

  const scheduler = await getScheduledAutomationStatus();

  assert.ok(scheduler);
  assert.equal(typeof scheduler, "object");

  console.log("✅ 14. Scheduler Runner connected");

  // --------------------------------------------------
  // 15. Dashboard
  // --------------------------------------------------

  const dashboard = await getLiveAutomationDashboard();

  assert.ok(dashboard);
  assert.equal(typeof dashboard, "object");

  console.log("✅ 15. CEO Dashboard connected");

  // --------------------------------------------------
  // 16. Master integration snapshot
  // --------------------------------------------------

  const masterSnapshot = {
    research,
    safety,
    copyright,
    duplicate,
    voice,
    visual,
    productionProtection: protection,
    ceo,
    reliability,
    orchestrator,
    scheduler,
    dashboard
  };

  for (const [name, value] of Object.entries(masterSnapshot)) {
    assert.ok(value, `${name} is missing`);
  }

  console.log("✅ 16. Master integration snapshot complete");

  // --------------------------------------------------
  // 17. Final clean state
  // --------------------------------------------------

  await clearEmergencyStop();
  await setAutomationMode("REVIEW");
  await resetDailyCounter();

  console.log("✅ 17. System state cleaned");

  console.log(
    "\n🎉 MASTER SYSTEM E2E V2 TEST: GREEN\n"
  );
}

main().catch((error) => {
  console.error(
    "\n❌ MASTER SYSTEM E2E V2 TEST: RED\n"
  );

  console.error(error);
  process.exit(1);
});
