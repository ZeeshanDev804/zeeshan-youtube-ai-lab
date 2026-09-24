import fs from "fs";

import config from "./config.js";

import {
  canPublishAfterQA
} from "./shortQualityPipeline.js";

const VALID_PRIVACY = [
  "private",
  "unlisted",
  "public"
];

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS = 30;

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

  return "MEDIUM";
}

function isEmergencyStopActive() {
  return (
    config.system.emergencyStop === true
  );
}

function getSystemMode() {
  return cleanText(
    config.system.mode || "REVIEW"
  ).toUpperCase();
}

function hasYouTubeCredentials() {
  return Boolean(
    isNonEmptyString(
      config.youtube.clientId
    ) &&
    isNonEmptyString(
      config.youtube.clientSecret
    ) &&
    isNonEmptyString(
      config.youtube.refreshToken
    )
  );
}

function validateVideoFile(videoFile) {
  if (!isNonEmptyString(videoFile)) {
    return {
      valid: false,
      error:
        "Final video file is required."
    };
  }

  if (!fs.existsSync(videoFile)) {
    return {
      valid: false,
      error:
        "Final video file does not exist."
    };
  }

  let stats;

  try {
    stats =
      fs.statSync(videoFile);
  } catch {
    return {
      valid: false,
      error:
        "Final video file could not be inspected."
    };
  }

  if (!stats.isFile()) {
    return {
      valid: false,
      error:
        "Final video path is not a file."
    };
  }

  if (stats.size <= 0) {
    return {
      valid: false,
      error:
        "Final video file is empty."
    };
  }

  return {
    valid: true,
    sizeBytes: stats.size
  };
}

function validateMetadata({
  title,
  description = "",
  tags = []
} = {}) {
  const errors = [];

  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description);

  if (!cleanTitle) {
    errors.push(
      "YouTube title is required."
    );
  }

  if (
    cleanTitle.length >
    MAX_TITLE_LENGTH
  ) {
    errors.push(
      "YouTube title must be 100 characters or less."
    );
  }

  if (
    cleanDescription.length >
    MAX_DESCRIPTION_LENGTH
  ) {
    errors.push(
      "YouTube description is too long."
    );
  }

  if (!Array.isArray(tags)) {
    errors.push(
      "YouTube tags must be an array."
    );
  }

  const cleanTags =
    Array.isArray(tags)
      ? tags
          .map(cleanText)
          .filter(Boolean)
      : [];

  if (
    cleanTags.length >
    MAX_TAGS
  ) {
    errors.push(
      `YouTube tags cannot contain more than ${MAX_TAGS} tags.`
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    title:
      cleanTitle,

    description:
      cleanDescription,

    tags:
      cleanTags.slice(
        0,
        MAX_TAGS
      )
  };
}

function validatePrivacy(
  privacyStatus
) {
  const privacy =
    cleanText(
      privacyStatus ||
        config.youtube.privacyStatus ||
        "private"
    ).toLowerCase();

  if (
    !VALID_PRIVACY.includes(
      privacy
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid YouTube privacy status."
    };
  }

  return {
    valid: true,
    privacyStatus:
      privacy
  };
}

function validateManifest(
  manifest
) {
  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    return {
      valid: false,
      error:
        "Production manifest is required."
    };
  }

  if (
    !isNonEmptyString(
      manifest.id
    )
  ) {
    return {
      valid: false,
      error:
        "Production manifest ID is required."
    };
  }

  return {
    valid: true
  };
}

function validateRisk({
  riskLevel = "LOW",
  safetyResult = null
} = {}) {
  const risk =
    normalizeRisk(
      safetyResult?.riskLevel ||
      riskLevel
    );

  /*
   * IMPORTANT:
   * HIGH risk is NOT automatically rejected here.
   *
   * It must go to the CEO review/publish gate.
   * This guard only records the risk level.
   */
  return {
    allowed: true,
    riskLevel: risk,
    requiresCEOReview:
      risk === "MEDIUM" ||
      risk === "HIGH"
  };
}

function validateDuplicateResult(
  duplicateResult
) {
  if (!duplicateResult) {
    return {
      allowed: true,
      status:
        "NOT_PROVIDED"
    };
  }

  const status =
    cleanText(
      duplicateResult.status ||
      duplicateResult.result ||
      ""
    ).toUpperCase();

  if (
    status === "BLOCK" ||
    status === "EXACT"
  ) {
    return {
      allowed: false,
      status,
      reason:
        "Duplicate content protection blocked this upload."
    };
  }

  if (
    status === "REVIEW" ||
    status === "SIMILAR"
  ) {
    return {
      allowed: false,
      status,
      reason:
        "Duplicate content requires review before upload."
    };
  }

  return {
    allowed: true,
    status:
      status || "PASS"
  };
}

function validateCopyrightResult(
  copyrightResult
) {
  if (!copyrightResult) {
    return {
      allowed: true,
      status:
        "NOT_PROVIDED"
    };
  }

  const status =
    cleanText(
      copyrightResult.status ||
      copyrightResult.result ||
      ""
    ).toUpperCase();

  if (
    status === "BLOCK" ||
    status === "HIGH"
  ) {
    return {
      allowed: false,
      status,
      reason:
        "Copyright protection blocked this upload."
    };
  }

  if (
    status === "REVIEW" ||
    status === "MEDIUM"
  ) {
    return {
      allowed: false,
      status,
      reason:
        "Copyright review is required before upload."
    };
  }

  return {
    allowed: true,
    status:
      status || "PASS"
  };
}

function validateSystemState() {
  if (
    isEmergencyStopActive()
  ) {
    return {
      allowed: false,
      reason:
        "Emergency Stop is active."
    };
  }

  if (
    getSystemMode() === "STOP"
  ) {
    return {
      allowed: false,
      reason:
        "System mode is STOP."
    };
  }

  return {
    allowed: true
  };
}

export function createYouTubeUploadJob({
  manifest,
  qaResult,
  videoFile,
  title,
  description = "",
  tags = [],
  privacyStatus,
  categoryId,
  riskLevel = "LOW",
  safetyResult = null,
  duplicateResult = null,
  copyrightResult = null
} = {}) {
  const errors = [];

  const manifestCheck =
    validateManifest(
      manifest
    );

  if (!manifestCheck.valid) {
    errors.push(
      manifestCheck.error
    );
  }

  const videoCheck =
    validateVideoFile(
      videoFile
    );

  if (!videoCheck.valid) {
    errors.push(
      videoCheck.error
    );
  }

  const systemCheck =
    validateSystemState();

  if (!systemCheck.allowed) {
    errors.push(
      systemCheck.reason
    );
  }

  const qaAuthorization =
    canPublishAfterQA(
      qaResult
    );

  if (
    !qaAuthorization.allowed
  ) {
    errors.push(
      qaAuthorization.reason
    );
  }

  const metadata =
    validateMetadata({
      title,
      description,
      tags
    });

  if (!metadata.valid) {
    errors.push(
      ...metadata.errors
    );
  }

  const privacy =
    validatePrivacy(
      privacyStatus
    );

  if (!privacy.valid) {
    errors.push(
      privacy.error
    );
  }

  const finalCategoryId =
    categoryId ||
    config.youtube.categoryId ||
    "22";

  if (
    !String(finalCategoryId).trim()
  ) {
    errors.push(
      "YouTube category ID is required."
    );
  }

  const riskCheck =
    validateRisk({
      riskLevel,
      safetyResult
    });

  const duplicateCheck =
    validateDuplicateResult(
      duplicateResult
    );

  if (!duplicateCheck.allowed) {
    errors.push(
      duplicateCheck.reason
    );
  }

  const copyrightCheck =
    validateCopyrightResult(
      copyrightResult
    );

  if (!copyrightCheck.allowed) {
    errors.push(
      copyrightCheck.reason
    );
  }

  if (errors.length > 0) {
    return {
      success: false,

      status:
        "UPLOAD_BLOCKED",

      errors,

      checks: {
        qaPassed:
          qaAuthorization.allowed,

        videoValid:
          videoCheck.valid,

        riskLevel:
          riskCheck.riskLevel,

        requiresCEOReview:
          riskCheck.requiresCEOReview,

        duplicateStatus:
          duplicateCheck.status,

        copyrightStatus:
          copyrightCheck.status,

        systemAllowed:
          systemCheck.allowed
      }
    };
  }

  return {
    success: true,

    status:
      "UPLOAD_READY",

    productionId:
      manifest.id,

    videoFile,

    metadata: {
      title:
        metadata.title,

      description:
        metadata.description,

      tags:
        metadata.tags,

      categoryId:
        String(finalCategoryId)
    },

    privacyStatus:
      privacy.privacyStatus,

    authorization: {
      qaPassed: true,

      videoValidated: true,

      uploadAllowed: true,

      riskLevel:
        riskCheck.riskLevel,

      requiresCEOReview:
        riskCheck.requiresCEOReview,

      duplicateCheck:
        duplicateCheck.status,

      copyrightCheck:
        copyrightCheck.status,

      systemMode:
        getSystemMode(),

      emergencyStop:
        false
    },

    youtubeCredentialsConfigured:
      hasYouTubeCredentials(),

    nextStage:
      riskCheck.requiresCEOReview
        ? "CEO_PUBLISH_GATE"
        : "YOUTUBE_OAUTH_UPLOAD",

    createdAt:
      new Date().toISOString()
  };
}

export function canUploadToYouTube(
  uploadJob
) {
  if (
    !uploadJob ||
    uploadJob.success !== true ||
    uploadJob.status !==
      "UPLOAD_READY"
  ) {
    return {
      allowed: false,

      reason:
        "YouTube upload job is not authorized."
    };
  }

  const systemCheck =
    validateSystemState();

  if (!systemCheck.allowed) {
    return {
      allowed: false,

      reason:
        systemCheck.reason
    };
  }

  /*
   * CEO approval is intentionally NOT checked here.
   *
   * publishGate.js owns the final CEO decision.
   */
  return {
    allowed: true,

    reason:
      "Upload job passed technical and safety upload checks."
  };
}

export function getYouTubeUploadGuardStatus() {
  return {
    configured: true,

    status:
      "READY",

    checks: [
      "production manifest",
      "final video exists",
      "video QA",
      "title",
      "description",
      "tags",
      "privacy status",
      "category ID",
      "risk level",
      "duplicate protection",
      "copyright protection",
      "system mode",
      "Emergency Stop"
    ],

    defaultPrivacy:
      config.youtube.privacyStatus ||
      "private",

    publishGate:
      "CEO_PUBLISH_GATE",

    youtubeCredentials:
      hasYouTubeCredentials(),

    systemMode:
      getSystemMode(),

    emergencyStop:
      isEmergencyStopActive(),

    message:
      "YouTube upload authorization gate is ready. Final CEO approval is handled by publishGate.js."
  };
}