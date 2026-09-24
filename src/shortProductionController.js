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

function normalizeRiskLevel(
  value = "LOW"
) {
  const risk =
    String(value)
      .trim()
      .toUpperCase();

  if (
    risk === "HIGH" ||
    risk === "MEDIUM" ||
    risk === "LOW"
  ) {
    return risk;
  }

  return "HIGH";
}

async function validateMediaFile(
  filePath,
  label
) {
  if (
    !isNonEmptyString(
      filePath
    )
  ) {
    return {
      valid: false,

      error:
        `${label} file path is required.`
    };
  }

  const resolvedPath =
    path.resolve(
      filePath
    );

  try {
    const stats =
      await fs.stat(
        resolvedPath
      );

    if (
      !stats.isFile()
    ) {
      return {
        valid: false,

        error:
          `${label} is not a file.`
      };
    }

    if (
      stats.size <= 0
    ) {
      return {
        valid: false,

        error:
          `${label} file is empty.`
      };
    }

    return {
      valid: true,

      path:
        resolvedPath,

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

  if (
    !isNonEmptyString(
      captionFile
    )
  ) {
    return {
      valid: false,

      error:
        "Caption file must be a valid SRT file path."
    };
  }

  const resolvedPath =
    path.resolve(
      captionFile
    );

  const extension =
    path.extname(
      resolvedPath
    ).toLowerCase();

  if (
    extension !== ".srt"
  ) {
    return {
      valid: false,

      error:
        "Caption file must use the .srt format."
    };
  }

  try {
    const stats =
      await fs.stat(
        resolvedPath
      );

    if (
      !stats.isFile()
    ) {
      return {
        valid: false,

        error:
          "Caption file is not a file."
      };
    }

    if (
      stats.size <= 0
    ) {
      return {
        valid: false,

        error:
          "Caption file is empty."
      };
    }

    return {
      valid: true,

      enabled: true,

      path:
        resolvedPath,

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

function validateFinalRenderResult(
  result
) {
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

  if (
    !isNonEmptyString(
      result.outputFile
    )
  ) {
    errors.push(
      "Final renderer returned no output file."
    );
  }

  const duration =
    Number(
      result.durationSeconds
    );

  if (
    Number.isFinite(duration) &&
    (
      duration < 20 ||
      duration > 59
    )
  ) {
    errors.push(
      "Final video duration must be between 20 and 59 seconds."
    );
  }

  const width =
    Number(
      result.resolution?.width ||
      result.width
    );

  const height =
    Number(
      result.resolution?.height ||
      result.height
    );

  if (
    Number.isFinite(width) &&
    Number.isFinite(height)
  ) {
    if (
      width !== 1080 ||
      height !== 1920
    ) {
      errors.push(
        "Final video must be 1080x1920."
      );
    }
  }

  const videoCodec =
    String(
      result.videoCodec ||
      result.video?.codec ||
      ""
    ).toLowerCase();

  if (
    videoCodec &&
    videoCodec !== "h264"
  ) {
    errors.push(
      "Final video codec must be H.264."
    );
  }

  const audioCodec =
    String(
      result.audioCodec ||
      result.audio?.codec ||
      ""
    ).toLowerCase();

  if (
    audioCodec &&
    audioCodec !== "aac"
  ) {
    errors.push(
      "Final audio codec must be AAC."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

export async function prepareShortForPublishing({
  topic,
  script,
  title = "",
  description = "",
  tags = [],
  language = "en-US",
  voice = "default",
  visualProvider =
    "not_configured",
  finalVideoFile,
  riskLevel = "LOW",
  requiresCEOApproval = true,
  privacyStatus = "private"
} = {}) {
  const errors = [];

  if (
    !cleanText(topic)
  ) {
    errors.push(
      "Topic is required."
    );
  }

  if (
    !cleanText(script)
  ) {
    errors.push(
      "Script is required."
    );
  }

  if (
    !cleanText(
      finalVideoFile
    )
  ) {
    errors.push(
      "Final video file is required."
    );
  }

  if (
    errors.length > 0
  ) {
    return {
      success: false,

      status:
        "CONTROLLER_BLOCKED",

      errors
    };
  }

  const normalizedRisk =
    normalizeRiskLevel(
      riskLevel
    );

  /*
   * Unknown/invalid risk is treated
   * as HIGH for safety.
   */
  if (
    normalizedRisk === "HIGH"
  ) {
    return {
      success: false,

      status:
        "RISK_LEVEL_BLOCKED",

      errors: [
        "HIGH risk content cannot proceed directly to publishing."
      ],

      riskLevel:
        normalizedRisk
    };
  }

  const finalMedia =
    await validateMediaFile(
      finalVideoFile,
      "Final video"
    );

  if (
    !finalMedia.valid
  ) {
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

  if (
    !manifest.success
  ) {
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

  /*
   * QA is mandatory.
   *
   * No upload job is created unless
   * the complete QA pipeline passes.
   */
  const qa =
    await runShortQualityPipeline({
      manifest,

      finalVideoFile:
        finalMedia.path
    });

  if (
    !qa ||
    qa.passed !== true
  ) {
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

  /*
   * Upload Guard runs only after QA.
   */
  const uploadJob =
    createYouTubeUploadJob({
      manifest,

      qaResult:
        qa,

      videoFile:
        finalMedia.path,

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

      status:
        "UPLOAD_JOB_BLOCKED",

      productionId:
        manifest.id,

      manifest,

      qa,

      uploadJob
    };
  }

  /*
   * Final YouTube Publish Gate.
   */
  const publishDecision =
    evaluateYouTubePublish({
      uploadJob,

      riskLevel:
        normalizedRisk,

      requiresCEOApproval:
        requiresCEOApproval === true
    });

  if (
    !publishDecision
  ) {
    return {
      success: false,

      status:
        "PUBLISH_GATE_FAILED",

      productionId:
        manifest.id,

      manifest,

      qa,

      uploadJob,

      publishDecision
    };
  }

  return {
    success:
      publishDecision.allowed === true,

    status:
      publishDecision.status,

    productionId:
      manifest.id,

    topic:
      cleanText(topic),

    riskLevel:
      normalizedRisk,

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
  outputDir =
    "./storage/final"
} = {}) {
  const errors = [];

  if (
    !isNonEmptyString(
      videoFile
    )
  ) {
    errors.push(
      "Video file is required."
    );
  }

  if (
    !isNonEmptyString(
      audioFile
    )
  ) {
    errors.push(
      "Audio file is required."
    );
  }

  if (
    errors.length > 0
  ) {
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

  if (
    !videoValidation.valid
  ) {
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

  if (
    !audioValidation.valid
  ) {
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

  if (
    !captionValidation.valid
  ) {
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

  if (
    !renderValidation.valid
  ) {
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

  if (
    !finalOutput.valid
  ) {
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
    captions.burnedIntoVideo ===
      true ||
    captionsBurnedInFromResult(
      result
    );

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

function captionsBurnedInFromResult(
  result
) {
  return (
    result.captions?.burnedIntoVideo ===
      true ||
    result.captions?.burnedIn ===
      true
  );
}

export async function prepareShortFinalRender({
  videoFile,
  audioFile,
  captionFile = null,
  title = "",
  outputDir =
    "./storage/final"
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
      "final output existence",
      "final output duration",
      "final output resolution",
      "final output video codec",
      "final output audio codec"
    ],

    safetyGates: [
      "QA_REQUIRED",
      "RISK_CHECK_REQUIRED",
      "HIGH_RISK_BLOCK",
      "CEO_APPROVAL_POLICY",
      "EMERGENCY_STOP"
    ],

    publishingOrder: [
      "FINAL_MEDIA",
      "QA",
      "UPLOAD_GUARD",
      "PUBLISH_GATE",
      "YOUTUBE"
    ],

    message:
      "Central Short Production Controller validates final media, requires QA before upload authorization, applies the YouTube publish gate, and prevents unsafe final media from reaching publishing."
  };
}

export default {
  prepareShortForPublishing,

  buildFinalShort,

  prepareShortFinalRender,

  getShortProductionControllerStatus
};