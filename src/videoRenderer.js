import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_DIR = "./storage/videos";

function fileExists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      command,
      args,
      {
        stdio: [
          "ignore",
          "pipe",
          "pipe"
        ]
      }
    );

    let stdout = "";
    let stderr = "";

    process.stdout.on(
      "data",
      (data) => {
        stdout += data.toString();
      }
    );

    process.stderr.on(
      "data",
      (data) => {
        stderr += data.toString();
      }
    );

    process.on(
      "error",
      (error) => {
        reject(error);
      }
    );

    process.on(
      "close",
      (code) => {
        resolve({
          code,
          stdout,
          stderr
        });
      }
    );
  });
}

export async function checkFFmpeg() {
  try {
    const result =
      await runCommand(
        "ffmpeg",
        ["-version"]
      );

    return {
      available:
        result.code === 0,
      version:
        result.stdout
          .split("\n")[0]
          ?.trim() || null
    };
  } catch {
    return {
      available: false,
      version: null
    };
  }
}

function validateRenderInput({
  outputFile,
  width = 1080,
  height = 1920,
  fps = 30,
  durationSeconds = 30
} = {}) {
  const errors = [];

  if (
    !outputFile ||
    typeof outputFile !== "string"
  ) {
    errors.push(
      "Output file is required."
    );
  }

  if (Number(width) !== 1080) {
    errors.push(
      "Width must be 1080."
    );
  }

  if (Number(height) !== 1920) {
    errors.push(
      "Height must be 1920."
    );
  }

  if (
    Number(fps) < 24 ||
    Number(fps) > 60
  ) {
    errors.push(
      "FPS must be between 24 and 60."
    );
  }

  if (
    Number(durationSeconds) < 20 ||
    Number(durationSeconds) > 59
  ) {
    errors.push(
      "Duration must be between 20 and 59 seconds."
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function renderShortPlaceholder({
  outputFile,
  width = 1080,
  height = 1920,
  fps = 30,
  durationSeconds = 30
} = {}) {
  const validation =
    validateRenderInput({
      outputFile,
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

  const ffmpeg =
    await checkFFmpeg();

  if (!ffmpeg.available) {
    return {
      success: false,
      status: "FFMPEG_NOT_AVAILABLE",
      message:
        "FFmpeg is not installed or is not available in the current runtime."
    };
  }

  const directory =
    path.dirname(outputFile);

  await fs.mkdir(
    directory,
    {
      recursive: true
    }
  );

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${width}x${height}:r=${fps}`,
    "-t",
    String(durationSeconds),
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-movflags",
    "+faststart",
    outputFile
  ];

  try {
    const result =
      await runCommand(
        "ffmpeg",
        args
      );

    if (result.code !== 0) {
      return {
        success: false,
        status: "RENDER_FAILED",
        error:
          result.stderr.slice(-2000)
      };
    }

    const exists =
      await fileExists(outputFile);

    if (!exists) {
      return {
        success: false,
        status: "OUTPUT_MISSING",
        message:
          "FFmpeg finished but the output file was not created."
      };
    }

    const stats =
      await fs.stat(outputFile);

    return {
      success: true,
      status: "RENDERED",
      outputFile:
        path.resolve(outputFile),
      sizeBytes: stats.size,
      ffmpegVersion:
        ffmpeg.version
    };
  } catch (error) {
    return {
      success: false,
      status: "RENDER_ERROR",
      error: error.message
    };
  }
}

export async function createRenderJob({
  title = "",
  durationSeconds = 30,
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const safeTitle =
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

  const filename =
    `${safeTitle || "youtube-short"}-${Date.now()}.mp4`;

  return {
    id: `render_${Date.now()}`,
    title,
    durationSeconds,
    outputFile:
      path.join(
        outputDir,
        filename
      ),
    status:
      "READY_FOR_RENDER"
  };
}
