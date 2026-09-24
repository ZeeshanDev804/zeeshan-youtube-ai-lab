import "dotenv/config";

import {
  canStartAutomation,
  reserveDailySlot,
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";


const DAILY_TARGET_VIDEOS = 5;

const SCHEDULE_WINDOW_MINUTES = 15;


/*
|--------------------------------------------------------------------------
| WORLDWIDE REGIONS
|--------------------------------------------------------------------------
|
| 5 videos = daily target only.
| It is NOT a hard maximum.
|
| Strong and safe topics can continue beyond 5.
|--------------------------------------------------------------------------
*/

const REGIONS = Object.freeze({

  USA: {
    timezone: "America/New_York",
    hours: [9, 13, 18]
  },

  UK: {
    timezone: "Europe/London",
    hours: [9, 13, 18]
  },

  EUROPE: {
    timezone: "Europe/Paris",
    hours: [9, 13, 18]
  },

  MIDDLE_EAST: {
    timezone: "Asia/Dubai",
    hours: [9, 13, 18]
  }

});


function cleanText(value = "") {

  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}


/*
|--------------------------------------------------------------------------
| GET LOCAL TIME PARTS
|--------------------------------------------------------------------------
*/

function getLocalParts(
  timezone,
  date = new Date()
) {

  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: timezone,

        year: "numeric",
        month: "2-digit",
        day: "2-digit",

        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",

        hourCycle: "h23"
      }
    ).formatToParts(date);


  const result = {};


  for (const part of parts) {

    if (
      part.type !== "literal"
    ) {

      result[part.type] =
        part.value;
    }
  }


  return {

    year:
      Number(result.year),

    month:
      Number(result.month),

    day:
      Number(result.day),

    hour:
      Number(result.hour),

    minute:
      Number(result.minute),

    second:
      Number(result.second)

  };
}


/*
|--------------------------------------------------------------------------
| CURRENT SCHEDULE SLOT
|--------------------------------------------------------------------------
*/

function getCurrentScheduleSlot(
  region,
  date = new Date()
) {

  const config =
    REGIONS[region];


  if (!config) {
    return null;
  }


  const local =
    getLocalParts(
      config.timezone,
      date
    );


  let selectedHour = null;


  for (
    const hour of config.hours
  ) {

    const difference =
      (
        local.hour -
        hour
      ) * 60 +
      local.minute;


    if (
      difference >= 0 &&
      difference < SCHEDULE_WINDOW_MINUTES
    ) {

      selectedHour =
        hour;

      break;
    }
  }


  if (
    selectedHour === null
  ) {

    return null;
  }


  const localDate =
    `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;


  const scheduleSlotId =
    `${region}-${localDate}-${String(selectedHour).padStart(2, "0")}`;


  const reservationKey =
    `schedule:${region}:${localDate}-${String(selectedHour).padStart(2, "0")}`;


  return {

    region,

    timezone:
      config.timezone,

    localDate,

    scheduledHour:
      selectedHour,

    currentMinute:
      local.minute,

    scheduleSlotId,

    reservationKey

  };
}


/*
|--------------------------------------------------------------------------
| SCHEDULE EVALUATION
|--------------------------------------------------------------------------
|
| Daily target = 5.
|
| NOT a hard maximum.
|
| Examples:
|
| 2 good topics -> 2
| 5 good topics -> 5
| 8 good topics -> 8
|
| Weak/risky topics must never be generated
| only to reach the target.
|--------------------------------------------------------------------------
*/

export async function evaluateSchedule({

  region,

  date =
    new Date(),

  requestedVideos =
    1

} = {}) {


  const normalizedRegion =
    cleanText(region)
      .toUpperCase();


  if (
    !REGIONS[
      normalizedRegion
    ]
  ) {

    return {

      allowed: false,

      status:
        "INVALID_REGION",

      region:
        normalizedRegion

    };
  }


  /*
   * CEO status check.
   */

  const ceoStatus =
    await getCEOAutomationStatus();


  if (
    ceoStatus.emergencyStop
  ) {

    return {

      allowed: false,

      status:
        "EMERGENCY_STOP",

      reason:
        ceoStatus.emergencyStopReason ||
        "CEO emergency stop is active.",

      region:
        normalizedRegion

    };
  }


  if (
    ceoStatus.mode ===
    "STOP"
  ) {

    return {

      allowed: false,

      status:
        "CEO_STOP",

      reason:
        "CEO automation mode is STOP.",

      region:
        normalizedRegion

    };
  }


  /*
   * Check regional time window.
   */

  const slot =
    getCurrentScheduleSlot(
      normalizedRegion,
      date
    );


  if (!slot) {

    return {

      allowed: false,

      status:
        "OUTSIDE_SCHEDULE_WINDOW",

      region:
        normalizedRegion,

      timezone:
        REGIONS[
          normalizedRegion
        ].timezone,

      scheduleHours:
        REGIONS[
          normalizedRegion
        ].hours

    };
  }


  /*
   * Check automation start gate.
   *
   * This must not become a hard
   * daily maximum.
   */

  const startCheck =
    await canStartAutomation({

      requestedVideos

    });


  if (
    !startCheck.allowed
  ) {

    return {

      allowed: false,

      status:
        startCheck.status,

      reason:
        startCheck.reason,

      region:
        normalizedRegion,

      scheduleSlotId:
        slot.scheduleSlotId,

      reservationKey:
        slot.reservationKey

    };
  }


  return {

    allowed: true,

    status:
      "SCHEDULE_READY",

    region:
      normalizedRegion,

    timezone:
      slot.timezone,

    localDate:
      slot.localDate,

    scheduledHour:
      slot.scheduledHour,

    currentMinute:
      slot.currentMinute,

    scheduleSlotId:
      slot.scheduleSlotId,

    reservationKey:
      slot.reservationKey,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    startedToday:
      Number(
        startCheck.startedToday ||
        0
      ),

    targetReached:
      Boolean(
        startCheck.targetReached
      ),

    overTarget:
      Number(
        startCheck.overTarget ||
        0
      ),

    /*
     * IMPORTANT:
     *
     * 5 is only the target.
     */

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true

  };
}


/*
|--------------------------------------------------------------------------
| RESERVE SCHEDULED RUN
|--------------------------------------------------------------------------
|
| Prevents the SAME schedule slot from
| running twice.
|
| This is NOT a daily 5-video limit.
|--------------------------------------------------------------------------
*/

export async function reserveScheduledRun({

  region,

  runId =
    null,

  date =
    new Date()

} = {}) {


  const normalizedRegion =
    cleanText(region)
      .toUpperCase();


  const evaluation =
    await evaluateSchedule({

      region:
        normalizedRegion,

      date

    });


  if (
    !evaluation.allowed
  ) {

    return evaluation;
  }


  const reservation =
    await reserveDailySlot({

      reservationKey:
        evaluation.reservationKey,

      region:
        normalizedRegion,

      runId:
        runId ||
        `scheduled-${Date.now()}`

    });


  return {

    ...reservation,

    region:
      normalizedRegion,

    scheduleSlotId:
      evaluation.scheduleSlotId,

    reservationKey:
      evaluation.reservationKey,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true

  };
}


/*
|--------------------------------------------------------------------------
| GET SCHEDULER STATUS
|--------------------------------------------------------------------------
*/

export async function getSchedulerStatus() {

  const ceoStatus =
    await getCEOAutomationStatus();


  const regions = {};


  for (
    const region
      of Object.keys(REGIONS)
  ) {

    const config =
      REGIONS[region];


    const local =
      getLocalParts(
        config.timezone
      );


    regions[region] = {

      timezone:
        config.timezone,

      localTime:
        `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`,

      localDate:
        `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,

      scheduleHours:
        config.hours

    };
  }


  const startedToday =
    Number(
      ceoStatus.daily?.started ||
      0
    );


  return {

    success: true,

    scheduler:
      "WORLDWIDE",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    maximumVideosPerDay:
      null,

    startedToday,

    targetReached:
      startedToday >=
      DAILY_TARGET_VIDEOS,

    overTarget:
      Math.max(
        0,

        startedToday -
        DAILY_TARGET_VIDEOS
      ),

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    regions,

    ceo: {

      mode:
        ceoStatus.mode,

      emergencyStop:
        ceoStatus.emergencyStop,

      emergencyStopReason:
        ceoStatus.emergencyStopReason ||
        null

    }

  };
}


/*
|--------------------------------------------------------------------------
| SCHEDULER CONFIG
|--------------------------------------------------------------------------
*/

export function getSchedulerConfig() {

  return {

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    maximumVideosPerDay:
      null,

    scheduleWindowMinutes:
      SCHEDULE_WINDOW_MINUTES,

    continueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    regions:
      REGIONS

  };
}


/*
|--------------------------------------------------------------------------
| SUPPORTED REGIONS
|--------------------------------------------------------------------------
*/

export function getSupportedRegions() {

  return Object.keys(
    REGIONS
  );
}


/*
|--------------------------------------------------------------------------
| CHECK SUPPORTED REGION
|--------------------------------------------------------------------------
*/

export function isSupportedRegion(
  region
) {

  return Boolean(

    REGIONS[
      cleanText(region)
        .toUpperCase()
    ]

  );
}


/*
|--------------------------------------------------------------------------
| GET REGION CONFIG
|--------------------------------------------------------------------------
*/

export function getRegionConfig(
  region
) {

  const normalized =
    cleanText(region)
      .toUpperCase();


  return (

    REGIONS[
      normalized
    ] ||

    null

  );
}


/*
|--------------------------------------------------------------------------
| GET CURRENT SLOT
|--------------------------------------------------------------------------
*/

export {
  getCurrentScheduleSlot
};


/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
*/

export default {

  evaluateSchedule,

  reserveScheduledRun,

  getSchedulerStatus,

  getSchedulerConfig,

  getSupportedRegions,

  isSupportedRegion,

  getRegionConfig,

  getCurrentScheduleSlot

};