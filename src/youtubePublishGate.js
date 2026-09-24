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

    riskLevel,

    reason:
      reason ||
      `${riskLevel} risk content requires CEO review.`
  });
}

function createBlockedDecision({
  status,
  riskLevel = null,
  reason,
  approvalRequired = false
}) {
  return {
    success: false,
    status,
    allowed: false,
    approvalRequired,
    riskLevel,
    reason
  };
}

export function evaluateYouTubePublish({
  uploadJob,
  riskLevel = "LOW"
} = {}) {
  const system =
    getSystemStatus();

  /*
   * ------------------------------------------------
   * 1. HARD STOP
   * ------------------------------------------------
   */

  if (
    isEmergencyStopActive(
      system
    )
  ) {
    return createBlockedDecision({
      status:
        system.mode === "STOP"
          ? "SYSTEM_STOP"
          : "EMERGENCY_STOP",

      reason:
        system.mode === "STOP"
          ? "System mode is STOP."
          : "CEO Emergency Stop is active."
    });
  }

  /*
   * ------------------------------------------------
   * 2. RISK VALIDATION
   * ------------------------------------------------
   */

  const normalizedRisk =
    normalizeRisk(
      riskLevel
    );

  if (!normalizedRisk) {
    return createBlockedDecision({
      status:
        "INVALID_RISK",

      reason:
        "Invalid risk level."
    });
  }

  /*
   * ------------------------------------------------
   * 3. UPLOAD GUARD
   * ------------------------------------------------
   *
   * Upload Guard handles:
   * - final video
   * - QA
   * - duplicate
   * - copyright
   * - metadata
   * - technical upload checks
   *
   * Final CEO publishing decision remains here.
   */

  const uploadCheck =
    canUploadToYouTube(
      uploadJob
    );

  if (!uploadCheck.allowed) {
    return createBlockedDecision({
      status:
        "UPLOAD_GUARD_BLOCKED",

      riskLevel:
        normalizedRisk,

      reason:
        uploadCheck.reason
    });
  }

  /*
   * ------------------------------------------------
   * 4. HIGH RISK
   * ------------------------------------------------
   *
   * HIGH risk is never automatic.
   * It goes to CEO review.
   */

  if (
    normalizedRisk === "HIGH"
  ) {
    const approval =
      createReviewRequest({
        riskLevel:
          normalizedRisk,

        reason:
          "High-risk content requires explicit CEO review before publishing."
      });

    return {
      success: false,

      status:
        "HIGH_RISK_CEO_REVIEW",

      allowed: false,

      approvalRequired: true,

      riskLevel:
        normalizedRisk,

      approval,

      nextStage:
        "CEO_REVIEW"
    };
  }

  /*
   * ------------------------------------------------
   * 5. MEDIUM RISK
   * ------------------------------------------------
   *
   * MEDIUM risk is never automatic.
   * It goes to CEO review.
   */

  if (
    normalizedRisk === "MEDIUM"
  ) {
    const approval =
      createReviewRequest({
        riskLevel:
          normalizedRisk,

        reason:
          "Medium-risk content requires CEO review before publishing."
      });

    return {
      success: false,

      status:
        "CEO_REVIEW_REQUIRED",

      allowed: false,

      approvalRequired: true,

      riskLevel:
        normalizedRisk,

      approval,

      nextStage:
        "CEO_REVIEW"
    };
  }

  /*
   * ------------------------------------------------
   * 6. LOW RISK
   * ------------------------------------------------
   *
   * LOW risk can auto-publish only when
   * ceoControl.js explicitly allows it.
   *
   * AUTO mode + low-risk policy = allowed.
   *
   * REVIEW mode = CEO review.
   */

  const autoPublish =
    canAutoPublish(
      "LOW"
    );

  if (
    autoPublish.allowed
  ) {
    return {
      success: true,

      status:
        "PUBLISH_AUTHORIZED",

      allowed: true,

      approvalRequired: false,

      riskLevel:
        "LOW",

      authorization:
        "CEO_AUTO_PUBLISH_POLICY",

      reason:
        autoPublish.reason,

      nextStage:
        "YOUTUBE_OAUTH_UPLOAD",

      authorizedAt:
        new Date().toISOString()
    };
  }

  /*
   * ------------------------------------------------
   * 7. LOW RISK BUT CEO REVIEW REQUIRED
   * ------------------------------------------------
   */

  const approval =
    createCEOApprovalRequest({
      action:
        "YOUTUBE_PUBLISH",

      riskLevel:
        "LOW",

      reason:
        autoPublish.reason ||
        "Low-risk content requires CEO approval in the current system mode."
    });

  return {
    success: false,

    status:
      "CEO_REVIEW_REQUIRED",

    allowed: false,

    approvalRequired: true,

    riskLevel:
      "LOW",

    approval,

    nextStage:
      "CEO_REVIEW"
  };
}

export function createPublishDecision({
  uploadJob,
  riskLevel = "LOW"
} = {}) {
  const decision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel
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
        "AUTO when CEO low-risk policy allows; otherwise CEO review",

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

    dailyTargetVideos:
      system.dailyTargetVideos,

    hardDailyMaximum:
      system.hardDailyMaximum === true,

    message:
      "YouTube publishing is protected by upload authorization, risk review, CEO approval, and Emergency Stop."
  };
}