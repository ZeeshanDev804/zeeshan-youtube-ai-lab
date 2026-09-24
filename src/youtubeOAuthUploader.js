import fs from "node:fs/promises";
import path from "node:path";

const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";

function getConfig() {
  return {
    clientId:
      process.env.YOUTUBE_CLIENT_ID || "",
    clientSecret:
      process.env.YOUTUBE_CLIENT_SECRET || "",
    refreshToken:
      process.env.YOUTUBE_REFRESH_TOKEN || "",
    privacyStatus:
      process.env.YOUTUBE_PRIVACY_STATUS ||
      "private"
  };
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function validateUploadInput({
  videoFile,
  title,
  description = "",
  tags = [],
  categoryId = "22"
} = {}) {
  const errors = [];

  if (
    typeof videoFile !== "string" ||
    !videoFile.trim()
  ) {
    errors.push(
      "Video file is required."
    );
  }

  const cleanTitle =
    cleanText(title);

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

  const cleanDescription =
    cleanText(description);

  if (
    cleanDescription.length > 5000
  ) {
    errors.push(
      "YouTube description is too long."
    );
  }

  const cleanTags =
    Array.isArray(tags)
      ? tags
          .map(cleanText)
          .filter(Boolean)
          .slice(0, 30)
      : [];

  if (!Array.isArray(tags)) {
    errors.push(
      "Tags must be an array."
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
      String(categoryId)
  };
}

function validatePublishAuthorization({
  publishDecision
} = {}) {
  if (
    publishDecision?.allowed !== true
  ) {
    return {
      authorized: false,
      status:
        "PUBLISH_NOT_AUTHORIZED",
      error:
        "YouTube upload requires explicit Publish Gate authorization."
    };
  }

  return {
    authorized: true,
    status:
      "PUBLISH_AUTHORIZED"
  };
}

async function getAccessToken() {
  const config =
    getConfig();

  if (
    !config.clientId ||
    !config.clientSecret ||
    !config.refreshToken
  ) {
    return {
      success: false,
      status: "NOT_CONFIGURED",
      error:
        "YouTube OAuth credentials are not configured."
    };
  }

  const body =
    new URLSearchParams({
      client_id:
        config.clientId,
      client_secret:
        config.clientSecret,
      refresh_token:
        config.refreshToken,
      grant_type:
        "refresh_token"
    });

  try {
    const response =
      await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },
          body
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.access_token
    ) {
      return {
        success: false,
        status: "OAUTH_ERROR",
        error:
          data.error_description ||
          data.error ||
          "Unable to obtain YouTube access token."
      };
    }

    return {
      success: true,
      accessToken:
        data.access_token
    };
  } catch (error) {
    return {
      success: false,
      status: "OAUTH_ERROR",
      error:
        error?.message ||
        "YouTube OAuth request failed."
    };
  }
}

export async function uploadVideoToYouTube({
  videoFile,
  title,
  description = "",
  tags = [],
  categoryId = "22",
  privacyStatus,
  publishDecision
} = {}) {
  const authorization =
    validatePublishAuthorization({
      publishDecision
    });

  if (!authorization.authorized) {
    return {
      success: false,
      status:
        authorization.status,
      error:
        authorization.error
    };
  }

  const validation =
    validateUploadInput({
      videoFile,
      title,
      description,
      tags,
      categoryId
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors:
        validation.errors
    };
  }

  const config =
    getConfig();

  const finalPrivacy =
    cleanText(
      privacyStatus ||
        config.privacyStatus
    ).toLowerCase();

  const allowedPrivacy = [
    "private",
    "unlisted",
    "public"
  ];

  if (
    !allowedPrivacy.includes(
      finalPrivacy
    )
  ) {
    return {
      success: false,
      status: "INVALID_PRIVACY",
      error:
        "Privacy status must be private, unlisted, or public."
    };
  }

  const absoluteVideoFile =
    path.resolve(
      videoFile
    );

  let stats;

  try {
    stats =
      await fs.stat(
        absoluteVideoFile
      );

    if (
      !stats.isFile() ||
      stats.size === 0
    ) {
      return {
        success: false,
        status: "INVALID_VIDEO",
        error:
          "Video file is missing or empty."
      };
    }
  } catch {
    return {
      success: false,
      status: "VIDEO_NOT_FOUND",
      error:
        "Video file does not exist."
    };
  }

  const token =
    await getAccessToken();

  if (!token.success) {
    return token;
  }

  const metadata = {
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
      privacyStatus:
        finalPrivacy,
      selfDeclaredMadeForKids:
        false
    }
  };

  try {
    const initResponse =
      await fetch(
        `${YOUTUBE_UPLOAD_URL}?part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token.accessToken}`,
            "Content-Type":
              "application/json",
            "X-Upload-Content-Type":
              "video/mp4",
            "X-Upload-Content-Length":
              String(stats.size)
          },
          body:
            JSON.stringify(
              metadata
            )
        }
      );

    if (!initResponse.ok) {
      const errorText =
        await initResponse.text();

      return {
        success: false,
        status: "UPLOAD_INIT_ERROR",
        httpStatus:
          initResponse.status,
        error:
          errorText ||
          "YouTube upload initialization failed."
      };
    }

    const uploadUrl =
      initResponse.headers.get(
        "location"
      );

    if (!uploadUrl) {
      return {
        success: false,
        status: "UPLOAD_URL_MISSING",
        error:
          "YouTube did not return an upload URL."
      };
    }

    const videoBuffer =
      await fs.readFile(
        absoluteVideoFile
      );

    const uploadResponse =
      await fetch(
        uploadUrl,
        {
          method: "PUT",
          headers: {
            Authorization:
              `Bearer ${token.accessToken}`,
            "Content-Type":
              "video/mp4",
            "Content-Length":
              String(
                videoBuffer.length
              )
          },
          body:
            videoBuffer
        }
      );

    const uploadText =
      await uploadResponse.text();

    let uploadData = null;

    try {
      uploadData =
        JSON.parse(
          uploadText
        );
    } catch {
      uploadData = null;
    }

    if (!uploadResponse.ok) {
      return {
        success: false,
        status: "UPLOAD_FAILED",
        httpStatus:
          uploadResponse.status,
        error:
          uploadText ||
          "YouTube video upload failed."
      };
    }

    if (!uploadData?.id) {
      return {
        success: false,
        status:
          "UPLOAD_ID_MISSING",
        error:
          "YouTube accepted the upload but did not return a video ID."
      };
    }

    return {
      success: true,
      status: "UPLOADED",
      videoId:
        uploadData.id,
      privacyStatus:
        finalPrivacy,
      title:
        validation.title,
      uploadedFile:
        absoluteVideoFile,
      publishAuthorization:
        authorization.status,
      uploadedAt:
        new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      status: "UPLOAD_ERROR",
      error:
        error?.message ||
        "YouTube upload request failed."
    };
  }
}

export function getYouTubeOAuthStatus() {
  const config =
    getConfig();

  const configured =
    Boolean(
      config.clientId &&
      config.clientSecret &&
      config.refreshToken
    );

  return {
    configured,
    provider:
      "YouTube Data API",
    status:
      configured
        ? "CONFIGURED"
        : "NOT_CONFIGURED",
    privacyStatus:
      config.privacyStatus,
    protection: [
      "PUBLISH_GATE_REQUIRED",
      "OAUTH_REQUIRED",
      "VIDEO_FILE_REQUIRED",
      "INVALID_UPLOAD_BLOCKED"
    ],
    message:
      configured
        ? "YouTube OAuth uploader is configured and requires Publish Gate authorization."
        : "YouTube OAuth credentials are required before uploading."
  };
}