import "dotenv/config";

import {
  evaluateSchedule,
  reserveScheduledRun
} from "./worldwideScheduler.js";

import {
  canStartAutomation,
  activateEmergencyStop,
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

import {
  runAutomationCycle
} from "./automationOrchestrator.js";

import {
  createReliabilityJob,
  completeReliabilityJob,
  failReliabilityJob
} from "./automationReliability.js";

const DAILY_TARGET_VIDEOS = 5;

const REGIONS = [
  "USA",
  "UK",
  "EUROPE",
  "MIDDLE_EAST"
];

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRunId(region) {
  return `scheduled-${cleanText(region).toLowerCase()}-${Date.now()}`;
}

function normalizeRequestedVideos(value = 1) {
  return Math.max(
    1,
    Math.min(
      50,
      Math.floor(Number(value) || 1)
    )
  );
}

/*
|--------------------------------------------------------------------------
| CEO SAFETY CHECK
|--------------------------------------------------------------------------
*/

async function checkCEOState() {
  const status =
    await getCEOAutomationStatus();

  if (status?.emergencyStop) {
    return {
      allowed: false,
      status: "EMERGENCY_STOP",
      reason:
        status.emergencyStopReason ||
        "CEO emergency stop is active."
    };
  }

  if (status?.mode === "STOP") {
    return {
      allowed: false,
      status: "CEO_STOP",
      reason:
        "CEO automation mode is STOP."
    };
  }

  return {
    allowed: true,
    status: "CEO_READY",
    mode:
      status?.mode ||
      "AUTO"
  };
}

/*
|--------------------------------------------------------------------------
| RUN ONE SCHEDULED REGION
|--------------------------------------------------------------------------
*/

export async function runScheduledRegion({
  region,
  requestedVideos = 1,
  date = new Date()
} = {}) {

  const normalizedRegion =
    cleanText(region).toUpperCase();

  /*
   * Validate region.
   */

  if (
    !REGIONS.includes(
      normalizedRegion
    )
  ) {
    return {
      success: false,
      skipped: false,
      status: "INVALID_REGION",
      region: normalizedRegion
    };
  }

  const normalizedRequestedVideos =
    normalizeRequestedVideos(
      requestedVideos
    );

  /*
   * First CEO safety check.
   */

  const ceo =
    await checkCEOState();

  if (!ceo.allowed) {
    return {
      success: false,
      skipped: false,
      status: ceo.status,
      reason: ceo.reason,
      region: normalizedRegion
    };
  }

  /*
   * Check worldwide schedule.
   */

  const evaluation =
    await evaluateSchedule({
      region: normalizedRegion,
      requestedVideos:
        normalizedRequestedVideos,
      date
    });

  /*
   * IMPORTANT:
   *
   * OUTSIDE_SCHEDULE_WINDOW is a NORMAL SKIP.
   *
   * It must NOT become success:false.
   * Otherwise GitHub Actions treats a normal
   * waiting period as a failed workflow.
   */

  if (
    evaluation?.status ===
    "OUTSIDE_SCHEDULE_WINDOW"
  ) {
    return {
      success: true,

      skipped: true,

      status:
        "OUTSIDE_SCHEDULE_WINDOW",

      reason:
        "Region is currently outside its scheduled automation window.",

      region:
        normalizedRegion,

      scheduleSlotId:
        null,

      reservationKey:
        null,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true
    };
  }

  /*
   * Other scheduler blocks are real blocks.
   */

  if (!evaluation?.allowed) {
    return {
      success: false,

      skipped: false,

      status:
        evaluation?.status ||
        "SCHEDULE_NOT_ALLOWED",

      reason:
        evaluation?.reason ||
        null,

      region:
        normalizedRegion,

      scheduleSlotId:
        evaluation?.scheduleSlotId ||
        null,

      reservationKey:
        evaluation?.reservationKey ||
        null
    };
  }

  /*
   * Create unique run ID.
   */

  const runId =
    createRunId(
      normalizedRegion
    );

  /*
   * Reserve exact schedule slot.
   */

  const reservation =
    await reserveScheduledRun({
      region:
        normalizedRegion,

      runId,

      date
    });

  /*
   * Safety:
   *
   * If reservation says outside window,
   * treat it as a normal skip.
   */

  if (
    reservation?.status ===
    "OUTSIDE_SCHEDULE_WINDOW"
  ) {
    return {
      success: true,

      skipped: true,

      status:
        "OUTSIDE_SCHEDULE_WINDOW",

      reason:
        reservation?.reason ||
        "Region is outside its scheduled window.",

      region:
        normalizedRegion,

      scheduleSlotId:
        null,

      reservationKey:
        null,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true
    };
  }

  if (
    !reservation?.success
  ) {
    return {
      success: false,

      skipped: false,

      status:
        reservation?.status ||
        "SCHEDULE_RESERVATION_FAILED",

      reason:
        reservation?.reason ||
        null,

      region:
        normalizedRegion,

      scheduleSlotId:
        reservation?.scheduleSlotId ||
        evaluation?.scheduleSlotId ||
        null,

      reservationKey:
        reservation?.reservationKey ||
        evaluation?.reservationKey ||
        null
    };
  }

  /*
   * Same schedule slot already executed.
   *
   * This is also a NORMAL SKIP.
   */

  if (
    reservation?.status ===
      "ALREADY_RESERVED" ||
    reservation?.status ===
      "ALREADY_RUN" ||
    reservation?.skipped === true
  ) {
    return {
      success: true,

      skipped: true,

      status:
        reservation?.status ===
          "ALREADY_RUN"
          ? "SLOT_ALREADY_RUN"
          : "SLOT_ALREADY_RESERVED",

      region:
        normalizedRegion,

      scheduleSlotId:
        reservation?.scheduleSlotId ||
        evaluation?.scheduleSlotId ||
        null,

      reservationKey:
        reservation?.reservationKey ||
        evaluation?.reservationKey ||
        null,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true,

      reason:
        reservation?.reason ||
        "This schedule slot was already processed."
    };
  }

  /*
   * Reliability tracking.
   */

  let reliabilityJob = null;

  try {

    reliabilityJob =
      await createReliabilityJob({
        runId,

        topic:
          `Scheduled automation - ${normalizedRegion}`,

        stage:
          "SCHEDULED_AUTOMATION"
      });

    const reliabilityRunId =
      reliabilityJob?.job?.runId ||
      runId;

    /*
     * Store scheduler metadata.
     */

    if (
      reliabilityJob?.job
    ) {

      reliabilityJob.job.metadata = {

        ...(reliabilityJob.job.metadata || {}),

        jobType:
          "scheduled-automation",

        region:
          normalizedRegion,

        scheduleSlotId:
          reservation?.scheduleSlotId ||
          evaluation?.scheduleSlotId ||
          null,

        reservationKey:
          reservation?.reservationKey ||
          evaluation?.reservationKey ||
          null,

        dailyTarget:
          DAILY_TARGET_VIDEOS,

        targetIsHardMaximum:
          false
      };
    }

    /*
     * Final CEO safety check.
     */

    const finalCEOCheck =
      await checkCEOState();

    if (!finalCEOCheck.allowed) {

      await failReliabilityJob({
        runId:
          reliabilityRunId,

        error:
          new Error(
            finalCEOCheck.reason ||
            finalCEOCheck.status
          ),

        stage:
          "CEO_FINAL_SAFETY_CHECK",

        metadata: {
          region:
            normalizedRegion,

          status:
            finalCEOCheck.status
        }
      });

      return {
        success: false,

        skipped: false,

        status:
          finalCEOCheck.status,

        reason:
          finalCEOCheck.reason,

        region:
          normalizedRegion,

        runId
      };
    }

    /*
     * Automation start gate.
     *
     * 5 is NOT a hard maximum.
     */

    const startCheck =
      await canStartAutomation({
        requestedVideos:
          normalizedRequestedVideos
      });

    if (!startCheck?.allowed) {

      await failReliabilityJob({
        runId:
          reliabilityRunId,

        error:
          new Error(
            startCheck?.reason ||
            startCheck?.status ||
            "Automation start was blocked."
          ),

        stage:
          "AUTOMATION_START_GATE",

        metadata: {
          region:
            normalizedRegion,

          status:
            startCheck?.status ||
            "BLOCKED"
        }
      });

      return {
        success: false,

        skipped: false,

        status:
          startCheck?.status ||
          "AUTOMATION_START_BLOCKED",

        reason:
          startCheck?.reason ||
          "Automation start was blocked.",

        region:
          normalizedRegion,

        runId
      };
    }

    /*
     * Run actual automation.
     */

    const result =
      await runAutomationCycle({
        region:
          normalizedRegion,

        runId,

        requestedVideos:
          normalizedRequestedVideos
      });

    const automationSucceeded =
      result?.success !== false;

    /*
     * Reliability result.
     */

    if (automationSucceeded) {

      await completeReliabilityJob({
        runId:
          reliabilityRunId,

        metadata: {

          region:
            normalizedRegion,

          scheduleSlotId:
            reservation?.scheduleSlotId ||
            evaluation?.scheduleSlotId ||
            null,

          reservationKey:
            reservation?.reservationKey ||
            evaluation?.reservationKey ||
            null,

          requestedVideos:
            normalizedRequestedVideos,

          resultStatus:
            result?.status ||
            null,

          produced:
            Number(
              result?.counts?.produced ||
              0
            ),

          ready:
            Number(
              result?.counts?.ready ||
              0
            ),

          review:
            Number(
              result?.counts?.review ||
              0
            ),

          blocked:
            Number(
              result?.counts?.blocked ||
              0
            ),

          failed:
            Number(
              result?.counts?.failed ||
              0
            )
        }
      });

    } else {

      await failReliabilityJob({
        runId:
          reliabilityRunId,

        error:
          new Error(
            result?.reason ||
            result?.status ||
            "Automation cycle failed."
          ),

        stage:
          "AUTOMATION_CYCLE",

        metadata: {
          region:
            normalizedRegion,

          resultStatus:
            result?.status ||
            null
        }
      });
    }

    return {
      success:
        automationSucceeded,

      skipped: false,

      status:
        automationSucceeded
          ? "SCHEDULED_AUTOMATION_COMPLETED"
          : "SCHEDULED_AUTOMATION_FAILED",

      region:
        normalizedRegion,

      runId,

      scheduleSlotId:
        reservation?.scheduleSlotId ||
        evaluation?.scheduleSlotId ||
        null,

      reservationKey:
        reservation?.reservationKey ||
        evaluation?.reservationKey ||
        null,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true,

      result
    };

  } catch (error) {

    /*
     * Never hide the original automation error.
     */

    if (reliabilityJob) {

      try {

        await failReliabilityJob({
          runId:
            reliabilityJob?.job?.runId ||
            runId,

          error,

          stage:
            "SCHEDULED_AUTOMATION",

          metadata: {
            region:
              normalizedRegion
          }
        });

      } catch {
        // Keep original error.
      }
    }

    return {
      success: false,

      skipped: false,

      status:
        "SCHEDULED_AUTOMATION_FAILED",

      region:
        normalizedRegion,

      runId,

      error:
        error?.message ||
        String(error)
    };
  }
}

/*
|--------------------------------------------------------------------------
| RUN ALL REGIONS
|--------------------------------------------------------------------------
*/

export async function runScheduledAutomation({
  requestedVideos = 1,
  date = new Date()
} = {}) {

  const normalizedRequestedVideos =
    normalizeRequestedVideos(
      requestedVideos
    );

  const results = [];

  for (
    const region of REGIONS
  ) {

    const result =
      await runScheduledRegion({
        region,

        requestedVideos:
          normalizedRequestedVideos,

        date
      });

    results.push(result);
  }

  /*
   * Actual successful automation runs.
   */

  const successfulRuns =
    results.filter(
      (item) =>
        item?.success === true &&
        item?.skipped !== true
    );

  /*
   * Normal scheduler skips.
   */

  const skippedRuns =
    results.filter(
      (item) =>
        item?.skipped === true ||
        item?.status ===
          "OUTSIDE_SCHEDULE_WINDOW" ||
        item?.status ===
          "SLOT_ALREADY_RESERVED" ||
        item?.status ===
          "SLOT_ALREADY_RUN"
    );

  /*
   * Real failures only.
   */

  const failedRuns =
    results.filter(
      (item) =>
        item?.success === false
    );

  /*
   * IMPORTANT:
   *
   * If all regions are currently outside
   * their local schedule windows, that is NOT
   * a failed workflow.
   *
   * GitHub Actions should finish successfully
   * and wait for the next 15-minute run.
   */

  const onlyNormalSkips =
    failedRuns.length === 0;

  return {

    success:
      onlyNormalSkips,

    status:
      onlyNormalSkips
        ? (
            successfulRuns.length > 0
              ? "SCHEDULED_AUTOMATION_COMPLETE"
              : "SCHEDULED_AUTOMATION_SKIPPED"
          )
        : "SCHEDULED_AUTOMATION_COMPLETE_WITH_ERRORS",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    targetIsHardMaximum:
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    regionsAttempted:
      REGIONS.length,

    successfulRegions:
      successfulRuns.length,

    skippedRegions:
      skippedRuns.length,

    failedRegions:
      failedRuns.length,

    results
  };
}

/*
|--------------------------------------------------------------------------
| PREVIEW
|--------------------------------------------------------------------------
|
| Preview does NOT generate or publish content.
|--------------------------------------------------------------------------
*/

export async function previewScheduledAutomation({
  region = null,
  date = new Date()
} = {}) {

  const regionsToPreview =
    region
      ? [
          cleanText(region)
            .toUpperCase()
        ]
      : REGIONS;

  const previews = [];

  for (
    const currentRegion
      of regionsToPreview
  ) {

    if (
      !REGIONS.includes(
        currentRegion
      )
    ) {

      previews.push({

        region:
          currentRegion,

        allowed: false,

        skipped: false,

        status:
          "INVALID_REGION",

        reason:
          "Region is not supported.",

        scheduleSlotId:
          null,

        reservationKey:
          null,

        dailyTarget:
          DAILY_TARGET_VIDEOS,

        targetIsHardMaximum:
          false,

        canContinueBeyondTarget:
          true,

        qualityOverQuantity:
          true
      });

      continue;
    }

    const evaluation =
      await evaluateSchedule({
        region:
          currentRegion,

        date
      });

    previews.push({

      region:
        currentRegion,

      allowed:
        Boolean(
          evaluation?.allowed
        ),

      skipped:
        evaluation?.status ===
        "OUTSIDE_SCHEDULE_WINDOW",

      status:
        evaluation?.status ||
        "UNKNOWN",

      reason:
        evaluation?.reason ||
        null,

      scheduleSlotId:
        evaluation?.scheduleSlotId ||
        null,

      reservationKey:
        evaluation?.reservationKey ||
        null,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
        true,

      qualityOverQuantity:
        true
    });
  }

  return {

    success: true,

    status:
      "SCHEDULE_PREVIEW",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    targetIsHardMaximum:
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    previews
  };
}

/*
|--------------------------------------------------------------------------
| EMERGENCY STOP HELPER
|--------------------------------------------------------------------------
*/

export async function emergencyStopAutomation(
  reason =
    "Emergency stop requested by CEO."
) {

  return activateEmergencyStop(
    reason
  );
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

export async function getScheduledRunnerStatus() {

  const ceo =
    await getCEOAutomationStatus();

  return {

    success: true,

    runner:
      "SCHEDULED_AUTOMATION",

    regions:
      REGIONS,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    targetIsHardMaximum:
      false,

    maximumVideosPerDay:
      null,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    ceo: {

      mode:
        ceo?.mode ||
        "UNKNOWN",

      emergencyStop:
        Boolean(
          ceo?.emergencyStop
        ),

      dailyStarted:
        Number(
          ceo?.daily?.started ||
          0
        ),

      dailyCompleted:
        Number(
          ceo?.daily?.completed ||
          0
        ),

      targetReached:
        Boolean(
          ceo?.daily?.targetReached
        ),

      overTarget:
        Number(
          ceo?.daily?.overTarget ||
          0
        )
    }
  };
}

/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
*/

export default {

  runScheduledRegion,

  runScheduledAutomation,

  previewScheduledAutomation,

  emergencyStopAutomation,

  getScheduledRunnerStatus
};