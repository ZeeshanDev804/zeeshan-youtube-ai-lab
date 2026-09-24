import dotenv from "dotenv";

dotenv.config();

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function toNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function cleanText(value = "") {
  return String(value).trim();
}

const config = {
  app: {
    nodeEnv:
      process.env.NODE_ENV ||
      "development",

    timezone:
      process.env.DEFAULT_TIMEZONE ||
      "UTC"
  },

  system: {
    mode:
      process.env.SYSTEM_MODE ||
      "REVIEW",

    dailyTargetVideos:
      Math.max(
        1,
        toNumber(
          process.env.DAILY_TARGET_VIDEOS,
          5
        )
      ),

    // 5 is a daily TARGET, not a hard maximum.
    // Good topics can produce more than 5 videos.
    maxDailyVideos: null,
    hardDailyMaximum: false,

    ceoApprovalRequired:
      toBoolean(
        process.env.CEO_APPROVAL_REQUIRED,
        true
      ),

    emergencyStop:
      toBoolean(
        process.env.EMERGENCY_STOP,
        false
      )
  },

  youtube: {
    clientId:
      cleanText(
        process.env.YOUTUBE_CLIENT_ID
      ),

    clientSecret:
      cleanText(
        process.env.YOUTUBE_CLIENT_SECRET
      ),

    refreshToken:
      cleanText(
        process.env.YOUTUBE_REFRESH_TOKEN
      ),

    redirectUri:
      cleanText(
        process.env.YOUTUBE_REDIRECT_URI ||
        "http://localhost"
      ),

    privacyStatus:
      cleanText(
        process.env.YOUTUBE_PRIVACY_STATUS ||
        "private"
      ).toLowerCase(),

    categoryId:
      cleanText(
        process.env.YOUTUBE_CATEGORY_ID ||
        "22"
      )
  },

  gemini: {
    apiKey:
      cleanText(
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.AI_API_KEY
      ),

    model:
      cleanText(
        process.env.GEMINI_MODEL ||
        "gemini-2.5-flash"
      ),

    imageModel:
      cleanText(
        process.env.IMAGE_MODEL ||
        "gemini-2.5-flash-image"
      )
  },

  elevenLabs: {
    apiKey:
      cleanText(
        process.env.ELEVENLABS_API_KEY
      ),

    voiceId:
      cleanText(
        process.env.ELEVENLABS_VOICE_ID
      ),

    model:
      cleanText(
        process.env.ELEVENLABS_MODEL ||
        "eleven_multilingual_v2"
      )
  },

  safety: {
    autoPublishLowRisk:
      toBoolean(
        process.env.AUTO_PUBLISH_LOW_RISK,
        true
      ),

    requireResearch:
      toBoolean(
        process.env.REQUIRE_RESEARCH,
        true
      ),

    requireCopyrightCheck:
      toBoolean(
        process.env.REQUIRE_COPYRIGHT_CHECK,
        true
      ),

    requireDuplicateCheck:
      toBoolean(
        process.env.REQUIRE_DUPLICATE_CHECK,
        true
      ),

    requireQualityCheck:
      toBoolean(
        process.env.REQUIRE_QUALITY_CHECK,
        true
      )
  },

  video: {
    width:
      toNumber(
        process.env.VIDEO_WIDTH,
        1080
      ),

    height:
      toNumber(
        process.env.VIDEO_HEIGHT,
        1920
      ),

    minDurationSeconds:
      toNumber(
        process.env.MIN_VIDEO_DURATION_SECONDS,
        20
      ),

    maxDurationSeconds:
      toNumber(
        process.env.MAX_VIDEO_DURATION_SECONDS,
        59
      ),

    fps:
      toNumber(
        process.env.VIDEO_FPS,
        30
      )
  },

  automation: {
    enabled:
      toBoolean(
        process.env.AUTOMATION_ENABLED,
        true
      ),

    retryAttempts:
      Math.max(
        1,
        toNumber(
          process.env.AUTOMATION_RETRY_ATTEMPTS,
          2
        )
      )
  }
};

function validateConfig() {
  const errors = [];

  const validModes = [
    "AUTO",
    "REVIEW",
    "STOP"
  ];

  const systemMode =
    String(
      config.system.mode
    ).toUpperCase();

  if (
    !validModes.includes(
      systemMode
    )
  ) {
    errors.push(
      "SYSTEM_MODE must be AUTO, REVIEW, or STOP."
    );
  }

  if (
    config.system.dailyTargetVideos < 1
  ) {
    errors.push(
      "DAILY_TARGET_VIDEOS must be at least 1."
    );
  }

  if (
    config.youtube.privacyStatus &&
    ![
      "private",
      "unlisted",
      "public"
    ].includes(
      config.youtube.privacyStatus
    )
  ) {
    errors.push(
      "YOUTUBE_PRIVACY_STATUS must be private, unlisted, or public."
    );
  }

  if (
    config.video.width !== 1080
  ) {
    errors.push(
      "VIDEO_WIDTH should be 1080 for Shorts."
    );
  }

  if (
    config.video.height !== 1920
  ) {
    errors.push(
      "VIDEO_HEIGHT should be 1920 for Shorts."
    );
  }

  if (
    config.video.minDurationSeconds < 1
  ) {
    errors.push(
      "MIN_VIDEO_DURATION_SECONDS must be positive."
    );
  }

  if (
    config.video.maxDurationSeconds <
    config.video.minDurationSeconds
  ) {
    errors.push(
      "MAX_VIDEO_DURATION_SECONDS must be greater than or equal to the minimum duration."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export function getConfigStatus() {
  const validation =
    validateConfig();

  return {
    valid:
      validation.valid,

    errors:
      validation.errors,

    system: {
      mode:
        config.system.mode,

      dailyTargetVideos:
        config.system.dailyTargetVideos,

      maxDailyVideos:
        config.system.maxDailyVideos,

      hardDailyMaximum:
        config.system.hardDailyMaximum,

      ceoApprovalRequired:
        config.system.ceoApprovalRequired,

      emergencyStop:
        config.system.emergencyStop
    },

    youtube: {
      credentialsConfigured:
        Boolean(
          config.youtube.clientId &&
          config.youtube.clientSecret &&
          config.youtube.refreshToken
        ),

      privacyStatus:
        config.youtube.privacyStatus
    },

    gemini: {
      configured:
        Boolean(
          config.gemini.apiKey
        ),

      model:
        config.gemini.model
    },

    elevenLabs: {
      configured:
        Boolean(
          config.elevenLabs.apiKey &&
          config.elevenLabs.voiceId
        ),

      model:
        config.elevenLabs.model
    },

    video: {
      width:
        config.video.width,

      height:
        config.video.height,

      minDurationSeconds:
        config.video.minDurationSeconds,

      maxDurationSeconds:
        config.video.maxDurationSeconds,

      fps:
        config.video.fps
    }
  };
}

export function validateConfigOrThrow() {
  const validation =
    validateConfig();

  if (!validation.valid) {
    throw new Error(
      validation.errors.join(" ")
    );
  }

  return true;
}

export default config;