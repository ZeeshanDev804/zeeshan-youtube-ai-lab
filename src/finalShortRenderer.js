import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_DIR = "./storage/final";

function runFFmpeg(args = []) {
  return new Promise((resolve) => {
    const process = spawn(
      "ffmpeg",
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
            "FFmpeg could not start."
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

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function validateInput({
  videoFile,
  audioFile,
  outputDir
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

  if (
    typeof audioFile !== "string" ||
    !audioFile.trim()
  ) {
    errors.push(
      "Audio file is required."
    );
  }

  if (
    typeof outputDir !== "string" ||
    !outputDir.trim()
  ) {
    errors.push(
      "Output directory is required."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export async function checkMediaFiles({
  videoFile,
  audioFile
} = {}) {
  const errors = [];

  try {
    const videoStats =
      await fs.stat(videoFile);

    if (
      !videoStats.isFile() ||
      videoStats.size === 0
    ) {
      errors.push(
        "Video file is invalid or empty."
      );
    }
  } catch {
    errors.push(
      "Video file does not exist."
    );
  }

  try {
    const audioStats =
      await fs.stat(audioFile);

    if (
      !audioStats.isFile() ||
      audioStats.size === 0
    ) {
      errors.push(
        "Audio file is invalid or empty."
      );
    }
  } catch {
    errors.push(
      "Audio file does not exist."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export async function renderFinalShort({
  videoFile,
  audioFile,
  outputDir =
    DEFAULT_OUTPUT_DIR,
  title = ""
} = {}) {
  const validation =
    validateInput({
      videoFile,
      audioFile,
      outputDir
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors:
        validation.errors
    };
  }

  const mediaCheck =
    await checkMediaFiles({
      videoFile,
      audioFile
    });

  if (!mediaCheck.valid) {
    return {
      success: false,
      status: "MEDIA_INVALID",
      errors:
        mediaCheck.errors
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const id =
    `short_${Date.now()}`;

  const safeTitle =
    cleanText(title)
      .replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      )
      .slice(0, 60);

  const filename =
    safeTitle
      ? `${id}_${safeTitle}.mp4`
      : `${id}.mp4`;

  const outputFile =
    path.resolve(
      outputDir,
      filename
    );

  const result =
    await runFFmpeg([
      "-y",

      "-i",
      path.resolve(videoFile),

      "-i",
      path.resolve(audioFile),

      "-map",
      "0:v:0",

      "-map",
      "1:a:0",

      "-c:v",
      "copy",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-shortest",

      "-movflags",
      "+faststart",

      outputFile
    ]);

  if (!result.success) {
    return {
      success: false,
      status: "FINAL_RENDER_FAILED",
      error:
        result.stderr ||
        result.error ||
        "Final Short rendering failed."
    };
  }

  const stats =
    await fs.stat(
      outputFile
    );

  if (stats.size === 0) {
    return {
      success: false,
      status: "EMPTY_OUTPUT",
      error:
        "Final Short file is empty."
    };
  }

  return {
    success: true,
    status: "FINAL_SHORT_READY",
    id,
    title:
      cleanText(title),
    outputFile,
    format: "mp4",
    videoSource:
      path.resolve(videoFile),
    audioSource:
      path.resolve(audioFile),
    sizeBytes:
      stats.size,
    createdAt:
      new Date().toISOString()
  };
}

export function getFinalShortRendererStatus() {
  return {
    configured: true,
    status: "READY",
    format: "MP4",
    videoCodec: "H.264",
    audioCodec: "AAC",
    capabilities: [
      "video input",
      "voice input",
      "audio-video merge",
      "shortest stream handling",
      "final MP4 output"
    ],
    message:
      "Final Short renderer is ready."
  };
}
