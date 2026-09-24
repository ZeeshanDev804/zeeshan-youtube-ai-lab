import fs from "fs";
import dotenv from "dotenv";

import {
  canPublishAfterQA
} from "./shortQualityPipeline.js";

dotenv.config();

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
  const risk = cleanText(value).toUpperCase();

  if (
    ["LOW", "MEDIUM", "HIGH"].includes(risk)
  ) {
    return risk;
  }

  return "MEDIUM";
}

function isEmergencyStopActive() {
  return (
    cleanText(
      process.env.EMERGENCY_STOP || "false"
    ).toLowerCase() === "true"
  );
}

function getSystemMode() {
  return cleanText(
    process.env.SYSTEM_MODE || "REVIEW"
  ).toUpperCase();
}

function isCEOApprovalRequired() {
  return (
    cleanText(
      process.env.CEO_APPROVAL_REQUIRED || "true"
    ).toLowerCase() === "true"
  );
}

function hasYouTubeCredentials() {
  return Boolean(
    isNonEmptyString(
      process.env.YOUTUBE_CLIENT_ID
    ) &&
    isNonEmptyString(
      process.env.YOUTUBE_CLIENT_SECRET
    ) &&
    isNonEmptyString(
      process.env.YOUTUBE_REFRESH_TOKEN
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
    stats = fs.statSync(videoFile);
  } catch (error) {
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
          .slice(0, MAX_TAGS)
      : [];

  return {
    valid:
      errors.length === 0,
    errors,
    title:
      cleanTitle,
    description:
      cleanDescription,
    tags:
      cleanTags
  };
}

function validatePrivacy(
  privacyStatus
) {
  const privacy =
    cleanText(
      privacyStatus ||
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

  if (risk === "HIGH") {
    return {
      allowed: false,
      riskLevel: risk,
      reason:
        "High-risk content cannot enter the YouTube upload stage."
    };
  }

  return {
    allowed: true,
    riskLevel: risk
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

function validateCEOAuthorization({
  ceoApproval = null,
  systemMode
} = {}) {
  if (
    systemMode === "STOP"
  ) {
    return {
      allowed: false,
      reason:
        "System mode is STOP."
    };
  }

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
    systemMode === "REVIEW" &&
    isCEOApprovalRequired()
  ) {
    const approved =
      ceoApproval === true ||
      ceoApproval?.approved === true ||
      ceoApproval?.status ===
        "APPROVED";

    if (!approved) {
      return {
        allowed: false,
        reason:
          "CEO approval is required before YouTube upload."
      };
    }
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
  privacyStatus = "private",
  categoryId = "22",
  riskLevel = "LOW",
  safetyResult = null,
  duplicateResult = null,
  copyrightResult = null,
  ceoApproval = null
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

  if (
    !categoryId ||
    !String(categoryId).trim()
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

  if (!riskCheck.allowed) {
    errors.push(
      riskCheck.reason
    );
  }

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

  const systemMode =
    getSystemMode();

  const ceoCheck =
    validateCEOAuthorization({
      ceoApproval,
      systemMode
    });

  if (!ceoCheck.allowed) {
    errors.push(
      ceoCheck.reason
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
        duplicateStatus:
          duplicateCheck.status,
        copyrightStatus:
          copyrightCheck.status,
        ceoAuthorized:
          ceoCheck.allowed
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
        String(categoryId)
    },
    privacyStatus:
      privacy.privacyStatus,
    authorization: {
      qaPassed: true,
      videoValidated: true,
      uploadAllowed: true,
      riskLevel:
        riskCheck.riskLevel,
      duplicateCheck:
        duplicateCheck.status,
      copyrightCheck:
        copyrightCheck.status,
      ceoApproved:
        true,
      systemMode
    },
    youtubeCredentialsConfigured:
      hasYouTubeCredentials(),
    nextStage:
      "YOUTUBE_OAUTH_UPLOAD",
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
    allowed: true,
    reason:
      "Upload job passed the required authorization checks."
  };
}

export function getYouTubeUploadGuardStatus() {
  return {
    configured: true,
    status: "READY",
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
      "CEO authorization",
      "Emergency Stop"
    ],
    defaultPrivacy:
      "private",
    publishGate:
      "UPLOAD_READY_REQUIRED",
    youtubeCredentials:
      hasYouTubeCredentials(),
    systemMode:
      getSystemMode(),
    emergencyStop:
      isEmergencyStopActive(),
    message:
      "YouTube upload authorization gate is ready."
  };
}