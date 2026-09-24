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

const REGIONS = [
  "USA",
  "UK",
  "EUROPE"
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


  if (
    status.emergencyStop
  ) {
    return {
      allowed: false,

      status:
        "EMERGENCY_STOP",

      reason:
        status.emergencyStopReason ||
        "CEO emergency stop is active."
    };
  }


  if (
    status.mode ===
    "STOP"
  ) {
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
   * Check scheduler window.
   */

  const evaluation =
    await evaluateSchedule({
      region:
        normalizedRegion,

      requestedVideos,

      date
    });


  if (
    !evaluation.allowed
  ) {
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
   * IMPORTANT:
   *
   * This is NOT a daily 5-video limit.
   *
   * The reservation protects only
   * this exact schedule slot.
   */

  const runId =
    createRunId(
      normalizedRegion
    );


  const reservation =
    await reserveScheduledRun({
      region:
        normalizedRegion,

      runId,

      date
    });


  if (
    !reservation.success
  ) {
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
        evaluation.scheduleSlotId
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
        reservation.scheduleSlotId,

      reservationKey:
        reservation.reservationKey,

      skipped:
        true,

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
            evaluation.scheduleSlotId,

          reservationKey:
            evaluation.reservationKey,

          dailyTarget:
            DAILY_TARGET_VIDEOS
        }
      });


    /*
     * Final CEO check immediately
     * before running the automation.
     */

    const finalCEOCheck =
      await checkCEOState();


    if (
      !finalCEOCheck.allowed
    ) {

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
     * Check automation start gate.
     *
     * There is NO hard daily maximum.
     */

    const startCheck =
      await canStartAutomation({
        requestedVideos
      });


    if (
      !startCheck.allowed
    ) {

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
     * Run the actual automation cycle.
     *
     * The orchestrator itself decides
     * whether a topic is safe/good enough.
     */

    const result =
      await runAutomationCycle({
        region:
          normalizedRegion,

        runId
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
        evaluation.scheduleSlotId,

      reservationKey:
        evaluation.reservationKey,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      /*
       * Target is informational only.
       */

      targetIsHardMaximum:
        false,

      canContinueBeyondTarget:
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
        // Do not hide the original error.
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


  return {
    success:
      results.some(
        (item) =>
          item.success
      ),

    status:
      "SCHEDULED_AUTOMATION_COMPLETE",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    targetIsHardMaximum:
      false,

    canContinueBeyondTarget:
      true,

    results
  };
}


/*
|--------------------------------------------------------------------------
| PREVIEW
|--------------------------------------------------------------------------
|
| Preview does not generate/publish content.
|--------------------------------------------------------------------------
*/

export async function previewScheduledAutomation({
  date = new Date()
} = {}) {

  const previews = [];


  for (
    const region of REGIONS
  ) {

    const evaluation =
      await evaluateSchedule({
        region,

        date
      });


    previews.push({
      region,

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