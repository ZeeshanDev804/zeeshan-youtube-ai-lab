import {
  runShortQualityPipeline
} from "./shortQualityPipeline.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function checkFinalShortQuality({
  manifest,
  finalVideoFile
} = {}) {
  if (!manifest) {
    return {
      success: false,
      passed: false,
      status: "MANIFEST_REQUIRED",
      error:
        "Production manifest is required."
    };
  }

  const videoFile =
    cleanText(
      finalVideoFile
    );

  if (!videoFile) {
    return {
      success: false,
      passed: false,
      status: "VIDEO_FILE_REQUIRED",
      error:
        "Final video file is required."
    };
  }

  const qa =
    await runShortQualityPipeline({
      manifest,
      finalVideoFile:
        videoFile
    });

  if (!qa) {
    return {
      success: false,
      passed: false,
      status: "QA_NO_RESULT",
      error:
        "Quality pipeline returned no result."
    };
  }

  if (qa.passed !== true) {
    return {
      success: false,
      passed: false,
      status: "QA_FAILED",
      videoFile,
      qa
    };
  }

  return {
    success: true,
    passed: true,
    status: "QA_PASSED",
    videoFile,
    qa,
    nextStage:
      "YOUTUBE_UPLOAD_GUARD",
    checkedAt:
      new Date().toISOString()
  };
}

export function getFinalShortQAStatus() {
  return {
    configured: true,
    status: "READY",

    checks: [
      "VIDEO_EXISTS",
      "VIDEO_DURATION",
      "VERTICAL_RESOLUTION",
      "VIDEO_STREAM",
      "AUDIO_STREAM",
      "CODEC_CHECK",
      "PUBLISH_GATE"
    ],

    resolution:
      "1080x1920",

    supportedDuration:
      "20-59 seconds",

    message:
      "Final Shorts are blocked from publishing when quality checks fail."
  };
}
