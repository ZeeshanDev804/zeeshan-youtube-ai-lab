import "dotenv/config";

import {
  evaluateSchedule,
  reserveScheduledRun,
  getSchedulerStatus
} from "./worldwideScheduler.js";

import {
  runAutomationCycle,
  getAutomationStatus
} from "./automationOrchestrator.js";

import {
  getCEOAutomationStatus,
  clearEmergencyStop
} from "./ceoAutomationGuard.js";

function createRunId(region) {
  return `scheduled_${String(region)
    .toLowerCase()}_${Date.now()}`;
}

export async function runScheduledAutomation({
  region = "USA",
  date = new Date(),
  execute = false
} = {}) {
  const normalizedRegion =
    String(region)
      .trim()
      .toUpperCase();

  const ceo =
    await getCEOAutomationStatus();

  if (ceo.emergencyStop) {
    return {
      success: false,
      status:
        "EMERGENCY_STOP",
      region:
        normalizedRegion,
      message:
        "Emergency STOP is active. Scheduled automation was not started."
    };
  }

  if (
    ceo.mode ===
    "STOP"
  ) {
    return {
      success: false,
      status:
        "AUTOMATION_STOPPED",
      region:
        normalizedRegion,
      message:
        "CEO automation mode is STOP."
    };
  }

  const evaluation =
    await evaluateSchedule({
      region:
        normalizedRegion,
      date
    });

  if (
    !evaluation.eligible
  ) {
    return {
      success: false,
      status:
        evaluation.status,
      region:
        normalizedRegion,
      evaluation
    };
  }

  /*
   * Dry-run mode:
   * verify everything without starting
   * an actual automation cycle.
   */

  if (!execute) {
    return {
      success: true,
      status:
        "SCHEDULE_READY",
      mode:
        "DRY_RUN",
      region:
        normalizedRegion,
      evaluation
    };
  }

  /*
   * Reserve one of the maximum five
   * daily automation slots before
   * starting the actual cycle.
   */

  const reservation =
    await reserveScheduledRun({
      region:
        normalizedRegion,
      date
    });

  if (
    !reservation.eligible
  ) {
    return {
      success: false,
      status:
        reservation.status,
      region:
        normalizedRegion,
      reservation
    };
  }

  const runId =
    createRunId(
      normalizedRegion
    );

  try {
    const result =
      await runAutomationCycle({
        runId
      });

    return {
      success:
        Boolean(
          result?.success
        ),
      status:
        result?.status ||
        "AUTOMATION_COMPLETED",
      mode:
        "EXECUTE",
      region:
        normalizedRegion,
      timezone:
        evaluation.timezone,
      runId,
      reservation,
      result
    };
  } catch (error) {
    return {
      success: false,
      status:
        "AUTOMATION_CYCLE_FAILED",
      mode:
        "EXECUTE",
      region:
        normalizedRegion,
      runId,
      error: {
        name:
          error?.name ||
          "Error",
        message:
          error?.message ||
          String(error)
      }
    };
  }
}

export async function previewScheduledAutomation({
  region = "USA",
  date = new Date()
} = {}) {
  return runScheduledAutomation({
    region,
    date,
    execute: false
  });
}

export async function executeScheduledAutomation({
  region = "USA",
  date = new Date()
} = {}) {
  return runScheduledAutomation({
    region,
    date,
    execute: true
  });
}

export async function getScheduledAutomationStatus() {
  const [
    scheduler,
    ceo,
    orchestrator
  ] = await Promise.all([
    getSchedulerStatus(),
    getCEOAutomationStatus(),
    getAutomationStatus()
  ]);

  return {
    success: true,

    scheduler,

    ceo,

    orchestrator,

    pipeline: {
      scheduler:
        "READY",
      ceoGuard:
        ceo.emergencyStop
          ? "EMERGENCY_STOP"
          : ceo.mode ===
              "STOP"
            ? "STOPPED"
            : "READY",
      orchestrator:
        orchestrator
          ? "READY"
          : "UNKNOWN"
    },

    youtubeUpload:
      "NOT_CONNECTED",

    googleCloud:
      "NOT_CONNECTED"
  };
}

export async function emergencySafeStatus() {
  const status =
    await getScheduledAutomationStatus();

  return {
    ...status,

    safeToStart:
      !status.ceo
        .emergencyStop &&
      status.ceo.mode !==
        "STOP" &&
      status.ceo.daily.remaining >
        0
  };
}

export default {
  runScheduledAutomation,
  previewScheduledAutomation,
  executeScheduledAutomation,
  getScheduledAutomationStatus,
  emergencySafeStatus
};
