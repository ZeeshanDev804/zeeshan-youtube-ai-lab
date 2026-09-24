import "dotenv/config";
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

const MIN_DURATION = 20;
const MAX_DURATION = 59;

const WIDTH = 1080;
const HEIGHT = 1920;

const MIN_FPS = 24;
const MAX_FPS = 60;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRenderId() {
  return `render_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeFilePath(filePath) {
  if (!filePath) {
    return null;
  }

  return path.resolve(
    String(filePath)
  );
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    const stats =
      await fs.stat(filePath);

    return stats.isFile() &&
      stats.size > 0;
  } catch {
    return false;
  }
}

async function getFileSize(filePath) {
  try {
    const stats =
      await fs.stat(filePath);

    return stats.size;
  } catch {
    return 0;
  }
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(
      command,
      ["-version"],
      {
        stdio: "ignore"
      }
    );

    child.on(
      "error",
      () => {
        resolve(false);
      }
    );

    child.on(
      "close",
      (code) => {
        resolve(code === 0);
      }
    );
  });
}

function escapeForFilter(
  filePath
) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function escapeForConcat(
  filePath
) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/'/g, "'\\''");
}

async function runFFmpeg(
  args
) {
  return new Promise((resolve) => {
    const child = spawn(
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

    child.stderr.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      }
    );

    child.on(
      "error",
      (error) => {
        resolve({
          success: false,
          code: null,
          error:
            error?.message ||
            "FFmpeg could not start."
        });
      }
    );

    child.on(
      "close",
      (code) => {
        resolve({
          success: code === 0,
          code,
          error:
            code === 0
              ? null
              : stderr.slice(-5000)
        });
      }
    );
  });
}

async function runFFprobe(
  args
) {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
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

    child.stdout.on(
      "data",
      (chunk) => {
        stdout += chunk.toString();
      }
    );

    child.stderr.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      }
    );

    child.on(
      "error",
      (error) => {
        resolve({
          success: false,
          error:
            error?.message ||
            "FFprobe could not start."
        });
      }
    );

    child.on(
      "close",
      (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error:
              stderr.slice(-3000) ||
              "FFprobe failed."
          });

          return;
        }

        try {
          resolve({
            success: true,
            data: JSON.parse(stdout)
          });
        } catch {
          resolve({
            success: false,
            error:
              "FFprobe returned invalid JSON."
          });
        }
      }
    );
  });
}

function validateRenderInput({
  scriptText,
  durationSeconds = 30,
  width = WIDTH,
  height = HEIGHT,
  fps = 30,
  voiceFile = null,
  visualFiles = []
} = {}) {
  const errors = [];

  const text =
    cleanText(scriptText);

  const duration =
    Number(durationSeconds);

  const renderWidth =
    Number(width);

  const renderHeight =
    Number(height);

  const renderFps =
    Number(fps);

  const visuals =
    Array.isArray(visualFiles)
      ? visualFiles
      : [];

  if (!text) {
    errors.push(
      "Script text is required."
    );
  }

  if (
    !Number.isFinite(duration) ||
    duration < MIN_DURATION ||
    duration > MAX_DURATION
  ) {
    errors.push(
      `Duration must be between ${MIN_DURATION} and ${MAX_DURATION} seconds.`
    );
  }

  if (
    renderWidth !== WIDTH ||
    renderHeight !== HEIGHT
  ) {
    errors.push(
      `Render size must be ${WIDTH}x${HEIGHT}.`
    );
  }

  if (
    !Number.isFinite(renderFps) ||
    renderFps < MIN_FPS ||
    renderFps > MAX_FPS
  ) {
    errors.push(
      `FPS must be between ${MIN_FPS} and ${MAX_FPS}.`
    );
  }

  if (!voiceFile) {
    errors.push(
      "Voice/audio file is required for production rendering."
    );
  }

  if (visuals.length === 0) {
    errors.push(
      "At least one visual file is required for production rendering."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    scriptText: text,

    durationSeconds:
      duration,

    width:
      renderWidth,

    height:
      renderHeight,

    fps:
      renderFps,

    voiceFile:
      normalizeFilePath(
        voiceFile
      ),

    visualFiles:
      visuals
        .map(normalizeFilePath)
        .filter(Boolean)
  };
}

async function validateMediaInputs({
  voiceFile,
  visualFiles
}) {
  const errors = [];

  const cleanVoice =
    normalizeFilePath(
      voiceFile
    );

  if (
    !(await fileExists(
      cleanVoice
    ))
  ) {
    errors.push(
      "Voice/audio file does not exist or is empty."
    );
  }

  const cleanVisuals =
    Array.isArray(visualFiles)
      ? visualFiles
          .map(normalizeFilePath)
          .filter(Boolean)
      : [];

  if (
    cleanVisuals.length === 0
  ) {
    errors.push(
      "No valid visual files were provided."
    );
  }

  const missingVisuals = [];

  for (
    const visual of cleanVisuals
  ) {
    if (
      !(await fileExists(
        visual
      ))
    ) {
      missingVisuals.push(
        visual
      );
    }
  }

  if (
    missingVisuals.length > 0
  ) {
    errors.push(
      `${missingVisuals.length} visual file(s) are missing or empty.`
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    voiceFile:
      cleanVoice,

    visualFiles:
      cleanVisuals
  };
}

async function createVisualConcatFile({
  visualFiles,
  outputFile
}) {
  if (
    !Array.isArray(
      visualFiles
    ) ||
    visualFiles.length === 0
  ) {
    return {
      success: false,
      error:
        "No visual files available."
    };
  }

  const lines =
    visualFiles.map(
      (file) =>
        `file '${escapeForConcat(
          file
        )}'`
    );

  try {
    await fs.writeFile(
      outputFile,
      `${lines.join("\n")}\n`,
      "utf8"
    );

    return {
      success: true,
      outputFile
    };
  } catch (error) {
    return {
      success: false,
      error:
        error?.message ||
        "Could not create visual concat file."
    };
  }
}

async function probeRenderedVideo(
  outputFile
) {
  const result =
    await runFFprobe([
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      outputFile
    ]);

  if (!result.success) {
    return {
      success: false,
      error:
        result.error ||
        "Could not inspect rendered video."
    };
  }

  const streams =
    Array.isArray(
      result.data?.streams
    )
      ? result.data.streams
      : [];

  const video =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "video"
    );

  const audio =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "audio"
    );

  const format =
    result.data?.format || {};

  const duration =
    Number(
      format.duration ||
      video?.duration ||
      0
    );

  return {
    success: true,

    duration,

    width:
      Number(video?.width || 0),

    height:
      Number(video?.height || 0),

    videoCodec:
      video?.codec_name ||
      null,

    audioCodec:
      audio?.codec_name ||
      null,

    pixelFormat:
      video?.pix_fmt ||
      null,

    formatName:
      format.format_name ||
      null,

    hasVideo:
      Boolean(video),

    hasAudio:
      Boolean(audio)
  };
}

function validateRenderedOutput(
  probe,
  expectedDuration
) {
  const errors = [];

  if (!probe?.hasVideo) {
    errors.push(
      "Final render has no video stream."
    );
  }

  if (!probe?.hasAudio) {
    errors.push(
      "Final render has no audio stream."
    );
  }

  if (
    probe?.width !== WIDTH ||
    probe?.height !== HEIGHT
  ) {
    errors.push(
      "Final render resolution is not 1080x1920."
    );
  }

  if (
    probe?.videoCodec !==
    "h264"
  ) {
    errors.push(
      "Final render video codec is not H.264."
    );
  }

  if (
    probe?.audioCodec !==
    "aac"
  ) {
    errors.push(
      "Final render audio codec is not AAC."
    );
  }

  if (
    probe?.pixelFormat !==
    "yuv420p"
  ) {
    errors.push(
      "Final render pixel format is not yuv420p."
    );
  }

  if (
    !Number.isFinite(
      probe?.duration
    ) ||
    probe.duration <
      MIN_DURATION ||
    probe.duration >
      MAX_DURATION
  ) {
    errors.push(
      "Final render duration is outside the allowed 20-59 second range."
    );
  }

  if (
    Number.isFinite(
      probe?.duration
    ) &&
    Math.abs(
      probe.duration -
        Number(expectedDuration)
    ) > 2
  ) {
    errors.push(
      "Final render duration differs from the planned duration by more than 2 seconds."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

export async function createRenderPlan({
  scriptText,
  durationSeconds = 30,
  width = WIDTH,
  height = HEIGHT,
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
      fps,
      voiceFile,
      visualFiles
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors:
        validation.errors
    };
  }

  const ffmpegAvailable =
    await commandExists(
      "ffmpeg"
    );

  if (!ffmpegAvailable) {
    return {
      success: false,
      status: "FFMPEG_NOT_FOUND",
      errors: [
        "FFmpeg is not installed or not available."
      ]
    };
  }

  const ffprobeAvailable =
    await commandExists(
      "ffprobe"
    );

  if (!ffprobeAvailable) {
    return {
      success: false,
      status: "FFPROBE_NOT_FOUND",
      errors: [
        "FFprobe is not installed or not available."
      ]
    };
  }

  const mediaValidation =
    await validateMediaInputs({
      voiceFile:
        validation.voiceFile,
      visualFiles:
        validation.visualFiles
    });

  if (
    !mediaValidation.valid
  ) {
    return {
      success: false,
      status: "MEDIA_INPUT_INVALID",
      errors:
        mediaValidation.errors
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

  if (
    !captionTimeline.success
  ) {
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

  if (
    !videoJob.success
  ) {
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

    id:
      createRenderId(),

    videoJob,

    captions:
      captionTimeline.captions,

    captionSRT:
      createSRT(
        captionTimeline.captions
      ),

    voiceFile:
      validation.voiceFile,

    visualFiles:
      validation.visualFiles,

    createdAt:
      new Date().toISOString()
  };
}

export async function renderShort({
  scriptText,
  durationSeconds = 30,
  width = WIDTH,
  height = HEIGHT,
  fps = 30,
  voiceFile = null,
  visualFiles = [],
  outputDir =
    DEFAULT_OUTPUT_DIR,
  captionDir =
    DEFAULT_CAPTION_DIR
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

  if (
    !captionFile.success
  ) {
    return {
      success: false,

      status:
        "CAPTION_SAVE_FAILED",

      error:
        "Could not save caption file."
    };
  }

  const workDir =
    path.resolve(
      outputDir,
      `${plan.id}_work`
    );

  await fs.mkdir(
    workDir,
    {
      recursive: true
    }
  );

  const concatFile =
    path.join(
      workDir,
      "visuals.txt"
    );

  const concatResult =
    await createVisualConcatFile({
      visualFiles:
        plan.visualFiles,
      outputFile:
        concatFile
    });

  if (
    !concatResult.success
  ) {
    return {
      success: false,

      status:
        "VISUAL_PREP_FAILED",

      error:
        concatResult.error
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
   * Production render:
   *
   * visual files
   *      +
   * voice/audio
   *      +
   * captions
   *      ↓
   * FFmpeg
   *      ↓
   * 1080x1920 H.264/AAC MP4
   */

  const filter =
    `subtitles='${captionPath}'`;

  const ffmpegArgs = [
    "-y",

    "-f",
    "concat",

    "-safe",
    "0",

    "-i",
    concatFile,

    "-i",
    plan.voiceFile,

    "-filter_complex",
    `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,${filter}[v]`,

    "-map",
    "[v]",

    "-map",
    "1:a:0",

    "-t",
    String(
      plan.videoJob.durationSeconds
    ),

    "-r",
    String(plan.videoJob.fps),

    "-c:v",
    "libx264",

    "-preset",
    "medium",

    "-crf",
    "20",

    "-pix_fmt",
    "yuv420p",

    "-c:a",
    "aac",

    "-b:a",
    "192k",

    "-ar",
    "48000",

    "-ac",
    "2",

    "-shortest",

    "-movflags",
    "+faststart",

    outputFile
  ];

  const ffmpegResult =
    await runFFmpeg(
      ffmpegArgs
    );

  if (
    !ffmpegResult.success
  ) {
    return {
      success: false,

      status:
        "RENDER_FAILED",

      error:
        ffmpegResult.error ||
        "FFmpeg render failed.",

      captionFile:
        captionFile.outputFile
    };
  }

  const outputExists =
    await fileExists(
      outputFile
    );

  if (!outputExists) {
    return {
      success: false,

      status:
        "OUTPUT_MISSING",

      error:
        "FFmpeg completed but final output file was not created."
    };
  }

  const sizeBytes =
    await getFileSize(
      outputFile
    );

  if (
    sizeBytes <= 0
  ) {
    return {
      success: false,

      status:
        "OUTPUT_EMPTY",

      error:
        "Final render file is empty."
    };
  }

  const probe =
    await probeRenderedVideo(
      outputFile
    );

  if (!probe.success) {
    return {
      success: false,

      status:
        "OUTPUT_PROBE_FAILED",

      error:
        probe.error ||
        "Could not inspect final rendered video."
    };
  }

  const outputValidation =
    validateRenderedOutput(
      probe,
      plan.videoJob.durationSeconds
    );

  if (
    !outputValidation.valid
  ) {
    return {
      success: false,

      status:
        "OUTPUT_VALIDATION_FAILED",

      errors:
        outputValidation.errors,

      outputFile,

      probe
    };
  }

  try {
    await fs.rm(
      workDir,
      {
        recursive: true,
        force: true
      }
    );
  } catch {
    // Temporary cleanup failure
    // must not invalidate a valid
    // final video.
  }

  return {
    success: true,

    status:
      "RENDERED",

    id:
      plan.id,

    outputFile,

    captionFile:
      captionFile.outputFile,

    sizeBytes,

    durationSeconds:
      probe.duration,

    width:
      probe.width,

    height:
      probe.height,

    fps:
      plan.videoJob.fps,

    videoCodec:
      probe.videoCodec,

    audioCodec:
      probe.audioCodec,

    pixelFormat:
      probe.pixelFormat,

    voiceConnected:
      true,

    visualCount:
      plan.visualFiles.length,

    createdAt:
      new Date().toISOString()
  };
}

export function getRenderPipelineStatus() {
  return {
    status: "READY",

    ffmpegRequired:
      true,

    ffprobeRequired:
      true,

    resolution:
      "1080x1920",

    fps:
      "24-60",

    duration:
      "20-59 seconds",

    videoCodec:
      "H.264",

    audioCodec:
      "AAC",

    pixelFormat:
      "yuv420p",

    captions:
      "SRT",

    voiceRequired:
      true,

    visualsRequired:
      true,

    productionRender:
      true,

    message:
      "Render pipeline requires real voice and visual inputs and validates the final MP4 before returning success."
  };
}

export default {
  createRenderPlan,
  renderShort,
  getRenderPipelineStatus
};