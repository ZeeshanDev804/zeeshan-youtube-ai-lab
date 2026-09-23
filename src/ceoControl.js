import config from "./config.js";

const VALID_MODES = new Set([
  "AUTO",
  "REVIEW",
  "STOP"
]);

export function getSystemStatus() {
  return {
    mode: config.system.mode,
    emergencyStop: config.system.emergencyStop,
    maxDailyVideos: config.system.maxDailyVideos,
    ceoApprovalRequired: config.system.ceoApprovalRequired,
    timestamp: new Date().toISOString()
  };
}

export function isEmergencyStopped() {
  return config.system.emergencyStop === true;
}

export function canRunAutomation() {
  if (isEmergencyStopped()) {
    return false;
  }

  return config.system.mode !== "STOP";
}

export function canAutoPublish(riskLevel) {
  if (!canRunAutomation()) {
    return false;
  }

  if (config.system.mode !== "AUTO") {
    return false;
  }

  if (config.system.ceoApprovalRequired) {
    return riskLevel === "LOW" && config.safety.autoPublishLowRisk;
  }

  return riskLevel === "LOW";
}

export function validateMode(mode) {
  const normalized = String(mode || "").toUpperCase();

  if (!VALID_MODES.has(normalized)) {
    throw new Error(
      `Invalid system mode: ${mode}. Allowed: AUTO, REVIEW, STOP.`
    );
  }

  return normalized;
}

export function createCEOApprovalRequest(payload = {}) {
  return {
    id: `approval_${Date.now()}`,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    ...payload
  };
      }
