import assert from "node:assert/strict";
import test from "node:test";

import {
  setAutomationMode,
  clearEmergencyStop,
  resetDailyCounter,
  canStartAutomation,
  canPublish,
  getCEOAutomationStatus
} from "../src/ceoAutomationGuard.js";

import {
  getAutomationOrchestratorStatus
} from "../src/automationOrchestrator.js";

import {
  getReliabilityStatus
} from "../src/automationReliability.js";

test("E2E automation: all core systems are available", async () => {
  await clearEmergencyStop();
  await resetDailyCounter();

  await setAutomationMode("AUTO");

  const ceo =
    await getCEOAutomationStatus();

  assert.equal(
    ceo.success,
    true
  );

  assert.equal(
    ceo.mode,
    "AUTO"
  );

  assert.equal(
    ceo.emergencyStop,
    false
  );

  assert.equal(
    ceo.daily.maximum,
    5
  );

  const orchestrator =
    await getAutomationOrchestratorStatus();

  assert.ok(
    orchestrator,
    "Automation orchestrator status must exist."
  );

  const reliability =
    await getReliabilityStatus();

  assert.equal(
    reliability.configured,
    true
  );

  assert.equal(
    reliability.status,
    "READY"
  );
});

test("E2E automation: CEO start gate works", async () => {
  await clearEmergencyStop();
  await resetDailyCounter();

  await setAutomationMode("AUTO");

  const result =
    await canStartAutomation({
      requestedVideos: 1
    });

  assert.equal(
    result.allowed,
    true
  );

  assert.equal(
    result.status,
    "READY"
  );
});

test("E2E automation: medium risk cannot auto-publish", async () => {
  await clearEmergencyStop();

  await setAutomationMode("AUTO");

  const result =
    await canPublish({
      risk: "MEDIUM"
    });

  assert.equal(
    result.allowed,
    false
  );

  assert.equal(
    result.status,
    "APPROVAL_REQUIRED"
  );
});

test("E2E automation: high risk cannot auto-publish", async () => {
  await clearEmergencyStop();

  await setAutomationMode("AUTO");

  const result =
    await canPublish({
      risk: "HIGH"
    });

  assert.equal(
    result.allowed,
    false
  );

  assert.equal(
    result.status,
    "APPROVAL_REQUIRED"
  );
});

test("E2E automation: review mode blocks direct publishing", async () => {
  await clearEmergencyStop();

  await setAutomationMode("REVIEW");

  const result =
    await canPublish({
      risk: "LOW"
    });

  assert.equal(
    result.allowed,
    false
  );

  assert.equal(
    result.status,
    "APPROVAL_REQUIRED"
  );
});

test("E2E automation: STOP blocks new automation", async () => {
  await clearEmergencyStop();

  await setAutomationMode("STOP");

  const result =
    await canStartAutomation({
      requestedVideos: 1
    });

  assert.equal(
    result.allowed,
    false
  );

  assert.equal(
    result.status,
    "BLOCKED"
  );
});

test("E2E automation: emergency STOP overrides AUTO", async () => {
  await setAutomationMode("AUTO");

  const {
    activateEmergencyStop
  } = await import(
    "../src/ceoAutomationGuard.js"
  );

  await activateEmergencyStop(
    "E2E emergency stop test"
  );

  const result =
    await canStartAutomation({
      requestedVideos: 1
    });

  assert.equal(
    result.allowed,
    false
  );

  assert.equal(
    result.status,
    "EMERGENCY_STOP"
  );

  await clearEmergencyStop();
});

test("E2E automation: daily maximum is five videos", async () => {
  await clearEmergencyStop();
  await resetDailyCounter();

  await setAutomationMode("AUTO");

  const status =
    await getCEOAutomationStatus();

  assert.equal(
    status.daily.maximum,
    5
  );

  assert.ok(
    status.daily.maximum <= 5,
    "Daily automation limit must never exceed 5."
  );
});

test("E2E automation: final system status remains readable", async () => {
  await clearEmergencyStop();

  await setAutomationMode("AUTO");

  const ceo =
    await getCEOAutomationStatus();

  const orchestrator =
    await getAutomationOrchestratorStatus();

  const reliability =
    await getReliabilityStatus();

  assert.equal(
    ceo.success,
    true
  );

  assert.ok(
    orchestrator
  );

  assert.equal(
    reliability.status,
    "READY"
  );
});

console.log(
  "End-to-End Automation Test: GREEN"
);
