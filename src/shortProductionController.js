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

function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
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
  captionFile = null,
  title = "",
  outputDir = "./storage/final"
} = {}) {
  const errors = [];

  if (!isNonEmptyString(videoFile)) {
    errors.push(
      "Video file is required."
    );
  }

  if (!isNonEmptyString(audioFile)) {
    errors.push(
      "Audio file is required."
    );
  }

  if (errors.length > 0) {
    return {
      success: false,
      status: "INVALID_MEDIA",
      errors
    };
  }

  if (
    captionFile !== null &&
    !isNonEmptyString(captionFile)
  ) {
    return {
      success: false,
      status: "INVALID_CAPTION",
      errors: [
        "Caption file must be a valid SRT file path."
      ]
    };
  }

  const result =
    await renderFinalShort({
      videoFile,
      audioFile,
      captionFile,
      title,
      outputDir
    });

  if (!result.success) {
    return {
      success: false,

      status:
        result.status ||
        "FINAL_RENDER_FAILED",

      error:
        result.error ||
        "Final Short could not be created.",

      details:
        result
    };
  }

  return {
    success: true,

    status:
      result.status ||
      "FINAL_SHORT_READY",

    outputFile:
      result.outputFile,

    sizeBytes:
      result.sizeBytes,

    captions:
      result.captions || {
        enabled:
          Boolean(captionFile),
        burnedIntoVideo:
          Boolean(captionFile)
      },

    createdAt:
      result.createdAt
  };
}

export async function prepareShortFinalRender({
  videoFile,
  audioFile,
  captionFile = null,
  title = "",
  outputDir = "./storage/final"
} = {}) {
  return buildFinalShort({
    videoFile,
    audioFile,
    captionFile,
    title,
    outputDir
  });
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
      "CAPTIONS",
      "FINAL_RENDER",
      "QUALITY_ASSURANCE",
      "UPLOAD_AUTHORIZATION",
      "CEO_PUBLISH_GATE",
      "YOUTUBE"
    ],

    finalRender: {
      configured: true,
      renderer: "finalShortRenderer",
      captionSupport: true,
      captionFormat: "SRT",
      captionMode:
        "OPTIONAL_BURN_IN"
    },

    safetyGates: [
      "QA_REQUIRED",
      "RISK_CHECK_REQUIRED",
      "CEO_APPROVAL_POLICY",
      "EMERGENCY_STOP"
    ],

    message:
      "Central Short production controller is ready with optional burned-in caption support."
  };
}

export default {
  prepareShortForPublishing,
  buildFinalShort,
  prepareShortFinalRender,
  getShortProductionControllerStatus
};