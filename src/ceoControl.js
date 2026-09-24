import config from "./config.js";

const VALID_MODES = new Set([
  "AUTO",
  "REVIEW",
  "STOP"
]);

const VALID_APPROVAL_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED"
]);

function normalizeMode(mode) {
  return String(mode || "")
    .trim()
    .toUpperCase();
}

function normalizeRisk(riskLevel) {
  return String(riskLevel || "LOW")
    .trim()
    .toUpperCase();
}

export function getSystemStatus() {
  return {
    mode:
      normalizeMode(
        config?.system?.mode ||
        "REVIEW"
      ),

    emergencyStop:
      config?.system?.emergencyStop === true,

    maxDailyVideos:
      config?.system?.maxDailyVideos ??
      null,

    dailyTargetVideos:
      config?.system?.dailyTargetVideos ??
      5,

    hardDailyMaximum:
      config?.system?.hardDailyMaximum === true,

    ceoApprovalRequired:
      config?.system?.ceoApprovalRequired !== false,

    timestamp:
      new Date().toISOString()
  };
}

export function isEmergencyStopped() {
  return (
    config?.system?.emergencyStop === true
  );
}

export function canRunAutomation() {
  const system =
    getSystemStatus();

  if (
    system.emergencyStop
  ) {
    return false;
  }

  if (
    system.mode === "STOP"
  ) {
    return false;
  }

  return true;
}

export function canAutoPublish(
  riskLevel = "LOW"
) {
  const system =
    getSystemStatus();

  const normalizedRisk =
    normalizeRisk(
      riskLevel
    );

  if (
    !canRunAutomation()
  ) {
    return {
      allowed: false,
      reason:
        system.emergencyStop
          ? "Emergency Stop is active."
          : "System mode is STOP."
    };
  }

  if (
    system.mode !== "AUTO"
  ) {
    return {
      allowed: false,
      reason:
        "System is not in AUTO mode."
    };
  }

  /*
   * Only LOW-risk content can
   * enter automatic publishing.
   *
   * MEDIUM and HIGH go to CEO review.
   */
  if (
    normalizedRisk !== "LOW"
  ) {
    return {
      allowed: false,
      reason:
        `${normalizedRisk} risk content requires CEO review.`
    };
  }

  const safetyConfig =
    config?.safety || {};

  if (
    safetyConfig.autoPublishLowRisk === false
  ) {
    return {
      allowed: false,
      reason:
        "Low-risk auto-publishing is disabled by safety policy."
    };
  }

  /*
   * If the global CEO approval requirement
   * is enabled, AUTO mode still needs the
   * explicit low-risk auto-publish policy.
   */
  if (
    system.ceoApprovalRequired &&
    safetyConfig.autoPublishLowRisk !== true
  ) {
    return {
      allowed: false,
      reason:
        "CEO approval policy prevents automatic publishing."
    };
  }

  return {
    allowed: true,
    reason:
      "Low-risk content is authorized for automatic publishing.",
    riskLevel:
      normalizedRisk,
    mode:
      system.mode
  };
}

export function validateMode(
  mode
) {
  const normalized =
    normalizeMode(
      mode
    );

  if (
    !VALID_MODES.has(
      normalized
    )
  ) {
    throw new Error(
      `Invalid system mode: ${mode}. Allowed: AUTO, REVIEW, STOP.`
    );
  }

  return normalized;
}

export function createCEOApprovalRequest(
  payload = {}
) {
  const riskLevel =
    normalizeRisk(
      payload.riskLevel ||
      "LOW"
    );

  return {
    id:
      `approval_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    action:
      payload.action ||
      "UNKNOWN_ACTION",

    riskLevel,

    status:
      "PENDING",

    reason:
      payload.reason ||
      "CEO approval required.",

    createdAt:
      new Date().toISOString()
  };
}

export function resolveCEOApproval(
  approvalRequest,
  decision,
  metadata = {}
) {
  if (
    !approvalRequest ||
    typeof approvalRequest !== "object"
  ) {
    return {
      success: false,
      status:
        "INVALID_REQUEST",
      reason:
        "CEO approval request is missing."
    };
  }

  const normalizedDecision =
    String(
      decision || ""
    )
      .trim()
      .toUpperCase();

  if (
    !VALID_APPROVAL_STATUSES.has(
      normalizedDecision
    ) ||
    normalizedDecision === "PENDING"
  ) {
    return {
      success: false,
      status:
        "INVALID_DECISION",
      reason:
        "Decision must be APPROVED or REJECTED."
    };
  }

  return {
    success: true,

    id:
      approvalRequest.id,

    action:
      approvalRequest.action,

    riskLevel:
      approvalRequest.riskLevel,

    status:
      normalizedDecision,

    approved:
      normalizedDecision === "APPROVED",

    reason:
      approvalRequest.reason,

    decidedAt:
      new Date().toISOString(),

    ...metadata
  };
}

export function approveCEORequest(
  approvalRequest,
  metadata = {}
) {
  return resolveCEOApproval(
    approvalRequest,
    "APPROVED",
    metadata
  );
}

export function rejectCEORequest(
  approvalRequest,
  metadata = {}
) {
  return resolveCEOApproval(
    approvalRequest,
    "REJECTED",
    metadata
  );
}

export function getCEOControlStatus() {
  const system =
    getSystemStatus();

  return {
    configured: true,

    status:
      system.emergencyStop
        ? "EMERGENCY_STOP"
        : system.mode === "STOP"
          ? "STOPPED"
          : "READY",

    mode:
      system.mode,

    emergencyStop:
      system.emergencyStop,

    ceoApprovalRequired:
      system.ceoApprovalRequired,

    dailyTargetVideos:
      system.dailyTargetVideos,

    hardDailyMaximum:
      system.hardDailyMaximum,

    supportedModes: [
      "AUTO",
      "REVIEW",
      "STOP"
    ],

    riskPolicy: {
      LOW:
        "AUTO_ALLOWED_WHEN_POLICY_ALLOWS",
      MEDIUM:
        "CEO_REVIEW",
      HIGH:
        "CEO_REVIEW"
    },

    message:
      "CEO control system is active."
  };
}