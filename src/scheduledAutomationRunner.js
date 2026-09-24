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
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

import {
  getYouTubeOAuthStatus
} from "./youtubeOAuthUploader.js";


function createRunId(region) {
  return `scheduled_${String(region).toLowerCase()}_${Date.now()}`;
}


function normalizeRegion(region = "USA") {
  return String(region).trim().toUpperCase();
}


function isCEOBlocked(ceo) {
  return Boolean(
    ceo?.emergencyStop ||
    ceo?.mode === "STOP"
  );
}


export async function runScheduledAutomation({
  region = "USA",
  date = new Date(),
  execute = false
} = {}) {

  const normalizedRegion = normalizeRegion(region);

  const ceo = await getCEOAutomationStatus();


  /*
   * Emergency STOP has highest priority.
   */

  if (ceo?.emergencyStop) {
    return {
      success: false,
      status: "EMERGENCY_STOP",
      mode: execute ? "EXECUTE" : "DRY_RUN",
      region: normalizedRegion,
      message:
        "Emergency STOP is active. Scheduled automation was blocked."
    };
  }


  /*
   * CEO STOP mode blocks scheduled automation.
   */

  if (ceo?.mode === "STOP") {
    return {
      success: false,
      status: "AUTOMATION_STOPPED",
      mode: execute ? "EXECUTE" : "DRY_RUN",
      region: normalizedRegion,
      message:
        "CEO automation mode is STOP."
    };
  }


  /*
   * Check worldwide regional schedule.
   */

  const evaluation = await evaluateSchedule({
    region: normalizedRegion,
    date
  });


  if (!evaluation?.eligible) {
    return {
      success: false,
      status: evaluation?.status || "SCHEDULE_NOT_ELIGIBLE",
      mode: execute ? "EXECUTE" : "DRY_RUN",
      region: normalizedRegion,
      evaluation
    };
  }


  /*
   * Dry-run:
   * verify schedule without consuming a daily slot
   * and without starting the automation pipeline.
   */

  if (!execute) {
    return {
      success: true,
      status: "SCHEDULE_READY",
      mode: "DRY_RUN",
      region: normalizedRegion,
      timezone: evaluation.timezone,
      evaluation,
      message:
        "Schedule is eligible. No automation cycle was started."
    };
  }


  /*
   * Re-check CEO state immediately before
   * consuming a production slot.
   */

  const ceoBeforeReservation =
    await getCEOAutomationStatus();


  if (isCEOBlocked(ceoBeforeReservation)) {
    return {
      success: false,
      status:
        ceoBeforeReservation.emergencyStop
          ? "EMERGENCY_STOP"
          : "AUTOMATION_STOPPED",
      mode: "EXECUTE",
      region: normalizedRegion,
      message:
        "CEO safety state changed before scheduled execution."
    };
  }


  /*
   * Reserve one of the maximum daily slots.
   */

  const reservation = await reserveScheduledRun({
    region: normalizedRegion,
    date
  });


  if (!reservation?.eligible) {
    return {
      success: false,
      status:
        reservation?.status ||
        "SCHEDULE_RESERVATION_BLOCKED",
      mode: "EXECUTE",
      region: normalizedRegion,
      reservation
    };
  }


  const runId = createRunId(normalizedRegion);


  try {

    /*
     * Start the complete automation orchestrator.
     */

    const result = await runAutomationCycle({
      runId
    });


    return {
      success: Boolean(result?.success),
      status:
        result?.status ||
        "AUTOMATION_COMPLETED",
      mode: "EXECUTE",
      region: normalizedRegion,
      timezone: evaluation.timezone,
      runId,
      reservation,
      result
    };

  } catch (error) {

    return {
      success: false,
      status: "AUTOMATION_CYCLE_FAILED",
      mode: "EXECUTE",
      region: normalizedRegion,
      runId,
      reservation,
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
    orchestrator,
    youtube
  ] = await Promise.all([
    getSchedulerStatus(),
    getCEOAutomationStatus(),
    getAutomationStatus(),
    getYouTubeOAuthStatus()
  ]);


  const ceoBlocked =
    Boolean(
      ceo?.emergencyStop ||
      ceo?.mode === "STOP"
    );


  return {
    success: true,

    scheduler,

    ceo,

    orchestrator,

    youtube,

    pipeline: {
      scheduler:
        scheduler
          ? "READY"
          : "UNKNOWN",

      ceoGuard:
        ceo?.emergencyStop
          ? "EMERGENCY_STOP"
          : ceo?.mode === "STOP"
            ? "STOPPED"
            : "READY",

      orchestrator:
        orchestrator
          ? "READY"
          : "UNKNOWN",

      youtubeUpload:
        youtube?.configured
          ? "CONNECTED"
          : "NOT_CONFIGURED"
    },

    production: {
      dailyLimit:
        ceo?.daily?.limit ?? 5,

      dailyUsed:
        ceo?.daily?.used ?? 0,

      dailyRemaining:
        ceo?.daily?.remaining ?? 0,

      blocked:
        ceoBlocked
    }
  };
}


export async function emergencySafeStatus() {

  const status =
    await getScheduledAutomationStatus();


  const remaining =
    Number(
      status?.production?.dailyRemaining || 0
    );


  return {
    ...status,

    safeToStart:
      !status?.ceo?.emergencyStop &&
      status?.ceo?.mode !== "STOP" &&
      remaining > 0
  };
}


export default {
  runScheduledAutomation,
  previewScheduledAutomation,
  executeScheduledAutomation,
  getScheduledAutomationStatus,
  emergencySafeStatus
};