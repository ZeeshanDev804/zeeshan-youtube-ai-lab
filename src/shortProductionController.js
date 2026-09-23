import {
  createShortProductionManifest
} from "./shortProductionManifest.js";

import {
  runShortQualityPipeline
} from "./shortQualityPipeline.js";

import {
  createYouTubeUploadJob
} from "./youtubeUploadGuard.js";

import {
  evaluateYouTubePublish
} from "./youtubePublishGate.js";

import {
  renderFinalShort
} from "./finalShortRenderer.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function prepareShortForPublishing({
  topic,
  script,
  title = "",
  description = "",
  tags = [],
  language = "en-US",
  voice = "default",
  visualProvider = "not_configured",
  finalVideoFile,
  riskLevel = "LOW",
  requiresCEOApproval = true,
  privacyStatus = "private"
} = {}) {
  const errors = [];

  if (!cleanText(topic)) {
    errors.push("Topic is required.");
  }

  if (!cleanText(script)) {
    errors.push("Script is required.");
  }

  if (!cleanText(finalVideoFile)) {
    errors.push("Final video file is required.");
  }

  if (errors.length > 0) {
    return {
      success: false,
      status: "CONTROLLER_BLOCKED",
      errors
    };
  }

  const manifest =
    createShortProductionManifest({
      topic,
      script,
      title,
      description,
      language,
      voice,
      visualProvider
    });

  if (!manifest.success) {
    return {
      success: false,
      status: "MANIFEST_FAILED",
      errors:
        manifest.errors || [
          "Production manifest failed."
        ]
    };
  }

  const qa =
    await runShortQualityPipeline({
      manifest,
      finalVideoFile
    });

  if (!qa.passed) {
    return {
      success: false,
      status: "QA_BLOCKED",
      productionId:
        manifest.id,
      manifest,
      qa
    };
  }

  const uploadJob =
    createYouTubeUploadJob({
      manifest,
      qaResult: qa,
      videoFile:
        finalVideoFile,
      title,
      description,
      tags,
      privacyStatus
    });

  if (!uploadJob.success) {
    return {
      success: false,
      status: "UPLOAD_JOB_BLOCKED",
      productionId:
        manifest.id,
      manifest,
      qa,
      uploadJob
    };
  }

  const publishDecision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel,
      requiresCEOApproval
    });

  return {
    success:
      publishDecision.allowed === true,
    status:
      publishDecision.status,
    productionId:
      manifest.id,
    topic:
      cleanText(topic),
    manifest,
    qa,
    uploadJob,
    publishDecision,
    createdAt:
      new Date().toISOString()
  };
}

export async function buildFinalShort({
  videoFile,
  audioFile,
  title = "",
  outputDir = "./storage/final"
} = {}) {
  if (
    !cleanText(videoFile) ||
    !cleanText(audioFile)
  ) {
    return {
      success: false,
      status: "INVALID_MEDIA",
      errors: [
        "Video and audio files are required."
      ]
    };
  }

  const result =
    await renderFinalShort({
      videoFile,
      audioFile,
      title,
      outputDir
    });

  if (!result.success) {
    return {
      success: false,
      status: "FINAL_RENDER_FAILED",
      error:
        result.error ||
        "Final Short could not be created."
    };
  }

  return {
    success: true,
    status: "FINAL_SHORT_READY",
    outputFile:
      result.outputFile,
    sizeBytes:
      result.sizeBytes,
    createdAt:
      result.createdAt
  };
}

export function getShortProductionControllerStatus() {
  return {
    configured: true,
    status: "READY",

    pipeline: [
      "TOPIC",
      "SCRIPT",
      "VOICE",
      "VISUALS",
      "VIDEO",
      "FINAL_RENDER",
      "QUALITY_ASSURANCE",
      "UPLOAD_AUTHORIZATION",
      "CEO_PUBLISH_GATE",
      "YOUTUBE"
    ],

    safetyGates: [
      "QA_REQUIRED",
      "RISK_CHECK_REQUIRED",
      "CEO_APPROVAL_POLICY",
      "EMERGENCY_STOP"
    ],

    message:
      "Central Short production controller is ready."
  };
}
