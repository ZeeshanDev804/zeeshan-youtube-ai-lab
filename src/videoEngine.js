import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/videos";

const SUPPORTED_FORMATS = [
  ".mp4",
  ".mov",
  ".webm"
];

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createVideoId() {
  return `video_${Date.now()}`;
}

function validateVideoInput({
  width = 1080,
  height = 1920,
  fps = 30,
  durationSeconds,
  format = ".mp4"
} = {}) {
  const errors = [];

  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const numericFps = Number(fps);
  const duration = Number(durationSeconds);

  if (
    numericWidth !== 1080 ||
    numericHeight !== 1920
  ) {
    errors.push(
      "Video must be 1080x1920 vertical format."
    );
  }

  if (
    !Number.isFinite(numericFps) ||
    numericFps < 24 ||
    numericFps > 60
  ) {
    errors.push(
      "FPS must be between 24 and 60."
    );
  }

  if (
    !Number.isFinite(duration) ||
    duration < 20 ||
    duration > 59
  ) {
    errors.push(
      "Duration must be between 20 and 59 seconds."
    );
  }

  const normalizedFormat =
    String(format)
      .toLowerCase()
      .trim();

  if (
    !SUPPORTED_FORMATS.includes(
      normalizedFormat
    )
  ) {
    errors.push(
      "Unsupported video format."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    width: numericWidth,
    height: numericHeight,
    fps: numericFps,
    durationSeconds: duration,
    format: normalizedFormat
  };
}

function buildVideoJob({
  width = 1080,
  height = 1920,
  fps = 30,
  durationSeconds,
  outputDir = DEFAULT_OUTPUT_DIR,
  format = ".mp4"
} = {}) {
  const validation =
    validateVideoInput({
      width,
      height,
      fps,
      durationSeconds,
      format
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  const id = createVideoId();

  return {
    success: true,
    id,
    status: "READY_FOR_RENDER",
    width: validation.width,
    height: validation.height,
    fps: validation.fps,
    durationSeconds:
      validation.durationSeconds,
    format: validation.format,
    outputDir:
      path.resolve(outputDir),
    outputFile: path.resolve(
      outputDir,
      `${id}${validation.format}`
    ),
    createdAt:
      new Date().toISOString()
  };
}

export function createVideoJob(options = {}) {
  return buildVideoJob(options);
}

export async function prepareVideoDirectory(
  outputDir = DEFAULT_OUTPUT_DIR
) {
  await fs.mkdir(outputDir, {
    recursive: true
  });

  return {
    ready: true,
    directory:
      path.resolve(outputDir)
  };
}

export function validateVideoOutput(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Video output path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  if (
    !SUPPORTED_FORMATS.includes(
      extension
    )
  ) {
    return {
      valid: false,
      reason:
        "Unsupported video format."
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkVideoOutput(
  filePath
) {
  const validation =
    validateVideoOutput(filePath);

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
          "Video output is not a file."
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
        "Video output file does not exist."
    };
  }
}

export function validateVideoMetadata({
  title,
  description = "",
  durationSeconds
} = {}) {
  const errors = [];

  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description);

  const duration =
    Number(durationSeconds);

  if (!cleanTitle) {
    errors.push(
      "Video title is required."
    );
  }

  if (cleanTitle.length > 100) {
    errors.push(
      "Video title is too long."
    );
  }

  if (cleanDescription.length > 5000) {
    errors.push(
      "Video description is too long."
    );
  }

  if (
    !Number.isFinite(duration) ||
    duration < 20 ||
    duration > 59
  ) {
    errors.push(
      "Video duration must be between 20 and 59 seconds."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    title: cleanTitle,
    description: cleanDescription,
    durationSeconds: duration
  };
}

export function getVideoEngineStatus() {
  return {
    configured: true,
    status: "READY",
    format: "MP4",
    resolution: "1080x1920",
    supportedFps: "24-60",
    supportedDuration: "20-59 seconds",
    message:
      "Video engine is ready for the rendering pipeline."
  };
}