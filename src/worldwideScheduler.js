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

function normalizeRegion(region) {
  return cleanText(region).toUpperCase();
}

function getLocalParts(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

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

/*
|--------------------------------------------------------------------------
| CURRENT SCHEDULE SLOT
|--------------------------------------------------------------------------
|
| A slot is active only during the first 15 minutes
| of the configured local hour.
|
| Example:
|
| 09:00 - 09:14 = active
| 09:15 onwards = outside slot
|
| This prevents repeated execution during the same
| GitHub Actions 15-minute cycle.
|--------------------------------------------------------------------------
*/

function getCurrentScheduleSlot(region, date = new Date()) {
  const normalizedRegion = normalizeRegion(region);
  const config = REGIONS[normalizedRegion];

  if (!config) {
    return null;
  }

  const local = getLocalParts(config.timezone, date);

  let selectedHour = null;

  for (const hour of config.hours) {
    if (
      local.hour === hour &&
      local.minute >= 0 &&
      local.minute < SCHEDULE_WINDOW_MINUTES
    ) {
      selectedHour = hour;
      break;
    }
  }

  if (selectedHour === null) {
    return null;
  }

  const localDate =
    `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;

  const scheduleSlotId =
    `${normalizedRegion}-${localDate}-${String(selectedHour).padStart(2, "0")}`;

  const reservationKey =
    `schedule:${normalizedRegion}:${localDate}-${String(selectedHour).padStart(2, "0")}`;

  return {
    region: normalizedRegion,

    timezone: config.timezone,

    localDate,

    scheduledHour: selectedHour,

    currentMinute: local.minute,

    scheduleSlotId,

    reservationKey
  };
}

/*
|--------------------------------------------------------------------------
| SCHEDULE EVALUATION
|--------------------------------------------------------------------------
*/

export async function evaluateSchedule({
  region,
  date = new Date(),
  requestedVideos = 1
} = {}) {
  const normalizedRegion = normalizeRegion(region);

  if (!REGIONS[normalizedRegion]) {
    return {
      allowed: false,
      skipped: false,
      status: "INVALID_REGION",
      region: normalizedRegion
    };
  }

  /*
   * CEO emergency / STOP check.
   */

  const ceoStatus = await getCEOAutomationStatus();

  if (ceoStatus.emergencyStop) {
    return {
      allowed: false,
      skipped: false,
      status: "EMERGENCY_STOP",
      reason:
        ceoStatus.emergencyStopReason ||
        "CEO emergency stop is active.",
      region: normalizedRegion
    };
  }

  if (ceoStatus.mode === "STOP") {
    return {
      allowed: false,
      skipped: false,
      status: "CEO_STOP",
      reason: "CEO automation mode is STOP.",
      region: normalizedRegion
    };
  }

  /*
   * Check regional schedule.
   */

  const slot = getCurrentScheduleSlot(
    normalizedRegion,
    date
  );

  /*
   * IMPORTANT:
   *
   * Outside the schedule is a NORMAL SKIP.
   * It is NOT an automation failure.
   *
   * This prevents GitHub Actions from showing
   * exit code 1 simply because this region is
   * waiting for its next scheduled time.
   */

  if (!slot) {
    return {
      allowed: false,

      skipped: true,

      status: "OUTSIDE_SCHEDULE_WINDOW",

      reason:
        "Region is currently outside its scheduled automation window.",

      region: normalizedRegion,

      timezone:
        REGIONS[normalizedRegion].timezone,

      scheduleHours:
        REGIONS[normalizedRegion].hours,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      hardDailyMaximum: false,

      canContinueBeyondTarget: true,

      qualityOverQuantity: true
    };
  }

  /*
   * Check CEO automation start gate.
   *
   * This is NOT a hard daily maximum.
   */

  const startCheck = await canStartAutomation({
    requestedVideos
  });

  if (!startCheck.allowed) {
    return {
      allowed: false,

      skipped: false,

      status: startCheck.status,

      reason: startCheck.reason,

      region: normalizedRegion,

      scheduleSlotId: slot.scheduleSlotId,

      reservationKey: slot.reservationKey,

      dailyTarget: DAILY_TARGET_VIDEOS,

      hardDailyMaximum: false,

      canContinueBeyondTarget: true,

      qualityOverQuantity: true
    };
  }

  return {
    allowed: true,

    skipped: false,

    status: "SCHEDULE_READY",

    region: normalizedRegion,

    timezone: slot.timezone,

    localDate: slot.localDate,

    scheduledHour: slot.scheduledHour,

    currentMinute: slot.currentMinute,

    scheduleSlotId: slot.scheduleSlotId,

    reservationKey: slot.reservationKey,

    dailyTarget: DAILY_TARGET_VIDEOS,

    startedToday: Number(
      startCheck.startedToday || 0
    ),

    targetReached: Boolean(
      startCheck.targetReached
    ),

    overTarget: Number(
      startCheck.overTarget || 0
    ),

    /*
     * 5 is a TARGET, NOT a hard maximum.
     */

    hardDailyMaximum: false,

    maximumVideosPerDay: null,

    canContinueBeyondTarget: true,

    qualityOverQuantity: true
  };
}

/*
|--------------------------------------------------------------------------
| RESERVE SCHEDULED RUN
|--------------------------------------------------------------------------
|
| Prevents the same regional schedule slot
| from being executed twice.
|
| This is NOT a 5-video daily limit.
|--------------------------------------------------------------------------
*/

export async function reserveScheduledRun({
  region,
  runId = null,
  date = new Date()
} = {}) {
  const normalizedRegion = normalizeRegion(region);

  const evaluation = await evaluateSchedule({
    region: normalizedRegion,
    date
  });

  /*
   * Normal outside-window result.
   *
   * Do not convert this into an error.
   */

  if (
    evaluation.status ===
    "OUTSIDE_SCHEDULE_WINDOW"
  ) {
    return {
      ...evaluation,

      success: true,

      skipped: true
    };
  }

  if (!evaluation.allowed) {
    return {
      ...evaluation,

      success: false,

      skipped: false
    };
  }

  const reservation = await reserveDailySlot({
    reservationKey: evaluation.reservationKey,

    region: normalizedRegion,

    runId:
      runId ||
      `scheduled-${Date.now()}`
  });

  /*
   * If the slot was already reserved,
   * report it as a safe skip instead of
   * treating it as a system crash.
   */

  if (
    reservation?.status ===
      "ALREADY_RESERVED" ||
    reservation?.status ===
      "ALREADY_RUN" ||
    reservation?.reserved === false
  ) {
    return {
      ...reservation,

      success: true,

      skipped: true,

      region: normalizedRegion,

      scheduleSlotId:
        evaluation.scheduleSlotId,

      reservationKey:
        evaluation.reservationKey,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      hardDailyMaximum: false,

      maximumVideosPerDay: null,

      canContinueBeyondTarget: true,

      qualityOverQuantity: true
    };
  }

  return {
    ...reservation,

    success:
      reservation?.success !== false,

    skipped: false,

    region: normalizedRegion,

    scheduleSlotId:
      evaluation.scheduleSlotId,

    reservationKey:
      evaluation.reservationKey,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum: false,

    maximumVideosPerDay: null,

    canContinueBeyondTarget: true,

    qualityOverQuantity: true
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

  for (const region of Object.keys(REGIONS)) {
    const config = REGIONS[region];

    const local = getLocalParts(
      config.timezone
    );

    const localTime =
      `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;

    const localDate =
      `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;

    const currentSlot =
      getCurrentScheduleSlot(region);

    regions[region] = {
      timezone: config.timezone,

      localTime,

      localDate,

      scheduleHours: config.hours,

      scheduleWindowMinutes:
        SCHEDULE_WINDOW_MINUTES,

      scheduleActive:
        Boolean(currentSlot),

      currentScheduleSlot:
        currentSlot?.scheduleSlotId ||
        null
    };
  }

  const startedToday =
    Number(
      ceoStatus.daily?.started || 0
    );

  return {
    success: true,

    scheduler: "WORLDWIDE",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum: false,

    maximumVideosPerDay: null,

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

    canContinueBeyondTarget: true,

    qualityOverQuantity: true,

    regions,

    ceo: {
      mode: ceoStatus.mode,

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
    scheduler: "WORLDWIDE",

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum: false,

    maximumVideosPerDay: null,

    scheduleWindowMinutes:
      SCHEDULE_WINDOW_MINUTES,

    continueBeyondTarget: true,

    qualityOverQuantity: true,

    qualityOverQuantityPolicy:
      "Only strong, safe and non-repetitive topics may continue beyond the daily target.",

    regions: REGIONS
  };
}

/*
|--------------------------------------------------------------------------
| SUPPORTED REGIONS
|--------------------------------------------------------------------------
*/

export function getSupportedRegions() {
  return Object.keys(REGIONS);
}

/*
|--------------------------------------------------------------------------
| CHECK SUPPORTED REGION
|--------------------------------------------------------------------------
*/

export function isSupportedRegion(region) {
  return Boolean(
    REGIONS[
      normalizeRegion(region)
    ]
  );
}

/*
|--------------------------------------------------------------------------
| GET REGION CONFIG
|--------------------------------------------------------------------------
*/

export function getRegionConfig(region) {
  return (
    REGIONS[
      normalizeRegion(region)
    ] || null
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