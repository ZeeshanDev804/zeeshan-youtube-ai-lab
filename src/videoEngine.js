import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/videos";

const MIN_DURATION = 20;
const MAX_DURATION = 59;

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function validateVideoSettings({
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  fps = DEFAULT_FPS,
  durationSeconds
} = {}) {
  const safeWidth = toNumber(
    width,
    DEFAULT_WIDTH
  );

  const safeHeight = toNumber(
    height,
    DEFAULT_HEIGHT
  );

  const safeFps = toNumber(
    fps,
    DEFAULT_FPS
  );

  const safeDuration = toNumber(
    durationSeconds,
    0
  );

  const errors = [];

  if (safeWidth !== 1080) {
    errors.push(
      "YouTube Shorts width must be 1080."
    );
  }

  if (safeHeight !== 1920) {
    errors.push(
      "YouTube Shorts height must be 1920."
    );
  }

  if (safeFps < 24 || safeFps > 60) {
    errors.push(
      "FPS must be between 24 and 60."
    );
  }

  if (
    safeDuration < MIN_DURATION ||
    safeDuration > MAX_DURATION
  ) {
    errors.push(
      `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    settings: {
      width: safeWidth,
      height: safeHeight,
      fps: safeFps,
      durationSeconds: safeDuration
    }
  };
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, {
    recursive: true
  });
}

function createVideoJob({
  title = "",
  durationSeconds,
  width,
  height,
  fps
}) {
  return {
    id: `video_${Date.now()}`,
    title: String(title).trim(),
    status: "READY",
    format: "mp4",
    width,
    height,
    fps,
    durationSeconds,
    createdAt:
      new Date().toISOString()
  };
}

export async function createVideoJob({
  title = "",
  durationSeconds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  fps = DEFAULT_FPS,
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  const validation =
    validateVideoSettings({
      width,
      height,
      fps,
      durationSeconds
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  await ensureDirectory(outputDir);

  const job = {
    id: `video_${Date.now()}`,
    title: String(title).trim(),
    status: "READY_FOR_RENDERER",
    format: "mp4",
    settings: validation.settings,
    outputDir: path.resolve(outputDir),
    outputFile: null,
    createdAt:
      new Date().toISOString()
  };

  return {
    success: true,
    ...job
  };
}

export function validateVideoFile(filePath) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Video file path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  if (extension !== ".mp4") {
    return {
      valid: false,
      reason:
        "Video must be an MP4 file."
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkVideoFile(
  filePath
) {
  const validation =
    validateVideoFile(filePath);

  if (!validation.valid) {
    return validation;
  }

  try {
    const stats =
      await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        reason:
          "Video path is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        reason:
          "Video file is empty."
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size,
      extension:
        validation.extension
    };
  } catch {
    return {
      valid: false,
      reason:
        "Video file does not exist."
    };
  }
}

export function createShortsRenderPlan({
  title = "",
  durationSeconds,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  fps = DEFAULT_FPS,
  audioFile = null,
  visualAssets = []
} = {}) {
  const validation =
    validateVideoSettings({
      width,
      height,
      fps,
      durationSeconds
    });

  if (!validation.valid) {
    return {
      ready: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  return {
    ready: true,
    status: "READY_FOR_RENDERER",
    title: String(title).trim(),
    video: validation.settings,
    audioFile,
    visualAssets: Array.isArray(
      visualAssets
    )
      ? visualAssets
      : [],
    outputFormat: "mp4"
  };
}