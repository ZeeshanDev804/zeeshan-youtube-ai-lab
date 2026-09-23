import {
  canPublishAfterQA
} from "./shortQualityPipeline.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

const VALID_PRIVACY = [
  "private",
  "unlisted",
  "public"
];

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

  if (cleanTitle.length > 100) {
    errors.push(
      "YouTube title must be 100 characters or less."
    );
  }

  if (cleanDescription.length > 5000) {
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
          .slice(0, 30)
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

export function createYouTubeUploadJob({
  manifest,
  qaResult,
  videoFile,
  title,
  description = "",
  tags = [],
  privacyStatus = "private",
  categoryId = "22"
} = {}) {
  const errors = [];

  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    errors.push(
      "Production manifest is required."
    );
  }

  if (
    typeof videoFile !== "string" ||
    !videoFile.trim()
  ) {
    errors.push(
      "Final video file is required."
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

  if (errors.length > 0) {
    return {
      success: false,
      status: "UPLOAD_BLOCKED",
      errors
    };
  }

  return {
    success: true,
    status: "UPLOAD_READY",
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
      uploadAllowed: true
    },
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
      "final video",
      "video QA",
      "title",
      "description",
      "tags",
      "privacy status",
      "category ID"
    ],
    defaultPrivacy:
      "private",
    publishGate:
      "UPLOAD_READY_REQUIRED",
    message:
      "YouTube upload authorization gate is ready."
  };
}
