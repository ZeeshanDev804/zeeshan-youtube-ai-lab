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
  return new Date().toISOString().slice(0, 10);
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
    version: 1,
    mode: MODES.REVIEW,
    emergencyStop: false,
    daily: {
      date: todayKey(),
      started: 0,
      completed: 0
    },
    approvals: {},
    updatedAt: now()
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

    const state =
      JSON.parse(raw);

    if (
      !state ||
      typeof state !== "object"
    ) {
      return defaultState();
    }

    const result = {
      ...defaultState(),
      ...state,
      daily: {
        ...defaultState().daily,
        ...(state.daily || {})
      },
      approvals:
        state.approvals || {}
    };

    if (
      result.daily.date !==
      todayKey()
    ) {
      result.daily = {
        date: todayKey(),
        started: 0,
        completed: 0
      };
    }

    return result;
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultState();
    }

    throw error;
  }
}

async function writeState(state) {
  await ensureStorage();

  const nextState = {
    ...state,
    updatedAt: now()
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
    String(mode || "")
      .trim()
      .toUpperCase();

  if (
    Object.values(MODES)
      .includes(value)
  ) {
    return value;
  }

  return null;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
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

  /*
   * Emergency STOP remains independent.
   * Changing the normal mode must never
   * silently disable Emergency STOP.
   */

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
  reason = "CEO emergency stop"
) {
  const state =
    await readState();

  state.emergencyStop =
    true;

  state.emergencyStopReason =
    String(reason);

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
      Number(requestedVideos) ||
        1
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

  const remaining =
    MAX_DAILY_VIDEOS -
    state.daily.started;

  if (
    remaining <= 0 ||
    amount > remaining
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
        state.daily.started,
      remaining:
        Math.max(
          0,
          remaining
        )
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
      state.daily.started,
    remaining
  };
}

/*
|--------------------------------------------------------------------------
| RESERVE DAILY SLOT
|--------------------------------------------------------------------------
*/

export async function reserveDailySlot() {
  const gate =
    await canStartAutomation({
      requestedVideos: 1
    });

  if (!gate.allowed) {
    return gate;
  }

  const state =
    await readState();

  state.daily.started +=
    1;

  await writeState(
    state
  );

  return {
    success: true,
    status:
      "DAILY_SLOT_RESERVED",
    slot:
      state.daily.started,
    dailyLimit:
      MAX_DAILY_VIDEOS,
    remaining:
      MAX_DAILY_VIDEOS -
      state.daily.started
  };
}

export async function markVideoCompleted() {
  const state =
    await readState();

  state.daily.completed +=
    1;

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

  const normalizedRisk =
    String(risk || "LOW")
      .trim()
      .toUpperCase();

  /*
   * REVIEW mode always requires CEO approval.
   */

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

  /*
   * AUTO mode still blocks medium/high risk.
   */

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
    createId("approval");

  const request = {
    approvalId,

    runId:
      runId || null,

    reason:
      String(reason),

    risk:
      String(risk)
        .toUpperCase(),

    status:
      "PENDING",

    createdAt:
      now(),

    decidedAt:
      null,

    metadata
  };

  state.approvals[
    approvalId
  ] = request;

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

  const request =
    state.approvals[
      approvalId
    ];

  if (!request) {
    return {
      success: false,
      status:
        "APPROVAL_NOT_FOUND"
    };
  }

  const normalized =
    String(decision || "")
      .trim()
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
    String(note);

  request.decidedAt =
    now();

  state.approvals[
    approvalId
  ] = request;

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
| STATUS
|--------------------------------------------------------------------------
*/

export async function getCEOAutomationStatus() {
  const state =
    await readState();

  const approvals =
    Object.values(
      state.approvals
    );

  return {
    success: true,

    mode:
      state.mode,

    emergencyStop:
      state.emergencyStop,

    emergencyStopReason:
      state.emergencyStopReason ||
      null,

    daily: {
      date:
        state.daily.date,

      maximum:
        MAX_DAILY_VIDEOS,

      started:
        state.daily.started,

      completed:
        state.daily.completed,

      remaining:
        Math.max(
          0,
          MAX_DAILY_VIDEOS -
            state.daily.started
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
        true
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
| MAIN GUARD STATUS
|--------------------------------------------------------------------------
*/

export async function getCEOAutomationGuardStatus() {
  return getCEOAutomationStatus();
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
  getCEOAutomationStatus,
  getCEOAutomationGuardStatus,
  resetDailyCounter
};
