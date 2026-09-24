import fs from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";

import config from "./config.js";
import {
  canUploadToYouTube as canUploadFromGuard
} from "./youtubeUploadGuard.js";

dotenv.config();

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
      ""
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
      process.env.YOUTUBE_REDIRECT_URI ||
        "http://localhost"
    );

  oauth2Client.setCredentials({
    refresh_token:
      credentials.refreshToken
  });

  return oauth2Client;
}

function getYouTubeClient() {
  const auth =
    createOAuthClient();

  return google.youtube({
    version: "v3",
    auth
  });
}

function getPrivacyStatus(job = {}) {
  return (
    cleanText(
      job.privacyStatus ||
      job.metadata?.privacyStatus ||
      config?.youtube?.privacyStatus ||
      process.env.YOUTUBE_PRIVACY_STATUS ||
      "private"
    ).toLowerCase()
  );
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

  if (
    !isNonEmptyString(
      String(categoryId)
    )
  ) {
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
      Array.isArray(tags)
        ? tags
            .map(cleanText)
            .filter(Boolean)
            .slice(0, 30)
        : [],
    categoryId:
      String(categoryId)
  };
}

export function getYouTubeStatus() {
  const configured =
    hasYouTubeCredentials();

  return {
    configured,
    privacyStatus:
      config?.youtube?.privacyStatus ||
      process.env.YOUTUBE_PRIVACY_STATUS ||
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

  const privacyStatus =
    getPrivacyStatus(job);

  if (
    ![
      "private",
      "unlisted",
      "public"
    ].includes(privacyStatus)
  ) {
    return {
      uploaded: false,
      status:
        "UPLOAD_VALIDATION_FAILED",
      errors: [
        "Invalid YouTube privacy status."
      ],
      job
    };
  }

  try {
    const youtube =
      getYouTubeClient();

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
            fs.createReadStream(
              videoPath
            )
        }
      });

    const videoId =
      response?.data?.id || null;

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
    return {
      uploaded: false,
      status:
        "UPLOAD_FAILED",
      message:
        error?.message ||
        "YouTube upload failed.",
      errorName:
        error?.name ||
        "YouTubeUploadError",
      job
    };
  }
}

export default {
  getYouTubeStatus,
  validateUploadJob,
  uploadToYouTube
};