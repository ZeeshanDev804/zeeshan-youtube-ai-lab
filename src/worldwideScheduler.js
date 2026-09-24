import "dotenv/config";

import {
  canStartAutomation,
  reserveDailySlot,
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

const DAILY_TARGET_VIDEOS = 5;

const SCHEDULE_WINDOW_MINUTES = 15;

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
  }
});


function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}


function getLocalParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat(
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
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day),
    hour: Number(result.hour),
    minute: Number(result.minute),
    second: Number(result.second)
  };
}


function getCurrentScheduleSlot(
  region,
  date = new Date()
) {
  const config = REGIONS[region];

  if (!config) {
    return null;
  }

  const local = getLocalParts(
    config.timezone,
    date
  );

  let selectedHour = null;
  let selectedMinute = null;

  for (const hour of config.hours) {
    const difference =
      (local.hour - hour) * 60 +
      local.minute;

    if (
      difference >= 0 &&
      difference < SCHEDULE_WINDOW_MINUTES
    ) {
      selectedHour = hour;
      selectedMinute = local.minute;

      break;
    }
  }

  if (selectedHour === null) {
    return null;
  }

  return {
    region,

    timezone:
      config.timezone,

    localDate:
      `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`,

    scheduledHour:
      selectedHour,

    currentMinute:
      selectedMinute,

    scheduleSlotId:
      `${region}-${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}-${String(selectedHour).padStart(2, "0")}`,

    reservationKey:
      `schedule:${region}:${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}-${String(selectedHour).padStart(2, "0")}`
  };
}


/*
|--------------------------------------------------------------------------
| SCHEDULE EVALUATION
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| DAILY_TARGET_VIDEOS = 5 is ONLY a target.
|
| It does NOT stop automation after 5.
|
| Example:
|
| 2 good topics  -> system may publish 2
| 5 good topics  -> system may publish 5
| 8 good topics  -> system may continue beyond 5
|
| Quality, safety, copyright, duplicate and CEO gates
| still control every individual video.
|--------------------------------------------------------------------------
*/

export async function evaluateSchedule({
  region,
  date = new Date(),
  requestedVideos = 1
} = {}) {

  const normalizedRegion =
    cleanText(region)
      .toUpperCase();

  if (!REGIONS[normalizedRegion]) {
    return {
      allowed: false,

      status:
        "INVALID_REGION",

      region:
        normalizedRegion
    };
  }


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


  const startCheck =
    await canStartAutomation({
      requestedVideos
    });


  if (!startCheck.allowed) {
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

    scheduleSlotId:
      slot.scheduleSlotId,

    reservationKey:
      slot.reservationKey,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    startedToday:
      startCheck.startedToday,

    targetReached:
      Boolean(
        startCheck.targetReached
      ),

    overTarget:
      Number(
        startCheck.overTarget || 0
      ),

    /*
     * TRUE means the system is allowed
     * to continue beyond 5 if more
     * genuinely good topics are available.
     */

    canContinueBeyondTarget:
      true
  };
}


/*
|--------------------------------------------------------------------------
| RESERVE SCHEDULED RUN
|--------------------------------------------------------------------------
|
| This protects the SAME schedule slot
| from being executed twice.
|
| It is NOT a 5-video limit.
|--------------------------------------------------------------------------
*/

export async function reserveScheduledRun({
  region,
  runId = null,
  date = new Date()
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


  if (!evaluation.allowed) {
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

    canContinueBeyondTarget:
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
    const region of Object.keys(
      REGIONS
    )
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
      ceoStatus.daily?.started || 0
    );


  return {
    success: true,

    scheduler:
      "WORLDWIDE",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    /*
     * No hard maximum.
     */

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
        ceoStatus.emergencyStop
    }
  };
}


/*
|--------------------------------------------------------------------------
| SCHEDULE CONFIG
|--------------------------------------------------------------------------
*/

export function getSchedulerConfig() {

  return {
    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

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
| HELPERS
|--------------------------------------------------------------------------
*/

export function getSupportedRegions() {
  return Object.keys(
    REGIONS
  );
}


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


export function getRegionConfig(
  region
) {
  const normalized =
    cleanText(region)
      .toUpperCase();

  return (
    REGIONS[normalized] ||
    null
  );
}


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