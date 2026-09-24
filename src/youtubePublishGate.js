import {
  canUploadToYouTube
} from "./youtubeUploadGuard.js";

import {
  getSystemStatus,
  canAutoPublish,
  createCEOApprovalRequest
} from "./ceoControl.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRisk(value = "LOW") {
  const risk =
    cleanText(value).toUpperCase();

  if (
    ["LOW", "MEDIUM", "HIGH"].includes(
      risk
    )
  ) {
    return risk;
  }

  return null;
}

function isEmergencyStopActive(
  system
) {
  return (
    system?.mode === "STOP" ||
    system?.emergencyStop === true
  );
}

function createReviewRequest({
  riskLevel,
  reason
}) {
  return createCEOApprovalRequest({
    action:
      "YOUTUBE_PUBLISH",
    reason:
      reason ||
      `${riskLevel} risk content requires CEO review.`
  });
}

export function evaluateYouTubePublish({
  uploadJob,
  riskLevel = "LOW",
  requiresCEOApproval = true
} = {}) {
  const system =
    getSystemStatus();

  /*
   * HARD STOP
   *
   * Emergency Stop / STOP mode must
   * always block publishing.
   */
  if (
    isEmergencyStopActive(
      system
    )
  ) {
    return {
      success: false,
      status:
        "EMERGENCY_STOP",
      allowed: false,
      approvalRequired: false,
      reason:
        "CEO Emergency Stop is active."
    };
  }

  const normalizedRisk =
    normalizeRisk(
      riskLevel
    );

  if (!normalizedRisk) {
    return {
      success: false,
      status:
        "INVALID_RISK",
      allowed: false,
      approvalRequired: false,
      reason:
        "Invalid risk level."
    };
  }

  /*
   * Upload Guard
   *
   * The upload job must already contain
   * the required production/QA/media checks.
   */
  const uploadCheck =
    canUploadToYouTube(
      uploadJob
    );

  if (!uploadCheck.allowed) {
    return {
      success: false,
      status:
        "UPLOAD_GUARD_BLOCKED",
      allowed: false,
      approvalRequired: false,
      reason:
        uploadCheck.reason
    };
  }

  /*
   * HIGH RISK
   *
   * High-risk content is NOT auto-published.
   * It goes into CEO review.
   */
  if (
    normalizedRisk === "HIGH"
  ) {
    return {
      success: false,
      status:
        "HIGH_RISK_CEO_REVIEW",
      allowed: false,
      approvalRequired: true,
      riskLevel:
        normalizedRisk,
      approval:
        createReviewRequest({
          riskLevel:
            normalizedRisk,
          reason:
            "High-risk content requires explicit CEO review before publishing."
        })
    };
  }

  /*
   * MEDIUM RISK
   *
   * Medium-risk content also requires
   * explicit CEO approval.
   */
  if (
    normalizedRisk === "MEDIUM"
  ) {
    return {
      success: false,
      status:
        "CEO_REVIEW_REQUIRED",
      allowed: false,
      approvalRequired: true,
      riskLevel:
        normalizedRisk,
      approval:
        createReviewRequest({
          riskLevel:
            normalizedRisk,
          reason:
            "Medium-risk content requires CEO review before publishing."
        })
    };
  }

  /*
   * LOW RISK
   *
   * If CEO approval is explicitly required,
   * create an approval request.
   */
  if (
    requiresCEOApproval === true
  ) {
    return {
      success: false,
      status:
        "CEO_REVIEW_REQUIRED",
      allowed: false,
      approvalRequired: true,
      riskLevel:
        normalizedRisk,
      approval:
        createCEOApprovalRequest({
          action:
            "YOUTUBE_PUBLISH",
          reason:
            "CEO approval is required before publishing."
        })
    };
  }

  /*
   * LOW-RISK AUTO PUBLISH
   */
  const autoPublish =
    canAutoPublish(
      "LOW"
    );

  if (
    !autoPublish.allowed
  ) {
    return {
      success: false,
      status:
        "AUTO_PUBLISH_NOT_AUTHORIZED",
      allowed: false,
      approvalRequired: false,
      riskLevel:
        normalizedRisk,
      reason:
        autoPublish.reason
    };
  }

  /*
   * Final authorization
   */
  return {
    success: true,
    status:
      "PUBLISH_AUTHORIZED",
    allowed: true,
    approvalRequired: false,
    riskLevel:
      normalizedRisk,
    authorization:
      "CEO_AUTO_PUBLISH_POLICY",
    authorizedAt:
      new Date().toISOString()
  };
}

export function createPublishDecision({
  uploadJob,
  riskLevel = "LOW",
  requiresCEOApproval = true
} = {}) {
  const decision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel,
      requiresCEOApproval
    });

  return {
    ...decision,
    action:
      "YOUTUBE_PUBLISH",
    createdAt:
      new Date().toISOString()
  };
}

export function getYouTubePublishGateStatus() {
  const system =
    getSystemStatus();

  return {
    configured: true,
    status:
      "READY",
    currentMode:
      system.mode,

    supportedRiskLevels: [
      "LOW",
      "MEDIUM",
      "HIGH"
    ],

    policy: {
      lowRisk:
        "AUTO_POLICY_OR_CEO_REVIEW",
      mediumRisk:
        "CEO_REVIEW",
      highRisk:
        "CEO_REVIEW",
      stopMode:
        "BLOCKED",
      emergencyStop:
        "BLOCKED"
    },

    emergencyStop:
      system.emergencyStop === true,

    message:
      "YouTube publishing is protected by upload authorization, risk review, CEO approval, and emergency-stop gates."
  };
}