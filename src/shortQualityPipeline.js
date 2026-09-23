import {
  runVideoQualityCheck,
  getVideoQualityGuardStatus
} from "./videoQualityGuard.js";

import {
  validateProductionManifest
} from "./shortProductionManifest.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function runShortQualityPipeline({
  manifest,
  finalVideoFile
} = {}) {
  const errors = [];

  const manifestCheck =
    validateProductionManifest(
      manifest
    );

  if (!manifestCheck.valid) {
    errors.push(
      ...manifestCheck.errors
    );
  }

  if (
    typeof finalVideoFile !== "string" ||
    !finalVideoFile.trim()
  ) {
    errors.push(
      "Final video file is required."
    );
  }

  if (errors.length > 0) {
    return {
      success: false,
      status: "QA_BLOCKED",
      passed: false,
      errors
    };
  }

  const qa =
    await runVideoQualityCheck({
      filePath:
        finalVideoFile,
      minSeconds: 20,
      maxSeconds: 59,
      requiredWidth: 1080,
      requiredHeight: 1920
    });

  if (!qa.success) {
    return {
      success: false,
      status: "QA_FAILED",
      passed: false,
      errors:
        qa.errors || [
          "Video quality inspection failed."
        ]
    };
  }

  if (!qa.passed) {
    return {
      success: false,
      status: "QA_BLOCKED",
      passed: false,
      errors:
        qa.errors,
      warnings:
        qa.warnings || [],
      inspection:
        qa.inspection
    };
  }

  return {
    success: true,
    status: "QA_PASS",
    passed: true,
    productionId:
      manifest.id,
    topic:
      cleanText(
        manifest.metadata.topic
      ),
    finalVideoFile,
    inspection:
      qa.inspection,
    warnings:
      qa.warnings || [],
    nextStage:
      "PUBLISH_AUTHORIZATION",
    checkedAt:
      new Date().toISOString()
  };
}

export function canPublishAfterQA(
  qaResult
) {
  if (
    !qaResult ||
    qaResult.passed !== true
  ) {
    return {
      allowed: false,
      reason:
        "Video QA must pass before publishing."
    };
  }

  return {
    allowed: true,
    reason:
      "Video passed the required quality checks."
  };
}

export function getShortQualityPipelineStatus() {
  const guardStatus =
    getVideoQualityGuardStatus();

  return {
    configured: true,
    status: "READY",
    qaStatus:
      guardStatus.status,
    publishGate:
      "QA_PASS_REQUIRED",
    message:
      "Short quality pipeline blocks publishing until final video QA passes."
  };
}
