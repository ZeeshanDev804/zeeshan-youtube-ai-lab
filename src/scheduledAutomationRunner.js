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


/*
|--------------------------------------------------------------------------
| SUPPORTED REGIONS
|--------------------------------------------------------------------------
|
| Daily target = 5
| This is NOT a hard maximum.
|
| Strong/safe topics can continue beyond 5.
|
|--------------------------------------------------------------------------
*/

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

      status:
        "EMERGENCY_STOP",

      reason:
        status.emergencyStopReason ||
        "CEO emergency stop is active."
    };
  }


  if (status?.mode === "STOP") {

    return {
      allowed: false,

      status:
        "CEO_STOP",

      reason:
        "CEO automation mode is STOP."
    };
  }


  return {
    allowed: true,

    status:
      "CEO_READY",

    mode:
      status?.mode || "AUTO"
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
    cleanText(region)
      .toUpperCase();


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

      status:
        "INVALID_REGION",

      region:
        normalizedRegion
    };
  }


  /*
   * Normalize requested videos.
   *
   * 5 is the normal daily target.
   * It is NOT a hard maximum.
   */

  const normalizedRequestedVideos =
    Math.max(
      1,
      Math.min(
        50,
        Math.floor(
          Number(requestedVideos) || 1
        )
      )
    );


  /*
   * First CEO safety check.
   */

  const ceo =
    await checkCEOState();


  if (!ceo.allowed) {

    return {
      success: false,

      status:
        ceo.status,

      reason:
        ceo.reason,

      region:
        normalizedRegion
    };
  }


  /*
   * Check worldwide scheduler window.
   */

  const evaluation =
    await evaluateSchedule({
      region:
        normalizedRegion,

      requestedVideos:
        normalizedRequestedVideos,

      date
    });


  if (!evaluation?.allowed) {

    return {
      success: false,

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
   * Reserve this exact schedule slot.
   *
   * This does NOT create a daily video limit.
   * It only prevents the same schedule slot
   * from running twice.
   */

  const reservation =
    await reserveScheduledRun({
      region:
        normalizedRegion,

      runId,

      date
    });


  if (!reservation?.success) {

    return {
      success: false,

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
   */

  if (
    reservation.status ===
    "ALREADY_RESERVED"
  ) {

    return {
      success: true,

      status:
        "SLOT_ALREADY_RESERVED",

      region:
        normalizedRegion,

      scheduleSlotId:
        reservation.scheduleSlotId ||
        evaluation.scheduleSlotId ||
        null,

      reservationKey:
        reservation.reservationKey ||
        evaluation.reservationKey ||
        null,

      skipped: true,

      reason:
        "This schedule slot was already reserved."
    };
  }


  /*
   * Reliability tracking.
   *
   * IMPORTANT:
   * Current automationReliability.js uses
   * createReliabilityJob() and runId.
   */

  let reliabilityJob =
    null;


  try {

    reliabilityJob =
      await createReliabilityJob({

        runId,

        topic:
          `Scheduled automation - ${normalizedRegion}`,

        stage:
          "SCHEDULED_AUTOMATION"
      });


    /*
     * If the job already exists,
     * the same persistent job is reused.
     */

    const reliabilityRunId =
      reliabilityJob?.job?.runId ||
      runId;


    /*
     * Store scheduler metadata in the
     * reliability job.
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
          reservation.scheduleSlotId ||
          evaluation.scheduleSlotId ||
          null,

        reservationKey:
          reservation.reservationKey ||
          evaluation.reservationKey ||
          null,

        dailyTarget:
          DAILY_TARGET_VIDEOS,

        targetIsHardMaximum:
          false
      };
    }


    /*
     * Final CEO safety check immediately
     * before automation starts.
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
     * There is NO hard daily maximum.
     *
     * The target of 5 is informational.
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
     * Run actual automation cycle.
     *
     * The orchestrator decides whether
     * topics are good, original and safe.
     */

    const result =
      await runAutomationCycle({

        region:
          normalizedRegion,

        runId,

        requestedVideos:
          normalizedRequestedVideos
      });


    /*
     * Determine whether the automation cycle
     * itself completed successfully.
     */

    const automationSucceeded =
      result?.success !== false;


    if (automationSucceeded) {

      await completeReliabilityJob({

        runId:
          reliabilityRunId,

        metadata: {

          region:
            normalizedRegion,

          scheduleSlotId:
            reservation.scheduleSlotId ||
            evaluation.scheduleSlotId ||
            null,

          reservationKey:
            reservation.reservationKey ||
            evaluation.reservationKey ||
            null,

          requestedVideos:
            normalizedRequestedVideos,

          resultStatus:
            result?.status ||
            null,

          produced:
            Number(
              result?.counts?.produced || 0
            ),

          ready:
            Number(
              result?.counts?.ready || 0
            ),

          review:
            Number(
              result?.counts?.review || 0
            ),

          blocked:
            Number(
              result?.counts?.blocked || 0
            ),

          failed:
            Number(
              result?.counts?.failed || 0
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

      status:
        automationSucceeded
          ? "SCHEDULED_AUTOMATION_COMPLETED"
          : "SCHEDULED_AUTOMATION_FAILED",

      region:
        normalizedRegion,

      runId,

      scheduleSlotId:
        reservation.scheduleSlotId ||
        evaluation.scheduleSlotId ||
        null,

      reservationKey:
        reservation.reservationKey ||
        evaluation.reservationKey ||
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
     * Never allow a reliability failure
     * to hide the original automation error.
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
        /*
         * Keep original error.
         */
      }
    }


    return {

      success: false,

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
    Math.max(
      1,
      Math.min(
        50,
        Math.floor(
          Number(requestedVideos) || 1
        )
      )
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


    results.push(
      result
    );
  }


  const successfulRuns =
    results.filter(
      (item) =>
        item?.success
    );


  const skippedRuns =
    results.filter(
      (item) =>
        item?.status ===
        "SLOT_ALREADY_RESERVED"
    );


  return {

    success:
      successfulRuns.length > 0,

    status:
      "SCHEDULED_AUTOMATION_COMPLETE",

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

    results
  };
}


/*
|--------------------------------------------------------------------------
| PREVIEW
|--------------------------------------------------------------------------
|
| Preview does NOT generate or publish content.
|
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
          ceo?.daily?.started || 0
        ),

      dailyCompleted:
        Number(
          ceo?.daily?.completed || 0
        ),

      targetReached:
        Boolean(
          ceo?.daily?.targetReached
        ),

      overTarget:
        Number(
          ceo?.daily?.overTarget || 0
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