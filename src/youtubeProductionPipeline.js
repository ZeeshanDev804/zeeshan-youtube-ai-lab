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
    cleanText(finalVideoFile);

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
      qa
    };
  }

  /*
   * --------------------------------------------------
   * 2. CREATE YOUTUBE UPLOAD JOB
   * --------------------------------------------------
   */

  const uploadJob =
    createYouTubeUploadJob({
      manifest,
      qaResult: qa,
      videoFile,

      title:
        cleanText(
          title ||
          manifest?.metadata?.title ||
          ""
        ),

      description:
        cleanText(
          description ||
          manifest?.metadata?.description ||
          ""
        ),

      tags:
        normalizeTags(tags),

      privacyStatus,
      categoryId
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
      uploadJob
    };
  }

  /*
   * --------------------------------------------------
   * 3. CEO / RISK PUBLISH GATE
   * --------------------------------------------------
   */

  const publishDecision =
    evaluateYouTubePublish({
      uploadJob,
      riskLevel,
      requiresCEOApproval
    });

  /*
   * IMPORTANT:
   * Never upload unless the publish gate
   * explicitly authorizes publishing.
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
    !oauthStatus.configured
  ) {
    return {
      success: false,
      status:
        "YOUTUBE_OAUTH_NOT_CONFIGURED",

      qa,

      uploadJob,

      publishDecision,

      oauthStatus,

      videoFile,

      uploaded: false,

      message:
        "YouTube OAuth credentials are required before the video can be uploaded."
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
        cleanText(
          title ||
          manifest?.metadata?.title ||
          uploadJob?.title ||
          ""
        ),

      description:
        cleanText(
          description ||
          manifest?.metadata?.description ||
          uploadJob?.description ||
          ""
        ),

      tags:
        normalizeTags(
          tags.length
            ? tags
            : uploadJob?.tags || []
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
  const oauth =
    getYouTubeOAuthStatus();

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

    highRisk:
      "BLOCKED",

    mediumRisk:
      "CEO_REVIEW",

    lowRisk:
      "CEO_AUTO_PUBLISH_POLICY",

    oauthStatus:
      oauth.status,

    youtubeUpload:
      oauth.configured
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    message:
      "Final Shorts pass QA and CEO publishing gates before the real YouTube OAuth uploader is allowed to upload."
  };
}

export default {
  prepareShortForYouTube,
  getYouTubeProductionStatus
};