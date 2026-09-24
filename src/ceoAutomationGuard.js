import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

const STATE_FILE =
  process.env.CEO_AUTOMATION_STATE_FILE ||
  "./storage/automation/ceo-control-state.json";

const MAX_DAILY_VIDEOS = 5;

const MODES = Object.freeze({
  AUTO: "AUTO",
  REVIEW: "REVIEW",
  STOP: "STOP"
});

const STATUS = Object.freeze({
  READY: "READY",
  BLOCKED: "BLOCKED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  EMERGENCY_STOP: "EMERGENCY_STOP",
  DAILY_LIMIT_REACHED: "DAILY_LIMIT_REACHED"
});


function now() {
  return new Date().toISOString();
}


function todayKey() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}


function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}


async function ensureStorage() {
  await fs.mkdir(
    path.dirname(STATE_FILE),
    {
      recursive: true
    }
  );
}


function defaultState() {
  return {
    version: 2,

    mode:
      MODES.REVIEW,

    emergencyStop:
      false,

    emergencyStopReason:
      null,

    emergencyStopAt:
      null,

    emergencyStopClearedAt:
      null,

    daily: {
      date:
        todayKey(),

      started:
        0,

      completed:
        0
    },

    approvals: {},

    reservations: {},

    updatedAt:
      now()
  };
}


async function readState() {
  await ensureStorage();

  try {
    const raw =
      await fs.readFile(
        STATE_FILE,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {
      return defaultState();
    }

    const base =
      defaultState();

    const state = {
      ...base,
      ...parsed,

      daily: {
        ...base.daily,
        ...(parsed.daily || {})
      },

      approvals:
        parsed.approvals ||
        {},

      reservations:
        parsed.reservations ||
        {}
    };


    /*
     * Automatic daily reset.
     */

    if (
      state.daily.date !==
      todayKey()
    ) {
      state.daily = {
        date:
          todayKey(),

        started:
          0,

        completed:
          0
      };

      state.reservations = {};
    }


    return state;

  } catch (error) {

    if (
      error?.code ===
      "ENOENT"
    ) {
      return defaultState();
    }

    throw error;
  }
}


async function writeState(state) {
  await ensureStorage();

  const nextState = {
    ...state,
    version: 2,
    updatedAt:
      now()
  };

  const tempFile =
    `${STATE_FILE}.tmp`;

  await fs.writeFile(
    tempFile,
    JSON.stringify(
      nextState,
      null,
      2
    ),
    "utf8"
  );

  await fs.rename(
    tempFile,
    STATE_FILE
  );
}


function normalizeMode(mode) {
  const value =
    cleanText(mode)
      .toUpperCase();

  if (
    Object.values(MODES)
      .includes(value)
  ) {
    return value;
  }

  return null;
}


function normalizeRisk(risk) {
  const value =
    cleanText(risk || "LOW")
      .toUpperCase();

  if (
    ["LOW", "MEDIUM", "HIGH"]
      .includes(value)
  ) {
    return value;
  }

  return "MEDIUM";
}


/*
|--------------------------------------------------------------------------
| MODE CONTROL
|--------------------------------------------------------------------------
*/

export async function setAutomationMode(
  mode
) {
  const normalized =
    normalizeMode(mode);

  if (!normalized) {
    return {
      success: false,

      status:
        "INVALID_MODE",

      allowedModes:
        Object.values(MODES)
    };
  }

  const state =
    await readState();

  state.mode =
    normalized;

  await writeState(
    state
  );

  return {
    success: true,

    status:
      "MODE_UPDATED",

    mode:
      state.mode,

    emergencyStop:
      state.emergencyStop
  };
}


export async function getAutomationMode() {
  const state =
    await readState();

  return {
    success: true,

    mode:
      state.mode,

    emergencyStop:
      state.emergencyStop
  };
}


/*
|--------------------------------------------------------------------------
| EMERGENCY STOP
|--------------------------------------------------------------------------
*/

export async function activateEmergencyStop(
  reason =
    "CEO emergency stop"
) {
  const state =
    await readState();

  state.emergencyStop =
    true;

  state.emergencyStopReason =
    cleanText(reason) ||
    "CEO emergency stop";

  state.emergencyStopAt =
    now();

  await writeState(
    state
  );

  return {
    success: true,

    status:
      STATUS.EMERGENCY_STOP,

    emergencyStop:
      true,

    reason:
      state.emergencyStopReason,

    activatedAt:
      state.emergencyStopAt
  };
}


export async function clearEmergencyStop() {
  const state =
    await readState();

  state.emergencyStop =
    false;

  state.emergencyStopReason =
    null;

  state.emergencyStopClearedAt =
    now();

  await writeState(
    state
  );

  return {
    success: true,

    status:
      "EMERGENCY_STOP_CLEARED",

    emergencyStop:
      false
  };
}


/*
|--------------------------------------------------------------------------
| AUTOMATION START GATE
|--------------------------------------------------------------------------
*/

export async function canStartAutomation({
  requestedVideos = 1
} = {}) {

  const state =
    await readState();

  const amount =
    Math.max(
      1,
      Number(
        requestedVideos
      ) || 1
    );


  if (
    state.emergencyStop
  ) {
    return {
      allowed: false,

      status:
        STATUS.EMERGENCY_STOP,

      reason:
        state.emergencyStopReason ||
        "Emergency STOP is active."
    };
  }


  if (
    state.mode ===
    MODES.STOP
  ) {
    return {
      allowed: false,

      status:
        STATUS.BLOCKED,

      reason:
        "Automation mode is STOP."
    };
  }


  const started =
    Number(
      state.daily.started ||
      0
    );


  const remaining =
    Math.max(
      0,
      MAX_DAILY_VIDEOS -
        started
    );


  if (
    amount >
    remaining
  ) {
    return {
      allowed: false,

      status:
        STATUS.DAILY_LIMIT_REACHED,

      reason:
        `Daily maximum of ${MAX_DAILY_VIDEOS} videos reached.`,

      dailyLimit:
        MAX_DAILY_VIDEOS,

      startedToday:
        started,

      remaining
    };
  }


  return {
    allowed: true,

    status:
      STATUS.READY,

    mode:
      state.mode,

    dailyLimit:
      MAX_DAILY_VIDEOS,

    startedToday:
      started,

    remaining
  };
}


/*
|--------------------------------------------------------------------------
| DAILY SLOT RESERVATION
|--------------------------------------------------------------------------
*/

export async function reserveDailySlot({
  reservationKey = null,
  region = null,
  runId = null
} = {}) {

  const state =
    await readState();


  if (
    state.emergencyStop
  ) {
    return {
      success: false,

      status:
        STATUS.EMERGENCY_STOP,

      reason:
        state.emergencyStopReason ||
        "Emergency STOP is active."
    };
  }


  if (
    state.mode ===
    MODES.STOP
  ) {
    return {
      success: false,

      status:
        STATUS.BLOCKED,

      reason:
        "Automation mode is STOP."
    };
  }


  /*
   * Idempotency:
   * the same schedule reservation
   * cannot consume another daily slot.
   */

  if (
    reservationKey &&
    state.reservations[
      reservationKey
    ]
  ) {

    const existing =
      state.reservations[
        reservationKey
      ];

    return {
      success: true,

      status:
        "ALREADY_RESERVED",

      slot:
        existing.slot,

      dailyLimit:
        MAX_DAILY_VIDEOS,

      remaining:
        Math.max(
          0,
          MAX_DAILY_VIDEOS -
            Number(
              state.daily.started ||
              0
            )
        ),

      reservation:
        existing
    };
  }


  const started =
    Number(
      state.daily.started ||
      0
    );


  if (
    started >=
    MAX_DAILY_VIDEOS
  ) {
    return {
      success: false,

      status:
        STATUS.DAILY_LIMIT_REACHED,

      dailyLimit:
        MAX_DAILY_VIDEOS,

      startedToday:
        started,

      remaining: 0
    };
  }


  const nextSlot =
    started + 1;


  state.daily.started =
    nextSlot;


  const reservation = {
    reservationId:
      createId(
        "reservation"
      ),

    key:
      reservationKey,

    slot:
      nextSlot,

    region:
      region
        ? cleanText(region)
        : null,

    runId:
      runId
        ? cleanText(runId)
        : null,

    reservedAt:
      now(),

    status:
      "RESERVED"
  };


  if (
    reservationKey
  ) {
    state.reservations[
      reservationKey
    ] =
      reservation;
  }


  await writeState(
    state
  );


  return {
    success: true,

    status:
      "DAILY_SLOT_RESERVED",

    slot:
      nextSlot,

    dailyLimit:
      MAX_DAILY_VIDEOS,

    remaining:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
          nextSlot
      ),

    reservation
  };
}


/*
|--------------------------------------------------------------------------
| VIDEO COMPLETION
|--------------------------------------------------------------------------
*/

export async function markVideoCompleted() {
  const state =
    await readState();

  state.daily.completed =
    Number(
      state.daily.completed ||
      0
    ) + 1;

  await writeState(
    state
  );

  return {
    success: true,

    status:
      "VIDEO_COMPLETED",

    completedToday:
      state.daily.completed
  };
}


/*
|--------------------------------------------------------------------------
| PUBLISH GATE
|--------------------------------------------------------------------------
*/

export async function canPublish({
  risk = "LOW",
  requiresApproval = false
} = {}) {

  const state =
    await readState();

  const normalizedRisk =
    normalizeRisk(risk);


  if (
    state.emergencyStop
  ) {
    return {
      allowed: false,

      status:
        STATUS.EMERGENCY_STOP,

      reason:
        "Emergency STOP is active."
    };
  }


  if (
    state.mode ===
    MODES.STOP
  ) {
    return {
      allowed: false,

      status:
        STATUS.BLOCKED,

      reason:
        "Automation mode is STOP."
    };
  }


  if (
    state.mode ===
    MODES.REVIEW
  ) {
    return {
      allowed: false,

      status:
        STATUS.APPROVAL_REQUIRED,

      reason:
        "REVIEW mode requires CEO approval.",

      mode:
        state.mode,

      risk:
        normalizedRisk
    };
  }


  if (
    normalizedRisk ===
      "MEDIUM" ||
    normalizedRisk ===
      "HIGH"
  ) {
    return {
      allowed: false,

      status:
        STATUS.APPROVAL_REQUIRED,

      reason:
        `${normalizedRisk} risk requires CEO approval.`,

      mode:
        state.mode,

      risk:
        normalizedRisk
    };
  }


  if (
    requiresApproval
  ) {
    return {
      allowed: false,

      status:
        STATUS.APPROVAL_REQUIRED,

      reason:
        "This job explicitly requires CEO approval."
    };
  }


  return {
    allowed: true,

    status:
      STATUS.READY,

    mode:
      state.mode,

    risk:
      normalizedRisk
  };
}


/*
|--------------------------------------------------------------------------
| CEO APPROVAL
|--------------------------------------------------------------------------
*/

export async function createApprovalRequest({
  runId,
  reason = "",
  risk = "MEDIUM",
  metadata = {}
} = {}) {

  const state =
    await readState();

  const approvalId =
    createId(
      "approval"
    );


  const request = {
    approvalId,

    runId:
      runId || null,

    reason:
      cleanText(reason),

    risk:
      normalizeRisk(risk),

    status:
      "PENDING",

    createdAt:
      now(),

    decidedAt:
      null,

    metadata:
      metadata || {}
  };


  state.approvals[
    approvalId
  ] =
    request;


  await writeState(
    state
  );


  return {
    success: true,

    status:
      "APPROVAL_CREATED",

    request
  };
}


export async function decideApproval({
  approvalId,
  decision,
  note = ""
} = {}) {

  const state =
    await readState();

  const id =
    cleanText(
      approvalId
    );


  const request =
    state.approvals[id];


  if (!request) {
    return {
      success: false,

      status:
        "APPROVAL_NOT_FOUND"
    };
  }


  const normalized =
    cleanText(decision)
      .toUpperCase();


  if (
    ![
      "APPROVED",
      "REJECTED"
    ].includes(normalized)
  ) {
    return {
      success: false,

      status:
        "INVALID_DECISION"
    };
  }


  request.status =
    normalized;

  request.note =
    cleanText(note);

  request.decidedAt =
    now();


  state.approvals[id] =
    request;


  await writeState(
    state
  );


  return {
    success: true,

    status:
      "APPROVAL_UPDATED",

    request
  };
}


/*
|--------------------------------------------------------------------------
| APPROVAL LOOKUP
|--------------------------------------------------------------------------
*/

export async function getApprovalRequest(
  approvalId
) {

  const state =
    await readState();

  const id =
    cleanText(
      approvalId
    );


  if (!id) {
    return {
      success: false,

      status:
        "INVALID_APPROVAL_ID"
    };
  }


  const request =
    state.approvals[id];


  if (!request) {
    return {
      success: false,

      status:
        "APPROVAL_NOT_FOUND"
    };
  }


  return {
    success: true,

    status:
      "APPROVAL_FOUND",

    request
  };
}


/*
|--------------------------------------------------------------------------
| CEO STATUS
|--------------------------------------------------------------------------
*/

export async function getCEOAutomationStatus() {

  const state =
    await readState();


  const approvals =
    Object.values(
      state.approvals
    );


  const started =
    Number(
      state.daily.started ||
      0
    );


  const completed =
    Number(
      state.daily.completed ||
      0
    );


  return {
    success: true,

    version:
      state.version,

    mode:
      state.mode,

    emergencyStop:
      Boolean(
        state.emergencyStop
      ),

    emergencyStopReason:
      state.emergencyStopReason ||
      null,

    emergencyStopAt:
      state.emergencyStopAt ||
      null,

    daily: {
      date:
        state.daily.date,

      limit:
        MAX_DAILY_VIDEOS,

      maximum:
        MAX_DAILY_VIDEOS,

      started,

      used:
        started,

      completed,

      remaining:
        Math.max(
          0,
          MAX_DAILY_VIDEOS -
            started
        )
    },

    approvals: {
      total:
        approvals.length,

      pending:
        approvals.filter(
          (item) =>
            item.status ===
            "PENDING"
        ).length,

      approved:
        approvals.filter(
          (item) =>
            item.status ===
            "APPROVED"
        ).length,

      rejected:
        approvals.filter(
          (item) =>
            item.status ===
            "REJECTED"
        ).length
    },

    safetyRules: {
      maximumVideosPerDay:
        MAX_DAILY_VIDEOS,

      mediumRiskNeedsApproval:
        true,

      highRiskNeedsApproval:
        true,

      reviewModeNeedsApproval:
        true,

      stopBlocksNewAutomation:
        true,

      emergencyStopBlocksAutomation:
        true,

      duplicateReservationProtection:
        true
    },

    storage: {
      stateFile:
        STATE_FILE
    }
  };
}


/*
|--------------------------------------------------------------------------
| RESET DAILY COUNTER
|--------------------------------------------------------------------------
*/

export async function resetDailyCounter() {

  const state =
    await readState();


  state.daily = {
    date:
      todayKey(),

    started:
      0,

    completed:
      0
  };


  state.reservations =
    {};


  await writeState(
    state
  );


  return {
    success: true,

    status:
      "DAILY_COUNTER_RESET",

    date:
      state.daily.date
  };
}


/*
|--------------------------------------------------------------------------
| GUARD STATUS
|--------------------------------------------------------------------------
*/

export async function getCEOAutomationGuardStatus() {

  const status =
    await getCEOAutomationStatus();


  return {
    ...status,

    configured:
      true,

    status:
      status.emergencyStop
        ? STATUS.EMERGENCY_STOP
        : status.mode ===
          MODES.STOP
          ? STATUS.BLOCKED
          : status.daily.remaining <= 0
            ? STATUS.DAILY_LIMIT_REACHED
            : STATUS.READY
  };
}


export default {
  setAutomationMode,
  getAutomationMode,

  activateEmergencyStop,
  clearEmergencyStop,

  canStartAutomation,
  reserveDailySlot,
  markVideoCompleted,

  canPublish,

  createApprovalRequest,
  decideApproval,
  getApprovalRequest,

  getCEOAutomationStatus,
  getCEOAutomationGuardStatus,

  resetDailyCounter
};