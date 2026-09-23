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

export function evaluateYouTubePublish({
  uploadJob,
  riskLevel = "LOW",
  requiresCEOApproval = true
} = {}) {
  const uploadCheck =
    canUploadToYouTube(
      uploadJob
    );

  if (!uploadCheck.allowed) {
    return {
      success: false,
      status: "BLOCKED",
      allowed: false,
      reason:
        uploadCheck.reason
    };
  }

  const system =
    getSystemStatus();

  if (
    system.mode === "STOP"
  ) {
    return {
      success: false,
      status: "EMERGENCY_STOP",
      allowed: false,
      reason:
        "CEO Emergency Stop is active."
    };
  }

  const normalizedRisk =
    cleanText(
      riskLevel ||
        "LOW"
    ).toUpperCase();

  const allowedRiskLevels = [
    "LOW",
    "MEDIUM",
    "HIGH"
  ];

  if (
    !allowedRiskLevels.includes(
      normalizedRisk
    )
  ) {
    return {
      success: false,
      status: "INVALID_RISK",
      allowed: false,
      reason:
        "Invalid risk level."
    };
  }

  if (
    normalizedRisk === "HIGH"
  ) {
    return {
      success: false,
      status: "HIGH_RISK_BLOCKED",
      allowed: false,
      reason:
        "High-risk content cannot be auto-published."
    };
  }

  if (
    normalizedRisk === "MEDIUM"
  ) {
    return {
      success: false,
      status: "CEO_REVIEW_REQUIRED",
      allowed: false,
      approvalRequired: true,
      approval:
        createCEOApprovalRequest({
          action:
            "YOUTUBE_PUBLISH",
          reason:
            "Medium-risk content requires CEO review."
        })
    };
  }

  if (
    requiresCEOApproval === true
  ) {
    return {
      success: false,
      status: "CEO_REVIEW_REQUIRED",
      allowed: false,
      approvalRequired: true,
      approval:
        createCEOApprovalRequest({
          action:
            "YOUTUBE_PUBLISH",
          reason:
            "CEO approval is required before publishing."
        })
    };
  }

  const autoPublish =
    canAutoPublish(
      "LOW"
    );

  if (
    !autoPublish.allowed
  ) {
    return {
      success: false,
      status: "AUTO_PUBLISH_NOT_AUTHORIZED",
      allowed: false,
      reason:
        autoPublish.reason
    };
  }

  return {
    success: true,
    status: "PUBLISH_AUTHORIZED",
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
    status: "READY",
    currentMode:
      system.mode,
    supportedRiskLevels: [
      "LOW",
      "MEDIUM",
      "HIGH"
    ],
    highRisk:
      "BLOCKED",
    mediumRisk:
      "CEO_REVIEW",
    lowRisk:
      "AUTO_POLICY",
    emergencyStop:
      system.emergencyStop,
    message:
      "YouTube publishing is protected by QA, risk, CEO approval, and emergency-stop gates."
  };
}
