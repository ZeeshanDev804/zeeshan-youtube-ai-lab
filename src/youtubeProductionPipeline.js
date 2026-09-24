import {
  checkFinalShortQuality
} from "./finalShortQAPipeline.js";

import {
  createYouTubeUploadJob
} from "./youtubeUploadGuard.js";

import {
  evaluateYouTubePublish
} from "./youtubePublishGate.js";

import {
  uploadVideoToYouTube,
  getYouTubeOAuthStatus
} from "./youtubeOAuthUploader.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) =>
      cleanText(tag)
    )
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeRiskLevel(
  riskLevel
) {
  const normalized =
    cleanText(
      riskLevel
    ).toUpperCase();

  if (
    normalized === "HIGH"
  ) {
    return "HIGH";
  }

  if (
    normalized === "MEDIUM"
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

export async function prepareShortForYouTube({
  manifest,
  finalVideoFile,
  title,
  description = "",
  tags = [],
  privacyStatus = "private",
  categoryId = "22",
  riskLevel = "LOW",
  requiresCEOApproval = true
} = {}) {
  const videoFile =
    cleanText(
      finalVideoFile
    );

  if (!manifest) {
    return {
      success: false,
      status:
        "MANIFEST_REQUIRED",
      error:
        "Production manifest is required."
    };
  }

  if (!videoFile) {
    return {
      success: false,
      status:
        "VIDEO_FILE_REQUIRED",
      error:
        "Final video file is required."
    };
  }

  /*
   * --------------------------------------------------
   * 1. FINAL VIDEO QA
   * --------------------------------------------------
   */

  const qa =
    await checkFinalShortQuality({
      manifest,
      finalVideoFile:
        videoFile
    });

  if (
    !qa ||
    qa.passed !== true
  ) {
    return {
      success: false,
      status:
        "QA_BLOCKED",
      qa,
      videoFile,
      uploaded: false
    };
  }

  /*
   * --------------------------------------------------
   * 2. CREATE YOUTUBE UPLOAD JOB
   * --------------------------------------------------
   */

  const finalTitle =
    cleanText(
      title ||
      manifest?.metadata?.title ||
      ""
    );

  const finalDescription =
    cleanText(
      description ||
      manifest?.metadata?.description ||
      ""
    );

  const finalTags =
    normalizeTags(
      tags
    );

  const uploadJob =
    createYouTubeUploadJob({
      manifest,
      qaResult: qa,
      videoFile,

      title:
        finalTitle,

      description:
        finalDescription,

      tags:
        finalTags,

      privacyStatus:
        privacyStatus ||
        "private",

      categoryId:
        categoryId ||
        "22"
    });

  if (
    !uploadJob ||
    uploadJob.success !== true
  ) {
    return {
      success: false,
      status:
        "UPLOAD_JOB_BLOCKED",
      qa,
      uploadJob,
      videoFile,
      uploaded: false
    };
  }

  /*
   * --------------------------------------------------
   * 3. CEO / RISK PUBLISH GATE
   * --------------------------------------------------
   */

  const normalizedRisk =
    normalizeRiskLevel(
      riskLevel
    );

  const publishDecision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel:
        normalizedRisk,
      requiresCEOApproval
    });

  /*
   * IMPORTANT:
   *
   * No real YouTube upload is allowed
   * unless the central publish gate
   * explicitly authorizes it.
   */

  if (
    !publishDecision ||
    publishDecision.allowed !== true
  ) {
    return {
      success: false,

      status:
        publishDecision?.status ||
        "PUBLISH_BLOCKED",

      qa,

      uploadJob,

      publishDecision,

      riskLevel:
        normalizedRisk,

      videoFile,

      uploaded: false,

      createdAt:
        new Date().toISOString()
    };
  }

  /*
   * --------------------------------------------------
   * 4. CHECK YOUTUBE OAUTH
   * --------------------------------------------------
   */

  const oauthStatus =
    getYouTubeOAuthStatus();

  if (
    !oauthStatus ||
    oauthStatus.configured !== true
  ) {
    return {
      success: false,

      status:
        "YOUTUBE_OAUTH_NOT_CONFIGURED",

      qa,

      uploadJob,

      publishDecision,

      oauthStatus,

      riskLevel:
        normalizedRisk,

      videoFile,

      uploaded: false,

      message:
        "YouTube OAuth credentials are required before the video can be uploaded.",

      createdAt:
        new Date().toISOString()
    };
  }

  /*
   * --------------------------------------------------
   * 5. ACTUAL YOUTUBE UPLOAD
   * --------------------------------------------------
   */

  const upload =
    await uploadVideoToYouTube({
      videoFile,

      title:
        finalTitle ||
        uploadJob?.title ||
        "",

      description:
        finalDescription ||
        uploadJob?.description ||
        "",

      tags:
        finalTags.length > 0
          ? finalTags
          : normalizeTags(
              uploadJob?.tags || []
            ),

      categoryId:
        categoryId ||
        uploadJob?.categoryId ||
        "22",

      privacyStatus:
        privacyStatus ||
        uploadJob?.privacyStatus ||
        "private"
    });

  if (
    !upload ||
    upload.success !== true
  ) {
    return {
      success: false,

      status:
        "YOUTUBE_UPLOAD_FAILED",

      qa,

      uploadJob,

      publishDecision,

      oauthStatus,

      upload,

      riskLevel:
        normalizedRisk,

      videoFile,

      uploaded: false,

      createdAt:
        new Date().toISOString()
    };
  }

  /*
   * --------------------------------------------------
   * 6. FINAL SUCCESS
   * --------------------------------------------------
   */

  return {
    success: true,

    status:
      "YOUTUBE_UPLOAD_COMPLETED",

    qa,

    uploadJob,

    publishDecision,

    oauthStatus,

    riskLevel:
      normalizedRisk,

    upload: {
      success:
        upload.success,

      status:
        upload.status,

      videoId:
        upload.videoId,

      privacyStatus:
        upload.privacyStatus,

      title:
        upload.title,

      uploadedFile:
        upload.uploadedFile,

      uploadedAt:
        upload.uploadedAt
    },

    videoFile,

    uploaded: true,

    nextStage:
      "ANALYTICS",

    createdAt:
      new Date().toISOString()
  };
}

export function getYouTubeProductionStatus() {
  let oauth;

  try {
    oauth =
      getYouTubeOAuthStatus();
  } catch (error) {
    oauth = {
      configured: false,
      status: "ERROR",
      error:
        error?.message ||
        "YouTube OAuth status check failed."
    };
  }

  return {
    configured: true,

    status:
      "READY",

    stages: [
      "FINAL_VIDEO",
      "QUALITY_ASSURANCE",
      "UPLOAD_VALIDATION",
      "RISK_CHECK",
      "CEO_APPROVAL",
      "OAUTH_VALIDATION",
      "YOUTUBE_UPLOAD",
      "UPLOAD_RESULT",
      "ANALYTICS"
    ],

    defaultPrivacy:
      "private",

    /*
     * Final risk policy:
     *
     * LOW    → Auto publish when
     *           central policy allows.
     *
     * MEDIUM → CEO review required.
     *
     * HIGH   → CEO review required.
     *
     * STOP / Emergency → Blocked.
     */

    lowRisk:
      "AUTO_PUBLISH_WHEN_POLICY_ALLOWS",

    mediumRisk:
      "CEO_REVIEW_REQUIRED",

    highRisk:
      "CEO_REVIEW_REQUIRED",

    stopRisk:
      "BLOCKED",

    emergencyStop:
      "BLOCKED",

    oauthStatus:
      oauth?.status ||
      "UNKNOWN",

    youtubeUpload:
      oauth?.configured === true
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    productionUploadAllowedOnlyAfter:
      [
        "FINAL_QA_PASS",
        "UPLOAD_GUARD_PASS",
        "PUBLISH_GATE_AUTHORIZATION",
        "YOUTUBE_OAUTH"
      ],

    message:
      "Final Shorts must pass QA, Upload Guard, and the central CEO Publish Gate before the real YouTube OAuth uploader can upload."
  };
}

export default {
  prepareShortForYouTube,
  getYouTubeProductionStatus
};