import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  createCaptionTimeline,
  createSRT,
  saveSRT
} from "./captionEngine.js";

import {
  createVideoJob,
  prepareVideoDirectory
} from "./videoEngine.js";

const DEFAULT_OUTPUT_DIR = "./storage/videos";
const DEFAULT_CAPTION_DIR = "./storage/captions";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRenderId() {
  return `render_${Date.now()}`;
}

function commandExists(command) {
  return new Promise((resolve) => {
    const process = spawn(
      command,
      ["-version"],
      {
        stdio: "ignore"
      }
    );

    process.on("error", () => {
      resolve(false);
    });

    process.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

function escapeForFilter(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

async function runFFmpeg(args) {
  return new Promise((resolve) => {
    const process = spawn(
      "ffmpeg",
      args,
      {
        stdio: [
          "ignore",
          "ignore",
          "pipe"
        ]
      }
    );

    let stderr = "";

    process.stderr.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      }
    );

    process.on("error", (error) => {
      resolve({
        success: false,
        error:
          error?.message ||
          "FFmpeg could not start."
      });
    });

    process.on("close", (code) => {
      resolve({
        success: code === 0,
        code,
        error:
          code === 0
            ? null
            : stderr.slice(-3000)
      });
    });
  });
}

function validateRenderInput({
  scriptText,
  durationSeconds = 30,
  width = 1080,
  height = 1920,
  fps = 30
} = {}) {
  const errors = [];

  const text =
    cleanText(scriptText);

  const duration =
    Number(durationSeconds);

  if (!text) {
    errors.push(
      "Script text is required."
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

  if (
    Number(width) !== 1080 ||
    Number(height) !== 1920
  ) {
    errors.push(
      "Render size must be 1080x1920."
    );
  }

  if (
    !Number.isFinite(Number(fps)) ||
    Number(fps) < 24 ||
    Number(fps) > 60
  ) {
    errors.push(
      "FPS must be between 24 and 60."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    scriptText: text,
    durationSeconds: duration,
    width: Number(width),
    height: Number(height),
    fps: Number(fps)
  };
}

export async function createRenderPlan({
  scriptText,
  durationSeconds = 30,
  width = 1080,
  height = 1920,
  fps = 30,
  voiceFile = null,
  visualFiles = []
} = {}) {
  const validation =
    validateRenderInput({
      scriptText,
      durationSeconds,
      width,
      height,
      fps
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  const ffmpegAvailable =
    await commandExists("ffmpeg");

  if (!ffmpegAvailable) {
    return {
      success: false,
      status: "FFMPEG_NOT_FOUND",
      errors: [
        "FFmpeg is not installed or not available."
      ]
    };
  }

  const captionTimeline =
    createCaptionTimeline({
      text:
        validation.scriptText,
      durationSeconds:
        validation.durationSeconds,
      maxWordsPerCaption: 7
    });

  if (!captionTimeline.success) {
    return {
      success: false,
      status: "CAPTION_FAILED",
      errors:
        captionTimeline.errors
    };
  }

  const videoJob =
    createVideoJob({
      width:
        validation.width,
      height:
        validation.height,
      fps:
        validation.fps,
      durationSeconds:
        validation.durationSeconds,
      outputDir:
        DEFAULT_OUTPUT_DIR
    });

  if (!videoJob.success) {
    return {
      success: false,
      status: "VIDEO_JOB_FAILED",
      errors:
        videoJob.errors
    };
  }

  return {
    success: true,
    status: "READY",
    id: createRenderId(),
    videoJob,
    captions:
      captionTimeline.captions,
    captionSRT:
      createSRT(
        captionTimeline.captions
      ),
    voiceFile:
      voiceFile || null,
    visualFiles:
      Array.isArray(visualFiles)
        ? visualFiles
        : [],
    createdAt:
      new Date().toISOString()
  };
}

export async function renderShort({
  scriptText,
  durationSeconds = 30,
  width = 1080,
  height = 1920,
  fps = 30,
  voiceFile = null,
  visualFiles = [],
  outputDir = DEFAULT_OUTPUT_DIR,
  captionDir = DEFAULT_CAPTION_DIR
} = {}) {
  const plan =
    await createRenderPlan({
      scriptText,
      durationSeconds,
      width,
      height,
      fps,
      voiceFile,
      visualFiles
    });

  if (!plan.success) {
    return plan;
  }

  await prepareVideoDirectory(
    outputDir
  );

  await fs.mkdir(
    captionDir,
    {
      recursive: true
    }
  );

  const captionFile =
    await saveSRT(
      plan.captions,
      captionDir,
      `${plan.id}.srt`
    );

  if (!captionFile.success) {
    return {
      success: false,
      status: "CAPTION_SAVE_FAILED",
      error:
        "Could not save caption file."
    };
  }

  const outputFile =
    path.resolve(
      outputDir,
      `${plan.id}.mp4`
    );

  const captionPath =
    escapeForFilter(
      captionFile.outputFile
    );

  /*
   * Current render stage:
   * Creates a 1080x1920 MP4 with
   * generated subtitle timing.
   *
   * Real voice + visual inputs will
   * be activated after providers
   * are connected.
   */
  const filter =
    `subtitles='${captionPath}'`;

  const ffmpegResult =
    await runFFmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${width}x${height}:r=${fps}`,
      "-t",
      String(durationSeconds),
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputFile
    ]);

  if (!ffmpegResult.success) {
    return {
      success: false,
      status: "RENDER_FAILED",
      error:
        ffmpegResult.error ||
        "FFmpeg render failed.",
      captionFile:
        captionFile.outputFile
    };
  }

  const stats =
    await fs.stat(
      outputFile
    );

  return {
    success: true,
    status: "RENDERED",
    id: plan.id,
    outputFile,
    captionFile:
      captionFile.outputFile,
    sizeBytes:
      stats.size,
    durationSeconds,
    width,
    height,
    fps,
    voiceConnected:
      Boolean(voiceFile),
    visualCount:
      Array.isArray(visualFiles)
        ? visualFiles.length
        : 0,
    createdAt:
      new Date().toISOString()
  };
}

export function getRenderPipelineStatus() {
  return {
    status: "READY",
    ffmpegRequired: true,
    resolution: "1080x1920",
    fps: "24-60",
    duration: "20-59 seconds",
    captions: "SRT",
    message:
      "Render pipeline is ready for real voice and visual providers."
  };
}
