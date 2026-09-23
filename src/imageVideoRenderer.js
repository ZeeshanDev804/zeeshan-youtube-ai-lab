import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_DIR = "./storage/videos";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRenderId() {
  return `visual_video_${Date.now()}`;
}

function runCommand(command, args = []) {
  return new Promise((resolve) => {
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
        resolve({
          success: false,
          error:
            error?.message ||
            "FFmpeg process failed."
        });
      }
    );

    process.on(
      "close",
      (code) => {
        resolve({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      }
    );
  });
}

export async function checkFFmpeg() {
  const result =
    await runCommand(
      "ffmpeg",
      ["-version"]
    );

  return {
    available:
      result.success,
    version:
      result.success
        ? result.stdout
            .split("\n")[0]
        : null,
    error:
      result.success
        ? null
        : result.error ||
          result.stderr
  };
}

function validateImages(images) {
  if (
    !Array.isArray(images) ||
    images.length === 0
  ) {
    return {
      valid: false,
      error:
        "At least one image is required."
    };
  }

  const supported =
    [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp"
    ];

  for (const image of images) {
    if (
      typeof image !== "string" ||
      !image.trim()
    ) {
      return {
        valid: false,
        error:
          "Every image must have a valid file path."
      };
    }

    const extension =
      path.extname(image)
        .toLowerCase();

    if (
      !supported.includes(
        extension
      )
    ) {
      return {
        valid: false,
        error:
          `Unsupported image format: ${extension}`
      };
    }
  }

  return {
    valid: true
  };
}

export async function createImageVideo({
  images = [],
  outputDir =
    DEFAULT_OUTPUT_DIR,
  durationPerImage = 5,
  width = 1080,
  height = 1920,
  fps = 30
} = {}) {
  const validation =
    validateImages(images);

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      error:
        validation.error
    };
  }

  const numericDuration =
    Number(durationPerImage);

  if (
    !Number.isFinite(
      numericDuration
    ) ||
    numericDuration <= 0
  ) {
    return {
      success: false,
      status: "INVALID",
      error:
        "Duration per image must be greater than zero."
    };
  }

  if (
    Number(width) !== 1080 ||
    Number(height) !== 1920
  ) {
    return {
      success: false,
      status: "INVALID",
      error:
        "Video must be 1080x1920."
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const ffmpeg =
    await checkFFmpeg();

  if (!ffmpeg.available) {
    return {
      success: false,
      status: "FFMPEG_NOT_AVAILABLE",
      error:
        "FFmpeg is not available in the current environment."
    };
  }

  const id =
    createRenderId();

  const outputFile =
    path.resolve(
      outputDir,
      `${id}.mp4`
    );

  /*
   * Create a temporary concat file.
   * Each image is displayed for the
   * requested duration.
   */

  const concatFile =
    path.resolve(
      outputDir,
      `${id}.txt`
    );

  const concatLines = [];

  for (const image of images) {
    const absoluteImage =
      path.resolve(image);

    concatLines.push(
      `file '${absoluteImage.replace(
        /'/g,
        "'\\''"
      )}'`
    );

    concatLines.push(
      `duration ${numericDuration}`
    );
  }

  const lastImage =
    path.resolve(
      images[images.length - 1]
    );

  concatLines.push(
    `file '${lastImage.replace(
      /'/g,
      "'\\''"
    )}'`
  );

  await fs.writeFile(
    concatFile,
    concatLines.join("\n"),
    "utf8"
  );

  const render =
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatFile,
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
        "-r",
        String(fps),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputFile
      ]
    );

  await fs.rm(
    concatFile,
    {
      force: true
    }
  );

  if (!render.success) {
    return {
      success: false,
      status: "RENDER_FAILED",
      error:
        render.stderr ||
        "FFmpeg failed to render the video."
    };
  }

  const stats =
    await fs.stat(
      outputFile
    );

  if (stats.size === 0) {
    return {
      success: false,
      status: "EMPTY_VIDEO",
      error:
        "Rendered video is empty."
    };
  }

  return {
    success: true,
    status: "VIDEO_READY",
    id,
    outputFile,
    imageCount:
      images.length,
    durationPerImage:
      numericDuration,
    width: Number(width),
    height: Number(height),
    fps: Number(fps),
    sizeBytes:
      stats.size,
    createdAt:
      new Date().toISOString()
  };
}

export function getImageVideoRendererStatus() {
  return {
    configured: true,
    status: "READY",
    resolution:
      "1080x1920",
    format:
      "MP4",
    codec:
      "H.264",
    capabilities: [
      "multiple image scenes",
      "vertical Shorts format",
      "FFmpeg rendering",
      "automatic scene timing",
      "local MP4 output"
    ]
  };
}
