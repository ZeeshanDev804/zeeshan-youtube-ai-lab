import fs from "node:fs/promises";
import path from "node:path";

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

function normalizeRiskLevel(value = "LOW") {
  const risk = String(value)
    .trim()
    .toUpperCase();

  if (
    risk === "HIGH" ||
    risk === "MEDIUM" ||
    risk === "LOW"
  ) {
    return risk;
  }

  // Unknown risk is treated as HIGH for safety.
  return "HIGH";
}

async function validateMediaFile(filePath, label) {
  if (!isNonEmptyString(filePath)) {
    return {
      valid: false,
      error: `${label} file path is required.`
    };
  }

  const resolvedPath = path.resolve(filePath);

  try {
    const stats = await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error: `${label} is not a file.`
      };
    }

    if (stats.size <= 0) {
      return {
        valid: false,
        error: `${label} file is empty.`
      };
    }

    return {
      valid: true,
      path: resolvedPath,
      sizeBytes: stats.size
    };
  } catch {
    return {
      valid: false,
      error: `${label} file does not exist.`
    };
  }
}

async function validateCaptionFile(captionFile) {
  if (
    captionFile === null ||
    captionFile === undefined ||
    captionFile === ""
  ) {
    return {
      valid: true,
      enabled: false
    };
  }

  if (!isNonEmptyString(captionFile)) {
    return {
      valid: false,
      error: "Caption file must be a valid SRT file path."
    };
  }

  const resolvedPath = path.resolve(captionFile);

  const extension = path
    .extname(resolvedPath)
    .toLowerCase();

  if (extension !== ".srt") {
    return {
      valid: false,
      error: "Caption file must use the .srt format."
    };
  }

  try {
    const stats = await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error: "Caption file is not a file."
      };
    }

    if (stats.size <= 0) {
      return {
        valid: false,
        error: "Caption file is empty."
      };
    }

    return {
      valid: true,
      enabled: true,
      path: resolvedPath,
      sizeBytes: stats.size
    };
  } catch {
    return {
      valid: false,
      error: "Caption file does not exist."
    };
  }
}

function validateFinalRenderResult(result) {
  const errors = [];

  if (
    !result ||
    result.success !== true
  ) {
    errors.push(
      "Final renderer did not return success."
    );

    return {
      valid: false,
      errors
    };
  }

  if (!isNonEmptyString(result.outputFile)) {
    errors.push(
      "Final renderer returned no output file."
    );
  }

  const duration = Number(
    result.durationSeconds
  );

  if (
    !Number.isFinite(duration) ||
    duration < 20 ||
    duration > 59
  ) {
    errors.push(
      "Final video duration must be between 20 and 59 seconds."
    );
  }

  const width = Number(
    result.resolution?.width ||
    result.width
  );

  const height = Number(
    result.resolution?.height ||
    result.height
  );

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    errors.push(
      "Final video resolution could not be verified."
    );
  } else if (
    width !== 1080 ||
    height !== 1920
  ) {
    errors.push(
      "Final video must be 1080x1920."
    );
  }

  const videoCodec = String(
    result.videoCodec ||
    result.video?.codec ||
    ""
  ).toLowerCase();

  if (!videoCodec) {
    errors.push(
      "Final video codec could not be verified."
    );
  } else if (videoCodec !== "h264") {
    errors.push(
      "Final video codec must be H.264."
    );
  }

  const audioCodec = String(
    result.audioCodec ||
    result.audio?.codec ||
    ""
  ).toLowerCase();

  if (!audioCodec) {
    errors.push(
      "Final audio codec could not be verified."
    );
  } else if (audioCodec !== "aac") {
    errors.push(
      "Final audio codec must be AAC."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Central production controller.
 *
 * Final publishing architecture:
 *
 * FINAL MEDIA
 *     ↓
 * QA
 *     ↓
 * UPLOAD GUARD
 *     ↓
 * PUBLISH GATE
 *     ↓
 * LOW = Auto policy when allowed
 * MEDIUM = CEO Review
 * HIGH = CEO Review
 * STOP / EMERGENCY = Block
 *     ↓
 * YOUTUBE
 */
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
    errors.push(
      "Topic is required."
    );
  }

  if (!cleanText(script)) {
    errors.push(
      "Script is required."
    );
  }

  if (!cleanText(finalVideoFile)) {
    errors.push(
      "Final video file is required."
    );
  }

  if (errors.length > 0) {
    return {
      success: false,
      status: "CONTROLLER_BLOCKED",
      errors
    };
  }

  const normalizedRisk =
    normalizeRiskLevel(riskLevel);

  const finalMedia =
    await validateMediaFile(
      finalVideoFile,
      "Final video"
    );

  if (!finalMedia.valid) {
    return {
      success: false,
      status: "FINAL_VIDEO_INVALID",
      errors: [
        finalMedia.error
      ],
      riskLevel: normalizedRisk
    };
  }

  /*
   * Create the production manifest.
   *
   * The manifest's estimated duration is
   * planning information only.
   *
   * Actual generated media remains authoritative.
   */
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

  if (!manifest || manifest.success !== true) {
    return {
      success: false,
      status: "MANIFEST_FAILED",
      errors:
        manifest?.errors || [
          "Production manifest failed."
        ],
      riskLevel: normalizedRisk
    };
  }

  /*
   * QA is mandatory.
   *
   * No YouTube Upload Guard job is created
   * unless the complete QA pipeline passes.
   */
  const qa =
    await runShortQualityPipeline({
      manifest,
      finalVideoFile: finalMedia.path
    });

  if (!qa || qa.passed !== true) {
    return {
      success: false,
      status: "QA_BLOCKED",
      productionId: manifest.id,
      riskLevel: normalizedRisk,
      manifest,
      qa
    };
  }

  /*
   * Upload Guard runs only after QA.
   *
   * Upload Guard checks:
   * - final media
   * - metadata
   * - duplicate protection
   * - copyright protection
   * - system state
   * - upload requirements
   */
  const uploadJob =
    createYouTubeUploadJob({
      manifest,
      qaResult: qa,
      videoFile: finalMedia.path,
      title,
      description,
      tags,
      privacyStatus
    });

  if (
    !uploadJob ||
    uploadJob.success !== true
  ) {
    return {
      success: false,
      status: "UPLOAD_JOB_BLOCKED",
      productionId: manifest.id,
      riskLevel: normalizedRisk,
      manifest,
      qa,
      uploadJob
    };
  }

  /*
   * FINAL PUBLISH GATE
   *
   * LOW:
   *   May auto-publish only when system policy allows it.
   *
   * MEDIUM:
   *   CEO Review required.
   *
   * HIGH:
   *   CEO Review required.
   *
   * STOP / Emergency Stop:
   *   Blocked by Publish Gate.
   *
   * IMPORTANT:
   * HIGH is NOT automatically rejected here.
   * It is routed to CEO review.
   */
  const publishDecision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel: normalizedRisk,
      requiresCEOApproval:
        requiresCEOApproval === true
    });

  if (!publishDecision) {
    return {
      success: false,
      status: "PUBLISH_GATE_FAILED",
      productionId: manifest.id,
      riskLevel: normalizedRisk,
      manifest,
      qa,
      uploadJob,
      publishDecision: null
    };
  }

  /*
   * A CEO Review decision is a valid pipeline
   * state even though publishing is not yet authorized.
   *
   * Therefore:
   *
   * CEO_REVIEW / PENDING
   *     = stop before YouTube
   *
   * PUBLISH_AUTHORIZED
   *     = uploader may proceed
   *
   * BLOCKED
   *     = uploader must not proceed
   */
  const decisionStatus =
    String(
      publishDecision.status || ""
    )
      .trim()
      .toUpperCase();

  const allowed =
    publishDecision.allowed === true;

  const isCEOReview =
    decisionStatus === "CEO_REVIEW" ||
    decisionStatus === "CEO_APPROVAL_REQUIRED" ||
    decisionStatus === "PENDING_CEO_APPROVAL" ||
    decisionStatus === "REVIEW_REQUIRED";

  const isBlocked =
    decisionStatus === "BLOCKED" ||
    decisionStatus === "PUBLISH_BLOCKED" ||
    decisionStatus === "STOPPED";

  if (isBlocked) {
    return {
      success: false,
      status:
        publishDecision.status ||
        "PUBLISH_BLOCKED",
      productionId: manifest.id,
      topic: cleanText(topic),
      riskLevel: normalizedRisk,
      manifest,
      qa,
      uploadJob,
      publishDecision,
      createdAt:
        new Date().toISOString()
    };
  }

  if (isCEOReview && !allowed) {
    return {
      success: false,
      status:
        publishDecision.status ||
        "CEO_REVIEW",
      productionId: manifest.id,
      topic: cleanText(topic),
      riskLevel: normalizedRisk,
      requiresCEOApproval: true,
      manifest,
      qa,
      uploadJob,
      publishDecision,
      nextStage: "CEO_APPROVAL",
      createdAt:
        new Date().toISOString()
    };
  }

  /*
   * Only an explicitly authorized publish
   * may continue toward YouTube.
   */
  if (!allowed) {
    return {
      success: false,
      status:
        publishDecision.status ||
        "PUBLISH_NOT_AUTHORIZED",
      productionId: manifest.id,
      topic: cleanText(topic),
      riskLevel: normalizedRisk,
      manifest,
      qa,
      uploadJob,
      publishDecision,
      createdAt:
        new Date().toISOString()
    };
  }

  return {
    success: true,

    status:
      publishDecision.status ||
      "PUBLISH_AUTHORIZED",

    productionId:
      manifest.id,

    topic:
      cleanText(topic),

    riskLevel:
      normalizedRisk,

    requiresCEOApproval:
      requiresCEOApproval === true,

    manifest,

    qa,

    uploadJob,

    publishDecision,

    nextStage:
      "YOUTUBE",

    createdAt:
      new Date().toISOString()
  };
}

/**
 * Build final Short from actual video + voice + captions.
 */
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

  const videoValidation =
    await validateMediaFile(
      videoFile,
      "Video"
    );

  if (!videoValidation.valid) {
    return {
      success: false,
      status: "VIDEO_FILE_INVALID",
      errors: [
        videoValidation.error
      ]
    };
  }

  const audioValidation =
    await validateMediaFile(
      audioFile,
      "Audio"
    );

  if (!audioValidation.valid) {
    return {
      success: false,
      status: "AUDIO_FILE_INVALID",
      errors: [
        audioValidation.error
      ]
    };
  }

  const captionValidation =
    await validateCaptionFile(
      captionFile
    );

  if (!captionValidation.valid) {
    return {
      success: false,
      status: "CAPTION_FILE_INVALID",
      errors: [
        captionValidation.error
      ]
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const result =
    await renderFinalShort({
      videoFile:
        videoValidation.path,

      audioFile:
        audioValidation.path,

      captionFile:
        captionValidation.enabled
          ? captionValidation.path
          : null,

      title,

      outputDir
    });

  if (
    !result ||
    result.success !== true
  ) {
    return {
      success: false,
      status:
        result?.status ||
        "FINAL_RENDER_FAILED",
      error:
        result?.error ||
        "Final Short could not be created.",
      details:
        result
    };
  }

  const renderValidation =
    validateFinalRenderResult(
      result
    );

  if (!renderValidation.valid) {
    return {
      success: false,
      status:
        "FINAL_RENDER_VALIDATION_FAILED",
      errors:
        renderValidation.errors,
      details:
        result
    };
  }

  const finalOutput =
    await validateMediaFile(
      result.outputFile,
      "Final output"
    );

  if (!finalOutput.valid) {
    return {
      success: false,
      status:
        "FINAL_OUTPUT_INVALID",
      error:
        finalOutput.error,
      details:
        result
    };
  }

  const captions =
    result.captions || {};

  const captionsBurnedIn =
    captions.burnedIntoVideo === true ||
    captions.burnedIn === true ||
    captionsBurnedInFromResult(result);

  return {
    success: true,

    status:
      result.status ||
      "FINAL_SHORT_READY",

    outputFile:
      finalOutput.path,

    sizeBytes:
      finalOutput.sizeBytes,

    durationSeconds:
      result.durationSeconds,

    resolution:
      result.resolution,

    videoCodec:
      result.videoCodec,

    audioCodec:
      result.audioCodec,

    pixelFormat:
      result.pixelFormat,

    captions: {
      enabled:
        captionValidation.enabled,

      burnedIntoVideo:
        captionsBurnedIn,

      sourceFile:
        captionValidation.enabled
          ? captionValidation.path
          : null
    },

    createdAt:
      result.createdAt ||
      new Date().toISOString()
  };
}

function captionsBurnedInFromResult(result) {
  return (
    result.captions?.burnedIntoVideo === true ||
    result.captions?.burnedIn === true
  );
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

    status:
      "READY",

    pipeline: [
      "TOPIC",
      "SCRIPT",
      "VOICE",
      "VISUALS",
      "VIDEO",
      "CAPTIONS",
      "MEDIA_VALIDATION",
      "FINAL_RENDER",
      "FINAL_OUTPUT_VALIDATION",
      "QUALITY_ASSURANCE",
      "UPLOAD_GUARD",
      "CEO_PUBLISH_GATE",
      "YOUTUBE"
    ],

    finalRender: {
      configured: true,

      renderer:
        "finalShortRenderer",

      captionSupport:
        true,

      captionFormat:
        "SRT",

      captionMode:
        "OPTIONAL_BURN_IN"
    },

    validation: [
      "video file existence",
      "audio file existence",
      "caption file validation",
      "final output existence",
      "final output duration",
      "final output resolution",
      "final output video codec",
      "final output audio codec"
    ],

    safetyGates: [
      "QA_REQUIRED",
      "RISK_CHECK_REQUIRED",
      "HIGH_RISK_CEO_REVIEW",
      "MEDIUM_RISK_CEO_REVIEW",
      "LOW_RISK_AUTO_POLICY",
      "CEO_APPROVAL_POLICY",
      "EMERGENCY_STOP"
    ],

    publishingOrder: [
      "FINAL_MEDIA",
      "QA",
      "UPLOAD_GUARD",
      "PUBLISH_GATE",
      "LOW_AUTO_OR_CEO_REVIEW",
      "YOUTUBE"
    ],

    riskPolicy: {
      low:
        "AUTO_PUBLISH_WHEN_POLICY_ALLOWS",

      medium:
        "CEO_REVIEW_REQUIRED",

      high:
        "CEO_REVIEW_REQUIRED",

      stop:
        "BLOCKED",

      emergencyStop:
        "BLOCKED"
    },

    message:
      "Central Short Production Controller validates final media, requires QA before Upload Guard, routes all publishing decisions through the YouTube Publish Gate, sends MEDIUM and HIGH risk content to CEO review, and allows YouTube only after explicit publish authorization."
  };
}

export default {
  prepareShortForPublishing,
  buildFinalShort,
  prepareShortFinalRender,
  getShortProductionControllerStatus
};