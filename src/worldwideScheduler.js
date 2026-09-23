import "dotenv/config";

import {
  canStartAutomation,
  reserveDailySlot,
  getCEOAutomationStatus
} from "./ceoAutomationGuard.js";

const MAX_DAILY_VIDEOS = 5;

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

function getLocalParts(
  timezone,
  date = new Date()
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          timezone,
        hour:
          "2-digit",
        minute:
          "2-digit",
        hour12:
          false,
        weekday:
          "short"
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

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
    hour:
      Number(result.hour),
    minute:
      Number(result.minute),
    weekday:
      result.weekday
  };
}

function isScheduledHour(
  hour,
  scheduleHours
) {
  return scheduleHours.includes(
    hour
  );
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
      ]
    })
  );
}

export function getRegionalTime(
  region,
  date = new Date()
) {
  const item =
    DEFAULT_SCHEDULE.find(
      (entry) =>
        entry.region ===
        String(region)
          .toUpperCase()
    );

  if (!item) {
    return {
      success: false,
      status:
        "REGION_NOT_FOUND"
    };
  }

  const local =
    getLocalParts(
      item.timezone,
      date
    );

  return {
    success: true,
    region:
      item.region,
    timezone:
      item.timezone,
    ...local
  };
}

export async function evaluateSchedule({
  region,
  date = new Date()
} = {}) {
  const item =
    DEFAULT_SCHEDULE.find(
      (entry) =>
        entry.region ===
        String(region)
          .toUpperCase()
    );

  if (!item) {
    return {
      eligible: false,
      status:
        "REGION_NOT_FOUND"
    };
  }

  const local =
    getLocalParts(
      item.timezone,
      date
    );

  const scheduled =
    isScheduledHour(
      local.hour,
      item.hours
    );

  const ceo =
    await getCEOAutomationStatus();

  if (
    ceo.emergencyStop
  ) {
    return {
      eligible: false,
      status:
        "EMERGENCY_STOP",
      region:
        item.region,
      timezone:
        item.timezone,
      local
    };
  }

  if (
    ceo.mode ===
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
      local
    };
  }

  if (
    ceo.daily.started >=
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
      dailyLimit:
        MAX_DAILY_VIDEOS
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
      scheduledHours:
        item.hours
    };
  }

  const gate =
    await canStartAutomation({
      requestedVideos: 1
    });

  if (!gate.allowed) {
    return {
      eligible: false,
      status:
        gate.status,
      reason:
        gate.reason,
      region:
        item.region,
      timezone:
        item.timezone,
      local
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
      item.hours,
    dailyRemaining:
      MAX_DAILY_VIDEOS -
      ceo.daily.started
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
    !evaluation.eligible
  ) {
    return evaluation;
  }

  const reservation =
    await reserveDailySlot();

  if (
    !reservation.success
  ) {
    return {
      eligible: false,
      status:
        reservation.status,
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
    reservation
  };
}

export async function getSchedulerStatus() {
  const ceo =
    await getCEOAutomationStatus();

  return {
    success: true,

    status:
      "READY",

    maximumVideosPerDay:
      MAX_DAILY_VIDEOS,

    mode:
      ceo.mode,

    emergencyStop:
      ceo.emergencyStop,

    startedToday:
      ceo.daily.started,

    completedToday:
      ceo.daily.completed,

    remainingToday:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
          ceo.daily.started
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
