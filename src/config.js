import "dotenv/config";

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).toLowerCase()
  );
}

function toNumber(value, defaultValue) {
  const number = Number(value);

  return Number.isFinite(number) ? number : defaultValue;
}

function toList(value, defaultValue = []) {
  if (!value) return defaultValue;

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const config = {
  app: {
    name: process.env.APP_NAME || "ZEESHAN_AI_YOUTUBE_LAB",
    version: process.env.APP_VERSION || "1.0.0",
    environment: process.env.NODE_ENV || "development"
  },

  system: {
    mode: process.env.SYSTEM_MODE || "REVIEW",

    maxDailyVideos: Math.max(
      1,
      Math.min(
        5,
        toNumber(process.env.MAX_DAILY_VIDEOS, 5)
      )
    ),

    ceoApprovalRequired: toBoolean(
      process.env.CEO_APPROVAL_REQUIRED,
      true
    ),

    emergencyStop: toBoolean(
      process.env.EMERGENCY_STOP,
      false
    )
  },

  audience: {
    regions: toList(
      process.env.TARGET_REGIONS,
      ["US", "GB", "DE", "FR", "IT", "ES", "NL"]
    ),

    language: process.env.TARGET_LANGUAGE || "en"
  },

  video: {
    width: toNumber(process.env.VIDEO_WIDTH, 1080),
    height: toNumber(process.env.VIDEO_HEIGHT, 1920),
    fps: toNumber(process.env.VIDEO_FPS, 30),

    minSeconds: toNumber(
      process.env.VIDEO_MIN_SECONDS,
      20
    ),

    maxSeconds: toNumber(
      process.env.VIDEO_MAX_SECONDS,
      59
    )
  },

  safety: {
    mode: process.env.SAFETY_MODE || "strict",

    autoPublishLowRisk: toBoolean(
      process.env.AUTO_PUBLISH_LOW_RISK,
      false
    ),

    reviewMediumRisk: toBoolean(
      process.env.REVIEW_MEDIUM_RISK,
      true
    ),

    blockHighRisk: toBoolean(
      process.env.BLOCK_HIGH_RISK,
      true
    )
  },

  ai: {
    provider: process.env.AI_PROVIDER || "",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || ""
  },

  trends: {
    lookbackHours: toNumber(
      process.env.TREND_LOOKBACK_HOURS,
      24
    ),

    maxTopics: toNumber(
      process.env.MAX_TREND_TOPICS,
      20
    )
  },

  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID || "",
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || "",
    privacyStatus:
      process.env.YOUTUBE_PRIVACY_STATUS || "private"
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || "local"
  },

  logging: {
    level: process.env.LOG_LEVEL || "info"
  }
};

export function validateConfig() {
  const errors = [];

  if (!config.app.name) {
    errors.push("APP_NAME is missing.");
  }

  if (
    config.video.minSeconds < 1 ||
    config.video.maxSeconds < config.video.minSeconds
  ) {
    errors.push("Invalid video duration configuration.");
  }

  if (config.video.width <= 0 || config.video.height <= 0) {
    errors.push("Invalid video dimensions.");
  }

  if (config.system.maxDailyVideos < 1) {
    errors.push("MAX_DAILY_VIDEOS must be at least 1.");
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n- ${errors.join("\n- ")}`
    );
  }

  return true;
}

export default config;
