import fs from "fs";
import { google } from "googleapis";

import config from "./config.js";

import {
  canUploadToYouTube as canUploadFromGuard
} from "./youtubeUploadGuard.js";

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

function getYouTubeCredentials() {
  return {
    clientId:
      config?.youtube?.clientId ||
      process.env.YOUTUBE_CLIENT_ID ||
      "",

    clientSecret:
      config?.youtube?.clientSecret ||
      process.env.YOUTUBE_CLIENT_SECRET ||
      "",

    refreshToken:
      config?.youtube?.refreshToken ||
      process.env.YOUTUBE_REFRESH_TOKEN ||
      "",

    redirectUri:
      config?.youtube?.redirectUri ||
      process.env.YOUTUBE_REDIRECT_URI ||
      "http://localhost"
  };
}

function hasYouTubeCredentials() {
  const credentials =
    getYouTubeCredentials();

  return Boolean(
    credentials.clientId &&
    credentials.clientSecret &&
    credentials.refreshToken
  );
}

function createOAuthClient() {
  const credentials =
    getYouTubeCredentials();

  if (
    !credentials.clientId ||
    !credentials.clientSecret ||
    !credentials.refreshToken
  ) {
    throw new Error(
      "YouTube OAuth credentials are not configured."
    );
  }

  const oauth2Client =
    new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );

  oauth2Client.setCredentials({
    refresh_token:
      credentials.refreshToken
  });

  return oauth2Client;
}

function getYouTubeClient() {
  return google.youtube({
    version: "v3",
    auth:
      createOAuthClient()
  });
}

function getPrivacyStatus(job = {}) {
  return cleanText(
    job.privacyStatus ||
    job.metadata?.privacyStatus ||
    config?.youtube?.privacyStatus ||
    "private"
  ).toLowerCase();
}

function validatePrivacyStatus(
  privacyStatus
) {
  const validStatuses = [
    "private",
    "unlisted",
    "public"
  ];

  if (
    !validStatuses.includes(
      privacyStatus
    )
  ) {
    return {
      valid: false,
      error:
        "Invalid YouTube privacy status."
    };
  }

  return {
    valid: true
  };
}

function validateUploadJob({
  videoPath,
  title,
  description = "",
  tags = [],
  categoryId = "22"
} = {}) {
  const errors = [];

  if (
    !isNonEmptyString(videoPath)
  ) {
    errors.push(
      "Video file is missing."
    );
  } else if (
    !fs.existsSync(videoPath)
  ) {
    errors.push(
      "Video file does not exist."
    );
  } else {
    try {
      const stats =
        fs.statSync(videoPath);

      if (!stats.isFile()) {
        errors.push(
          "Video path is not a file."
        );
      }

      if (stats.size <= 0) {
        errors.push(
          "Video file is empty."
        );
      }
    } catch {
      errors.push(
        "Video file could not be inspected."
      );
    }
  }

  const cleanTitle =
    cleanText(title);

  if (
    cleanTitle.length < 3
  ) {
    errors.push(
      "Video title is missing or too short."
    );
  }

  if (
    cleanTitle.length > 100
  ) {
    errors.push(
      "Video title must be 100 characters or less."
    );
  }

  const cleanDescription =
    cleanText(description);

  if (
    cleanDescription.length > 5000
  ) {
    errors.push(
      "Description is too long."
    );
  }

  if (!Array.isArray(tags)) {
    errors.push(
      "Tags must be an array."
    );
  }

  const cleanTags =
    Array.isArray(tags)
      ? tags
          .map(cleanText)
          .filter(Boolean)
          .slice(0, 30)
      : [];

  const normalizedCategory =
    String(
      categoryId || ""
    ).trim();

  if (!normalizedCategory) {
    errors.push(
      "YouTube category ID is required."
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
      cleanTags,

    categoryId:
      normalizedCategory
  };
}

function validatePublishAuthorization(
  job = {}
) {
  /*
   * Final publishing authorization must come
   * from publishGate.js.
   *
   * The uploader itself does not create
   * CEO approval decisions.
   */

  const authorization =
    job.publishDecision ||
    job.publishAuthorization ||
    null;

  if (!authorization) {
    return {
      allowed: true,
      reason:
        "No separate publish decision object was supplied; Upload Guard authorization will be enforced."
    };
  }

  if (
    authorization.allowed !== true ||
    authorization.success !== true
  ) {
    return {
      allowed: false,
      reason:
        authorization.reason ||
        "YouTube publish gate has not authorized this upload."
    };
  }

  return {
    allowed: true,
    reason:
      "YouTube publish gate authorized the upload."
  };
}

function createUploadStream(
  videoPath
) {
  const stream =
    fs.createReadStream(
      videoPath
    );

  return stream;
}

function normalizeYouTubeError(
  error
) {
  return {
    message:
      error?.message ||
      "YouTube upload failed.",

    name:
      error?.name ||
      "YouTubeUploadError",

    code:
      error?.code ||
      null,

    status:
      error?.response?.status ||
      null,

    reason:
      error?.response?.data?.error?.errors?.[0]?.reason ||
      null
  };
}

export function getYouTubeStatus() {
  const configured =
    hasYouTubeCredentials();

  return {
    configured,

    privacyStatus:
      config?.youtube?.privacyStatus ||
      "private",

    uploadReady:
      configured,

    oauth:
      configured
        ? "CONFIGURED"
        : "NOT_CONFIGURED"
  };
}

export async function uploadToYouTube(
  job = {}
) {
  /*
   * ------------------------------------------------
   * 1. UPLOAD GUARD
   * ------------------------------------------------
   */

  const guardAuthorization =
    canUploadFromGuard(
      job.uploadJob ||
      job
    );

  if (
    !guardAuthorization.allowed
  ) {
    return {
      uploaded: false,

      status:
        "UPLOAD_BLOCKED",

      message:
        guardAuthorization.reason,

      job
    };
  }

  /*
   * ------------------------------------------------
   * 2. FINAL PUBLISH GATE
   * ------------------------------------------------
   */

  const publishAuthorization =
    validatePublishAuthorization(
      job
    );

  if (
    !publishAuthorization.allowed
  ) {
    return {
      uploaded: false,

      status:
        "PUBLISH_GATE_BLOCKED",

      message:
        publishAuthorization.reason,

      job
    };
  }

  /*
   * ------------------------------------------------
   * 3. EMERGENCY STOP
   * ------------------------------------------------
   */

  if (
    config.system.emergencyStop === true ||
    String(
      config.system.mode
    ).toUpperCase() === "STOP"
  ) {
    return {
      uploaded: false,

      status:
        "EMERGENCY_STOP",

      message:
        "YouTube upload was stopped by the system safety control.",

      job
    };
  }

  /*
   * ------------------------------------------------
   * 4. OAUTH CONFIGURATION
   * ------------------------------------------------
   */

  const status =
    getYouTubeStatus();

  if (!status.configured) {
    return {
      uploaded: false,

      status:
        "NOT_CONFIGURED",

      message:
        "YouTube OAuth credentials are not configured.",

      job
    };
  }

  /*
   * ------------------------------------------------
   * 5. INPUT DATA
   * ------------------------------------------------
   */

  const videoPath =
    job.videoFile ||
    job.videoPath;

  const metadata =
    job.metadata || {};

  const validation =
    validateUploadJob({
      videoPath,

      title:
        metadata.title ||
        job.title,

      description:
        metadata.description ||
        job.description ||
        "",

      tags:
        metadata.tags ||
        job.tags ||
        [],

      categoryId:
        metadata.categoryId ||
        job.categoryId ||
        config.youtube.categoryId ||
        "22"
    });

  if (!validation.valid) {
    return {
      uploaded: false,

      status:
        "UPLOAD_VALIDATION_FAILED",

      errors:
        validation.errors,

      job
    };
  }

  /*
   * ------------------------------------------------
   * 6. PRIVACY
   * ------------------------------------------------
   */

  const privacyStatus =
    getPrivacyStatus(job);

  const privacyValidation =
    validatePrivacyStatus(
      privacyStatus
    );

  if (
    !privacyValidation.valid
  ) {
    return {
      uploaded: false,

      status:
        "UPLOAD_VALIDATION_FAILED",

      errors: [
        privacyValidation.error
      ],

      job
    };
  }

  /*
   * ------------------------------------------------
   * 7. REAL YOUTUBE API UPLOAD
   * ------------------------------------------------
   */

  let uploadStream = null;

  try {
    const youtube =
      getYouTubeClient();

    uploadStream =
      createUploadStream(
        videoPath
      );

    const response =
      await youtube.videos.insert({
        part: [
          "snippet",
          "status"
        ],

        requestBody: {
          snippet: {
            title:
              validation.title,

            description:
              validation.description,

            tags:
              validation.tags,

            categoryId:
              validation.categoryId
          },

          status: {
            privacyStatus
          }
        },

        media: {
          body:
            uploadStream
        },

        /*
         * Explicit resumable upload.
         * googleapis handles the upload session.
         */
        resumable: true
      });

    const videoId =
      response?.data?.id ||
      null;

    if (!videoId) {
      return {
        uploaded: false,

        status:
          "UPLOAD_FAILED",

        message:
          "YouTube API returned no video ID.",

        job
      };
    }

    return {
      uploaded: true,

      status:
        "UPLOADED",

      videoId,

      url:
        `https://www.youtube.com/watch?v=${videoId}`,

      privacyStatus,

      metadata: {
        title:
          validation.title,

        description:
          validation.description,

        tags:
          validation.tags,

        categoryId:
          validation.categoryId
      },

      uploadedAt:
        new Date().toISOString()
    };
  } catch (error) {
    const normalizedError =
      normalizeYouTubeError(
        error
      );

    return {
      uploaded: false,

      status:
        "UPLOAD_FAILED",

      message:
        normalizedError.message,

      errorName:
        normalizedError.name,

      errorCode:
        normalizedError.code,

      apiStatus:
        normalizedError.status,

      apiReason:
        normalizedError.reason,

      job
    };
  } finally {
    if (
      uploadStream &&
      !uploadStream.destroyed
    ) {
      uploadStream.destroy();
    }
  }
}

export default {
  getYouTubeStatus,
  validateUploadJob,
  uploadToYouTube
};