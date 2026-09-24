import "dotenv/config";

import {
  canStartAutomation,
  reserveDailySlot,
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";


const MAX_DAILY_VIDEOS = 5;

const SCHEDULE_WINDOW_MINUTES = 15;

const DEFAULT_SCHEDULE = [
  {
    region: "USA",
    timezone: "America/New_York",
    hours: [9, 13, 18]
  },
  {
    region: "UK",
    timezone: "Europe/London",
    hours: [9, 13, 18]
  },
  {
    region: "EUROPE",
    timezone: "Europe/Paris",
    hours: [9, 13, 18]
  }
];


function normalizeRegion(region = "") {
  return String(region)
    .trim()
    .toUpperCase();
}


function getScheduleForRegion(region) {
  const normalizedRegion =
    normalizeRegion(region);

  return DEFAULT_SCHEDULE.find(
    (entry) =>
      entry.region ===
      normalizedRegion
  );
}


function getLocalParts(
  timezone,
  date = new Date()
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour12: false
      }
    );

  const parts =
    formatter.formatToParts(date);

  const result = {};

  for (const part of parts) {
    if (
      part.type !==
      "literal"
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

    weekday:
      result.weekday
  };
}


function getScheduleDifference(
  hour,
  minute,
  scheduledHour
) {
  const currentMinutes =
    hour * 60 +
    minute;

  const scheduledMinutes =
    scheduledHour * 60;

  return Math.abs(
    currentMinutes -
    scheduledMinutes
  );
}


function isScheduledHour(
  hour,
  minute,
  scheduleHours
) {
  if (
    !Array.isArray(
      scheduleHours
    ) ||
    scheduleHours.length === 0
  ) {
    return false;
  }

  return scheduleHours.some(
    (scheduledHour) =>
      getScheduleDifference(
        hour,
        minute,
        scheduledHour
      ) <
      SCHEDULE_WINDOW_MINUTES
  );
}


function getCurrentScheduleSlot(
  hour,
  minute,
  scheduleHours
) {
  if (
    !Array.isArray(
      scheduleHours
    )
  ) {
    return null;
  }

  let closestSlot = null;

  let closestDifference =
    Infinity;

  for (
    const scheduledHour
    of scheduleHours
  ) {
    const difference =
      getScheduleDifference(
        hour,
        minute,
        scheduledHour
      );

    if (
      difference <
      SCHEDULE_WINDOW_MINUTES &&
      difference <
      closestDifference
    ) {
      closestDifference =
        difference;

      closestSlot =
        scheduledHour;
    }
  }

  return closestSlot;
}


function createScheduleSlotId(
  region,
  local,
  scheduledHour
) {
  return [
    normalizeRegion(region),
    local.year,
    String(local.month)
      .padStart(2, "0"),
    String(local.day)
      .padStart(2, "0"),
    String(scheduledHour)
      .padStart(2, "0")
  ].join(":");
}


export function getWorldwideSchedule() {
  return DEFAULT_SCHEDULE.map(
    (item) => ({
      region:
        item.region,

      timezone:
        item.timezone,

      hours: [
        ...item.hours
      ],

      windowMinutes:
        SCHEDULE_WINDOW_MINUTES,

      maximumDailyVideos:
        MAX_DAILY_VIDEOS
    })
  );
}


export function getRegionalTime(
  region,
  date = new Date()
) {
  const item =
    getScheduleForRegion(
      region
    );

  if (!item) {
    return {
      success: false,

      status:
        "REGION_NOT_FOUND",

      region:
        normalizeRegion(
          region
        )
    };
  }

  const local =
    getLocalParts(
      item.timezone,
      date
    );

  const currentSlot =
    getCurrentScheduleSlot(
      local.hour,
      local.minute,
      item.hours
    );

  return {
    success: true,

    region:
      item.region,

    timezone:
      item.timezone,

    ...local,

    scheduledHours:
      [...item.hours],

    currentSlot,

    scheduleSlotId:
      currentSlot !== null
        ? createScheduleSlotId(
            item.region,
            local,
            currentSlot
          )
        : null
  };
}


export async function evaluateSchedule({
  region,
  date = new Date()
} = {}) {

  const item =
    getScheduleForRegion(
      region
    );

  if (!item) {
    return {
      eligible: false,

      status:
        "REGION_NOT_FOUND",

      region:
        normalizeRegion(
          region
        )
    };
  }


  const local =
    getLocalParts(
      item.timezone,
      date
    );


  const currentSlot =
    getCurrentScheduleSlot(
      local.hour,
      local.minute,
      item.hours
    );


  const scheduled =
    currentSlot !== null;


  const ceo =
    await getCEOAutomationStatus();


  if (
    ceo?.emergencyStop
  ) {
    return {
      eligible: false,

      status:
        "EMERGENCY_STOP",

      region:
        item.region,

      timezone:
        item.timezone,

      local,

      currentSlot
    };
  }


  if (
    ceo?.mode ===
    "STOP"
  ) {
    return {
      eligible: false,

      status:
        "AUTOMATION_STOPPED",

      region:
        item.region,

      timezone:
        item.timezone,

      local,

      currentSlot
    };
  }


  const startedToday =
    Number(
      ceo?.daily?.started ||
      0
    );


  if (
    startedToday >=
    MAX_DAILY_VIDEOS
  ) {
    return {
      eligible: false,

      status:
        "DAILY_LIMIT_REACHED",

      region:
        item.region,

      timezone:
        item.timezone,

      local,

      currentSlot,

      dailyLimit:
        MAX_DAILY_VIDEOS,

      startedToday,

      dailyRemaining: 0
    };
  }


  if (!scheduled) {
    return {
      eligible: false,

      status:
        "OUTSIDE_SCHEDULE",

      region:
        item.region,

      timezone:
        item.timezone,

      local,

      currentSlot: null,

      scheduledHours:
        item.hours,

      windowMinutes:
        SCHEDULE_WINDOW_MINUTES
    };
  }


  const gate =
    await canStartAutomation({
      requestedVideos: 1
    });


  if (!gate?.allowed) {
    return {
      eligible: false,

      status:
        gate?.status ||
        "AUTOMATION_GATE_BLOCKED",

      reason:
        gate?.reason ||
        "Automation gate rejected the scheduled run.",

      region:
        item.region,

      timezone:
        item.timezone,

      local,

      currentSlot
    };
  }


  return {
    eligible: true,

    status:
      "SCHEDULE_READY",

    region:
      item.region,

    timezone:
      item.timezone,

    local,

    scheduledHours:
      [...item.hours],

    currentSlot,

    scheduleSlotId:
      createScheduleSlotId(
        item.region,
        local,
        currentSlot
      ),

    windowMinutes:
      SCHEDULE_WINDOW_MINUTES,

    dailyLimit:
      MAX_DAILY_VIDEOS,

    dailyStarted:
      startedToday,

    dailyRemaining:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
        startedToday
      )
  };
}


export async function reserveScheduledRun({
  region,
  date = new Date()
} = {}) {

  const evaluation =
    await evaluateSchedule({
      region,
      date
    });


  if (
    !evaluation?.eligible
  ) {
    return evaluation;
  }


  /*
   * Final CEO check before
   * consuming a production slot.
   */

  const ceo =
    await getCEOAutomationStatus();


  if (
    ceo?.emergencyStop
  ) {
    return {
      eligible: false,

      status:
        "EMERGENCY_STOP",

      region:
        evaluation.region,

      timezone:
        evaluation.timezone,

      local:
        evaluation.local
    };
  }


  if (
    ceo?.mode ===
    "STOP"
  ) {
    return {
      eligible: false,

      status:
        "AUTOMATION_STOPPED",

      region:
        evaluation.region,

      timezone:
        evaluation.timezone,

      local:
        evaluation.local
    };
  }


  /*
   * CEO guard performs the
   * actual daily reservation.
   */

  const reservation =
    await reserveDailySlot();


  if (
    !reservation?.success
  ) {
    return {
      eligible: false,

      status:
        reservation?.status ||
        "DAILY_SLOT_RESERVATION_FAILED",

      region:
        evaluation.region,

      timezone:
        evaluation.timezone,

      local:
        evaluation.local,

      currentSlot:
        evaluation.currentSlot,

      scheduleSlotId:
        evaluation.scheduleSlotId,

      reservation
    };
  }


  return {
    eligible: true,

    status:
      "SCHEDULE_RESERVED",

    region:
      evaluation.region,

    timezone:
      evaluation.timezone,

    local:
      evaluation.local,

    currentSlot:
      evaluation.currentSlot,

    scheduleSlotId:
      evaluation.scheduleSlotId,

    reservation,

    dailyRemaining:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
        Number(
          reservation?.daily?.started ||
          0
        )
      )
  };
}


export async function getSchedulerStatus() {

  const ceo =
    await getCEOAutomationStatus();


  const startedToday =
    Number(
      ceo?.daily?.started ||
      0
    );


  const completedToday =
    Number(
      ceo?.daily?.completed ||
      0
    );


  return {
    success: true,

    status:
      "READY",

    maximumVideosPerDay:
      MAX_DAILY_VIDEOS,

    scheduleWindowMinutes:
      SCHEDULE_WINDOW_MINUTES,

    mode:
      ceo?.mode,

    emergencyStop:
      Boolean(
        ceo?.emergencyStop
      ),

    startedToday,

    completedToday,

    remainingToday:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
        startedToday
      ),

    regions:
      getWorldwideSchedule()
  };
}


export default {
  getWorldwideSchedule,
  getRegionalTime,
  evaluateSchedule,
  reserveScheduledRun,
  getSchedulerStatus
};