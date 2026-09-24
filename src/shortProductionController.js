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

async function validateMediaFile(
  filePath,
  label
) {
  if (!isNonEmptyString(filePath)) {
    return {
      valid: false,
      error:
        `${label} file path is required.`
    };
  }

  const resolvedPath =
    path.resolve(filePath);

  try {
    const stats =
      await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error:
          `${label} is not a file.`
      };
    }

    if (stats.size <= 0) {
      return {
        valid: false,
        error:
          `${label} file is empty.`
      };
    }

    return {
      valid: true,
      path: resolvedPath,
      sizeBytes:
        stats.size
    };
  } catch {
    return {
      valid: false,
      error:
        `${label} file does not exist.`
    };
  }
}

async function validateCaptionFile(
  captionFile
) {
  if (captionFile === null) {
    return {
      valid: true,
      enabled: false
    };
  }

  if (!isNonEmptyString(captionFile)) {
    return {
      valid: false,
      error:
        "Caption file must be a valid SRT file path."
    };
  }

  const resolvedPath =
    path.resolve(captionFile);

  const extension =
    path.extname(
      resolvedPath
    ).toLowerCase();

  if (extension !== ".srt") {
    return {
      valid: false,
      error:
        "Caption file must use the .srt format."
    };
  }

  try {
    const stats =
      await fs.stat(resolvedPath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error:
          "Caption file is not a file."
      };
    }

    if (stats.size <= 0) {
      return {
        valid: false,
        error:
          "Caption file is empty."
      };
    }

    return {
      valid: true,
      enabled: true,
      path: resolvedPath,
      sizeBytes:
        stats.size
    };
  } catch {
    return {
      valid: false,
      error:
        "Caption file does not exist."
    };
  }
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
      status:
        "CONTROLLER_BLOCKED",
      errors
    };
  }

  const finalMedia =
    await validateMediaFile(
      finalVideoFile,
      "Final video"
    );

  if (!finalMedia.valid) {
    return {
      success: false,
      status:
        "FINAL_VIDEO_INVALID",
      errors: [
        finalMedia.error
      ]
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
      status:
        "MANIFEST_FAILED",
      errors:
        manifest.errors || [
          "Production manifest failed."
        ]
    };
  }

  const qa =
    await runShortQualityPipeline({
      manifest,
      finalVideoFile:
        finalMedia.path
    });

  if (!qa?.passed) {
    return {
      success: false,
      status:
        "QA_BLOCKED",
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
        finalMedia.path,
      title,
      description,
      tags,
      privacyStatus
    });

  if (!uploadJob.success) {
    return {
      success: false,
      status:
        "UPLOAD_JOB_BLOCKED",
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
      status:
        "INVALID_MEDIA",
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
      status:
        "VIDEO_FILE_INVALID",
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
      status:
        "AUDIO_FILE_INVALID",
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
      status:
        "CAPTION_FILE_INVALID",
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

  if (!result?.success) {
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

  if (
    !isNonEmptyString(
      result.outputFile
    )
  ) {
    return {
      success: false,
      status:
        "FINAL_OUTPUT_MISSING",
      error:
        "Final renderer returned success without an output file.",
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

  return {
    success: true,

    status:
      result.status ||
      "FINAL_SHORT_READY",

    outputFile:
      finalOutput.path,

    sizeBytes:
      finalOutput.sizeBytes,

    captions:
      result.captions || {
        enabled:
          captionValidation.enabled,

        burnedIntoVideo:
          captionValidation.enabled
      },

    createdAt:
      result.createdAt ||
      new Date().toISOString()
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
      "UPLOAD_AUTHORIZATION",
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
      "final output validation"
    ],

    safetyGates: [
      "QA_REQUIRED",
      "RISK_CHECK_REQUIRED",
      "CEO_APPROVAL_POLICY",
      "EMERGENCY_STOP"
    ],

    message:
      "Central Short production controller validates media, renders the final Short, validates the final output, and sends only QA-approved media toward publishing."
  };
}

export default {
  prepareShortForPublishing,
  buildFinalShort,
  prepareShortFinalRender,
  getShortProductionControllerStatus
};