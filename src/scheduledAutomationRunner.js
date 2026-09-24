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
  startReliabilityJob,
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


  if (status.emergencyStop) {

    return {
      allowed: false,

      status:
        "EMERGENCY_STOP",

      reason:
        status.emergencyStopReason ||
        "CEO emergency stop is active."
    };
  }


  if (status.mode === "STOP") {

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
      status.mode
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

      requestedVideos,

      date
    });


  if (!evaluation.allowed) {

    return {
      success: false,

      status:
        evaluation.status,

      reason:
        evaluation.reason ||
        null,

      region:
        normalizedRegion,

      scheduleSlotId:
        evaluation.scheduleSlotId ||
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


  if (!reservation.success) {

    return {
      success: false,

      status:
        reservation.status,

      reason:
        reservation.reason ||
        null,

      region:
        normalizedRegion,

      scheduleSlotId:
        reservation.scheduleSlotId ||
        evaluation.scheduleSlotId,

      reservationKey:
        reservation.reservationKey ||
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
        evaluation.scheduleSlotId,

      reservationKey:
        reservation.reservationKey ||
        null,

      skipped: true,

      reason:
        "This schedule slot was already reserved."
    };
  }


  /*
   * Start reliability tracking.
   */

  let reliabilityJob = null;


  try {

    reliabilityJob =
      await startReliabilityJob({

        jobType:
          "scheduled-automation",

        runId,

        metadata: {

          region:
            normalizedRegion,

          scheduleSlotId:
            reservation.scheduleSlotId ||
            evaluation.scheduleSlotId,

          reservationKey:
            reservation.reservationKey ||
            evaluation.reservationKey ||
            null,

          dailyTarget:
            DAILY_TARGET_VIDEOS,

          targetIsHardMaximum:
            false
        }
      });


    /*
     * Final CEO safety check immediately
     * before automation starts.
     */

    const finalCEOCheck =
      await checkCEOState();


    if (!finalCEOCheck.allowed) {

      if (reliabilityJob) {

        await failReliabilityJob({

          jobId:
            reliabilityJob.jobId,

          error:
            finalCEOCheck.reason ||
            finalCEOCheck.status
        });
      }


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
        requestedVideos
      });


    if (!startCheck.allowed) {

      if (reliabilityJob) {

        await failReliabilityJob({

          jobId:
            reliabilityJob.jobId,

          error:
            startCheck.reason ||
            startCheck.status
        });
      }


      return {

        success: false,

        status:
          startCheck.status,

        reason:
          startCheck.reason,

        region:
          normalizedRegion,

        runId
      };
    }


    /*
     * Run actual automation cycle.
     *
     * The orchestrator decides whether
     * the topic is good, original and safe.
     */

    const result =
      await runAutomationCycle({

        region:
          normalizedRegion,

        runId,

        requestedVideos
      });


    /*
     * Complete reliability tracking.
     */

    if (reliabilityJob) {

      await completeReliabilityJob({

        jobId:
          reliabilityJob.jobId,

        result
      });
    }


    return {

      success: true,

      status:
        "SCHEDULED_AUTOMATION_COMPLETED",

      region:
        normalizedRegion,

      runId,

      scheduleSlotId:
        reservation.scheduleSlotId ||
        evaluation.scheduleSlotId,

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

    if (reliabilityJob) {

      try {

        await failReliabilityJob({

          jobId:
            reliabilityJob.jobId,

          error:
            error?.message ||
            String(error)
        });

      } catch {
        /*
         * Do not hide original error.
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

  const results = [];


  for (
    const region of REGIONS
  ) {

    const result =
      await runScheduledRegion({

        region,

        requestedVideos,

        date
      });


    results.push(
      result
    );
  }


  const successfulRuns =
    results.filter(
      item =>
        item.success
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
        evaluation.allowed,

      status:
        evaluation.status,

      reason:
        evaluation.reason ||
        null,

      scheduleSlotId:
        evaluation.scheduleSlotId ||
        null,

      reservationKey:
        evaluation.reservationKey ||
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
        ceo.mode,

      emergencyStop:
        ceo.emergencyStop,

      dailyStarted:
        ceo.daily?.started || 0,

      dailyCompleted:
        ceo.daily?.completed || 0,

      targetReached:
        Boolean(
          ceo.daily?.targetReached
        ),

      overTarget:
        Number(
          ceo.daily?.overTarget || 0
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