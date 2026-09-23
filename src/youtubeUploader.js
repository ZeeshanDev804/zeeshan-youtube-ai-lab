import config from "./config.js";

export function getYouTubeStatus() {
  const configured =
    Boolean(config.youtube.clientId) &&
    Boolean(config.youtube.clientSecret) &&
    Boolean(config.youtube.refreshToken);

  return {
    configured,
    privacyStatus: config.youtube.privacyStatus,
    uploadReady: configured
  };
}

export function validateUploadJob({
  videoPath,
  title,
  description = ""
} = {}) {
  const errors = [];

  if (!videoPath) {
    errors.push("Video file is missing.");
  }

  if (!title || title.trim().length < 3) {
    errors.push("Video title is missing or too short.");
  }

  if (description.length > 5000) {
    errors.push("Description is too long.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function uploadToYouTube(job) {
  const status = getYouTubeStatus();

  if (!status.configured) {
    return {
      uploaded: false,
      status: "NOT_CONFIGURED",
      message:
        "YouTube OAuth is not configured yet. Upload was intentionally skipped.",
      job
    };
  }

  /*
   * Real OAuth + resumable upload implementation
   * will be activated after credentials are configured.
   */

  return {
    uploaded: false,
    status: "READY_FOR_OAUTH_IMPLEMENTATION",
    job
  };
}
