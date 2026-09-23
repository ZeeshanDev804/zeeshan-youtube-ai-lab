import {
  checkFinalShortQuality
} from "./finalShortQAPipeline.js";

import {
  createYouTubeUploadJob
} from "./youtubeUploadGuard.js";

import {
  evaluateYouTubePublish
} from "./youtubePublishGate.js";

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
    .map((tag) => cleanText(tag))
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
      status: "MANIFEST_REQUIRED",
      error:
        "Production manifest is required."
    };
  }

  if (!videoFile) {
    return {
      success: false,
      status: "VIDEO_FILE_REQUIRED",
      error:
        "Final video file is required."
    };
  }

  const qa =
    await checkFinalShortQuality({
      manifest,
      finalVideoFile:
        videoFile
    });

  if (!qa.passed) {
    return {
      success: false,
      status: "QA_BLOCKED",
      qa
    };
  }

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

  if (!uploadJob.success) {
    return {
      success: false,
      status: "UPLOAD_JOB_BLOCKED",
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

    qa,

    uploadJob,

    publishDecision,

    videoFile,

    createdAt:
      new Date().toISOString()
  };
}

export function getYouTubeProductionStatus() {
  return {
    configured: true,

    status: "READY",

    stages: [
      "FINAL_VIDEO",
      "QUALITY_ASSURANCE",
      "UPLOAD_VALIDATION",
      "RISK_CHECK",
      "CEO_APPROVAL",
      "YOUTUBE_UPLOAD"
    ],

    defaultPrivacy:
      "private",

    highRisk:
      "BLOCKED",

    mediumRisk:
      "CEO_REVIEW",

    lowRisk:
      "CEO_AUTO_PUBLISH_POLICY",

    message:
      "YouTube production pipeline is protected by QA and CEO publishing controls."
  };
}
