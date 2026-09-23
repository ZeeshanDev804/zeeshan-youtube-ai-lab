import {
  prepareShortForYouTube
} from "./youtubeProductionPipeline.js";

import {
  uploadVideoToYouTube
} from "./youtubeOAuthUploader.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function publishShortToYouTube({
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
  const preparation =
    await prepareShortForYouTube({
      manifest,
      finalVideoFile,
      title,
      description,
      tags,
      privacyStatus,
      categoryId,
      riskLevel,
      requiresCEOApproval
    });

  if (!preparation.success) {
    return {
      success: false,
      status:
        preparation.status,
      preparation
    };
  }

  if (
    preparation.publishDecision?.allowed !==
    true
  ) {
    return {
      success: false,
      status:
        "PUBLISH_NOT_AUTHORIZED",
      preparation
    };
  }

  const videoFile =
    cleanText(
      finalVideoFile
    );

  if (!videoFile) {
    return {
      success: false,
      status:
        "VIDEO_FILE_REQUIRED"
    };
  }

  const upload =
    await uploadVideoToYouTube({
      videoFile,
      title:
        cleanText(title),
      description:
        cleanText(description),
      tags,
      categoryId,
      privacyStatus
    });

  if (!upload.success) {
    return {
      success: false,
      status:
        "YOUTUBE_UPLOAD_FAILED",
      preparation,
      upload
    };
  }

  return {
    success: true,
    status:
      "YOUTUBE_UPLOADED",
    videoId:
      upload.videoId,
    youtubeUrl:
      upload.youtubeUrl ||
      `https://www.youtube.com/watch?v=${upload.videoId}`,
    privacyStatus,
    preparation,
    upload,
    uploadedAt:
      new Date().toISOString()
  };
}

export function getYouTubeProductionUploaderStatus() {
  return {
    configured:
      Boolean(
        process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET &&
        process.env.YOUTUBE_REFRESH_TOKEN
      ),

    status:
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    oauth:
      "Google OAuth 2.0",

    upload:
      "YouTube Data API",

    protection: [
      "QUALITY_ASSURANCE",
      "UPLOAD_GUARD",
      "RISK_CHECK",
      "CEO_APPROVAL",
      "EMERGENCY_STOP"
    ],

    message:
      "YouTube uploader can only run after all publishing gates authorize the upload."
  };
}
