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

import {
  createReliabilityJob,
  updateReliabilityJob,
  completeReliabilityJob,
  failReliabilityJob,
  acquireJobLock,
  releaseJobLock
} from "./automationReliability.js";


function createRunId(region) {
  return `scheduled_${String(region).toLowerCase()}_${Date.now()}`;
}


function normalizeRegion(region = "USA") {
  return String(region)
    .trim()
    .toUpperCase();
}


function isCEOBlocked(ceo) {
  return Boolean(
    ceo?.emergencyStop ||
    ceo?.mode === "STOP"
  );
}


function createScheduleLockKey(region, date) {
  const normalizedRegion =
    normalizeRegion(region);

  const scheduleDate =
    date instanceof Date
      ? date
      : new Date(date);

  const year =
    scheduleDate.getFullYear();

  const month =
    String(
      scheduleDate.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      scheduleDate.getDate()
    ).padStart(2, "0");

  const hour =
    String(
      scheduleDate.getHours()
    ).padStart(2, "0");

  return `scheduled:${normalizedRegion}:${year}-${month}-${day}:${hour}`;
}


export async function runScheduledAutomation({
  region = "USA",
  date = new Date(),
  execute = false
} = {}) {

  const normalizedRegion =
    normalizeRegion(region);


  /*
   * -------------------------------------------------------
   * CEO SAFETY CHECK
   * -------------------------------------------------------
   */

  const ceo =
    await getCEOAutomationStatus();


  if (ceo?.emergencyStop) {
    return {
      success: false,
      status: "EMERGENCY_STOP",
      mode:
        execute
          ? "EXECUTE"
          : "DRY_RUN",
      region:
        normalizedRegion,
      message:
        "Emergency STOP is active. Scheduled automation was blocked."
    };
  }


  if (ceo?.mode === "STOP") {
    return {
      success: false,
      status: "AUTOMATION_STOPPED",
      mode:
        execute
          ? "EXECUTE"
          : "DRY_RUN",
      region:
        normalizedRegion,
      message:
        "CEO automation mode is STOP."
    };
  }


  /*
   * -------------------------------------------------------
   * WORLDWIDE SCHEDULE CHECK
   * -------------------------------------------------------
   */

  const evaluation =
    await evaluateSchedule({
      region:
        normalizedRegion,
      date
    });


  if (!evaluation?.eligible) {
    return {
      success: false,
      status:
        evaluation?.status ||
        "SCHEDULE_NOT_ELIGIBLE",
      mode:
        execute
          ? "EXECUTE"
          : "DRY_RUN",
      region:
        normalizedRegion,
      evaluation
    };
  }


  /*
   * -------------------------------------------------------
   * DRY RUN
   * -------------------------------------------------------
   */

  if (!execute) {
    return {
      success: true,
      status: "SCHEDULE_READY",
      mode: "DRY_RUN",
      region:
        normalizedRegion,
      timezone:
        evaluation.timezone,
      evaluation,
      message:
        "Schedule is eligible. No automation cycle was started."
    };
  }


  /*
   * -------------------------------------------------------
   * SECOND CEO SAFETY CHECK
   * -------------------------------------------------------
   */

  const ceoBeforeReservation =
    await getCEOAutomationStatus();


  if (
    isCEOBlocked(
      ceoBeforeReservation
    )
  ) {
    return {
      success: false,
      status:
        ceoBeforeReservation.emergencyStop
          ? "EMERGENCY_STOP"
          : "AUTOMATION_STOPPED",
      mode: "EXECUTE",
      region:
        normalizedRegion,
      message:
        "CEO safety state changed before scheduled execution."
    };
  }


  /*
   * -------------------------------------------------------
   * DUPLICATE SCHEDULE LOCK
   * -------------------------------------------------------
   */

  const lockKey =
    createScheduleLockKey(
      normalizedRegion,
      date
    );


  const lock =
    await acquireJobLock({
      lockKey
    });


  if (!lock?.success) {
    return {
      success: false,
      status:
        lock?.status ||
        "SCHEDULE_ALREADY_RUNNING",
      mode: "EXECUTE",
      region:
        normalizedRegion,
      lockKey,
      lock
    };
  }


  const runId =
    createRunId(
      normalizedRegion
    );


  /*
   * -------------------------------------------------------
   * RELIABILITY JOB
   * -------------------------------------------------------
   */

  const reliabilityJob =
    await createReliabilityJob({
      runId,
      topic:
        normalizedRegion,
      stage:
        "SCHEDULE_RESERVED"
    });


  if (!reliabilityJob?.success) {
    await releaseJobLock({
      lockKey
    });

    return {
      success: false,
      status:
        "RELIABILITY_JOB_FAILED",
      mode: "EXECUTE",
      region:
        normalizedRegion,
      runId,
      reliabilityJob
    };
  }


  try {

    await updateReliabilityJob({
      runId,
      status:
        "RUNNING",
      stage:
        "SCHEDULE_RESERVATION"
    });


    /*
     * -----------------------------------------------------
     * RESERVE DAILY SLOT
     * -----------------------------------------------------
     */

    const reservation =
      await reserveScheduledRun({
        region:
          normalizedRegion,
        date
      });


    if (!reservation?.eligible) {

      await updateReliabilityJob({
        runId,
        status:
          "BLOCKED",
        stage:
          "SCHEDULE_RESERVATION",
        metadata: {
          reservationStatus:
            reservation?.status ||
            "BLOCKED"
        }
      });


      return {
        success: false,
        status:
          reservation?.status ||
          "SCHEDULE_RESERVATION_BLOCKED",
        mode: "EXECUTE",
        region:
          normalizedRegion,
        runId,
        reservation
      };
    }


    /*
     * -----------------------------------------------------
     * AUTOMATION PIPELINE
     * -----------------------------------------------------
     */

    await updateReliabilityJob({
      runId,
      status:
        "RUNNING",
      stage:
        "AUTOMATION_CYCLE"
    });


    const result =
      await runAutomationCycle({
        runId
      });


    /*
     * -----------------------------------------------------
     * AUTOMATION RESULT
     * -----------------------------------------------------
     */

    if (result?.success === true) {

      await completeReliabilityJob({
        runId,
        metadata: {
          region:
            normalizedRegion,
          timezone:
            evaluation.timezone,
          reservationStatus:
            reservation?.status ||
            null,
          automationStatus:
            result?.status ||
            "COMPLETED"
        }
      });

    } else {

      await updateReliabilityJob({
        runId,
        status:
          "BLOCKED",
        stage:
          "AUTOMATION_CYCLE",
        metadata: {
          region:
            normalizedRegion,
          automationStatus:
            result?.status ||
            "AUTOMATION_BLOCKED"
        }
      });
    }


    return {
      success:
        Boolean(
          result?.success
        ),

      status:
        result?.status ||
        "AUTOMATION_COMPLETED",

      mode: "EXECUTE",

      region:
        normalizedRegion,

      timezone:
        evaluation.timezone,

      runId,

      reservation,

      reliability:
        {
          status:
            result?.success === true
              ? "COMPLETED"
              : "BLOCKED"
        },

      result
    };

  } catch (error) {

    const normalizedError = {
      name:
        error?.name ||
        "Error",

      message:
        error?.message ||
        String(error),

      code:
        error?.code ||
        null
    };


    await failReliabilityJob({
      runId,
      error,
      stage:
        "AUTOMATION_CYCLE"
    });


    return {
      success: false,

      status:
        "AUTOMATION_CYCLE_FAILED",

      mode: "EXECUTE",

      region:
        normalizedRegion,

      runId,

      error:
        normalizedError
    };

  } finally {

    /*
     * Always release the schedule lock
     * after this workflow finishes.
     */

    await releaseJobLock({
      lockKey
    });
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
        ceo?.daily?.limit ??
        5,

      dailyUsed:
        ceo?.daily?.used ??
        0,

      dailyRemaining:
        ceo?.daily?.remaining ??
        0,

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
      status?.production?.dailyRemaining ||
      0
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