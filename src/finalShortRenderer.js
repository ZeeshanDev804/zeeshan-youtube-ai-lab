import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_DIR = "./storage/final";

function runFFmpeg(args = []) {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      finish({
        success: false,
        error:
          error?.message ||
          "FFmpeg could not start.",
        stdout,
        stderr
      });
    });

    child.on("close", (code) => {
      finish({
        success: code === 0,
        code,
        stdout,
        stderr
      });
    });
  });
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function isNonEmptyString(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function escapeSubtitlePath(filePath) {
  return path
    .resolve(filePath)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function validateInput({
  videoFile,
  audioFile,
  outputDir
} = {}) {
  const errors = [];

  if (!isNonEmptyString(videoFile)) {
    errors.push("Video file is required.");
  }

  if (!isNonEmptyString(audioFile)) {
    errors.push("Audio file is required.");
  }

  if (!isNonEmptyString(outputDir)) {
    errors.push("Output directory is required.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function checkFile(filePath, label) {
  if (!isNonEmptyString(filePath)) {
    return {
      valid: false,
      error: `${label} is required.`
    };
  }

  try {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error: `${label} is not a file.`
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        error: `${label} is empty.`
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size
    };
  } catch {
    return {
      valid: false,
      error: `${label} does not exist.`
    };
  }
}

export async function checkMediaFiles({
  videoFile,
  audioFile
} = {}) {
  const errors = [];

  const videoCheck = await checkFile(
    videoFile,
    "Video file"
  );

  if (!videoCheck.valid) {
    errors.push(videoCheck.error);
  }

  const audioCheck = await checkFile(
    audioFile,
    "Audio file"
  );

  if (!audioCheck.valid) {
    errors.push(audioCheck.error);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function checkCaptionFile(
  captionFile
) {
  if (!isNonEmptyString(captionFile)) {
    return {
      valid: false,
      error: "Caption file was not provided."
    };
  }

  const extension =
    path.extname(captionFile).toLowerCase();

  if (extension !== ".srt") {
    return {
      valid: false,
      error: "Caption file must be an SRT file."
    };
  }

  const result = await checkFile(
    captionFile,
    "Caption file"
  );

  return {
    valid: result.valid,
    error: result.error || null,
    sizeBytes: result.sizeBytes || 0
  };
}

async function validateFFmpeg() {
  const result = await runFFmpeg([
    "-version"
  ]);

  if (!result.success) {
    return {
      available: false,
      error:
        result.error ||
        result.stderr ||
        "FFmpeg is not available."
    };
  }

  const firstLine =
    String(result.stdout || "")
      .split("\n")[0]
      .trim();

  return {
    available: true,
    version: firstLine || "FFmpeg"
  };
}

async function validateOutputFile(
  outputFile
) {
  try {
    const stats =
      await fs.stat(outputFile);

    if (!stats.isFile()) {
      return {
        valid: false,
        error: "Final output is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        error: "Final output file is empty."
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size
    };
  } catch {
    return {
      valid: false,
      error:
        "Final output file was not created."
    };
  }
}

async function renderWithoutCaptions({
  videoFile,
  audioFile,
  outputFile
}) {
  return runFFmpeg([
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
}

async function renderWithCaptions({
  videoFile,
  audioFile,
  captionFile,
  outputFile
}) {
  const subtitlePath =
    escapeSubtitlePath(captionFile);

  const subtitleFilter =
    `subtitles='${subtitlePath}'`;

  return runFFmpeg([
    "-y",

    "-i",
    path.resolve(videoFile),

    "-i",
    path.resolve(audioFile),

    "-map",
    "0:v:0",

    "-map",
    "1:a:0",

    "-vf",
    subtitleFilter,

    "-c:v",
    "libx264",

    "-preset",
    "medium",

    "-crf",
    "18",

    "-pix_fmt",
    "yuv420p",

    "-c:a",
    "aac",

    "-b:a",
    "128k",

    "-shortest",

    "-movflags",
    "+faststart",

    outputFile
  ]);
}

export async function renderFinalShort({
  videoFile,
  audioFile,
  outputDir =
    DEFAULT_OUTPUT_DIR,
  title = "",
  captionFile = null
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
      errors: validation.errors
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
      errors: mediaCheck.errors
    };
  }

  const ffmpeg =
    await validateFFmpeg();

  if (!ffmpeg.available) {
    return {
      success: false,
      status: "FFMPEG_NOT_AVAILABLE",
      error: ffmpeg.error
    };
  }

  let captionsEnabled = false;
  let captionInfo = null;

  if (isNonEmptyString(captionFile)) {
    const captionCheck =
      await checkCaptionFile(
        captionFile
      );

    if (!captionCheck.valid) {
      return {
        success: false,
        status: "CAPTION_INVALID",
        error:
          captionCheck.error ||
          "Caption file is invalid."
      };
    }

    captionsEnabled = true;

    captionInfo = {
      file:
        path.resolve(captionFile),
      sizeBytes:
        captionCheck.sizeBytes
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

  let renderResult;

  if (captionsEnabled) {
    renderResult =
      await renderWithCaptions({
        videoFile,
        audioFile,
        captionFile,
        outputFile
      });
  } else {
    renderResult =
      await renderWithoutCaptions({
        videoFile,
        audioFile,
        outputFile
      });
  }

  if (!renderResult.success) {
    return {
      success: false,
      status:
        captionsEnabled
          ? "FINAL_RENDER_WITH_CAPTIONS_FAILED"
          : "FINAL_RENDER_FAILED",
      error:
        renderResult.stderr ||
        renderResult.error ||
        "Final Short rendering failed.",
      ffmpegVersion:
        ffmpeg.version
    };
  }

  const outputCheck =
    await validateOutputFile(
      outputFile
    );

  if (!outputCheck.valid) {
    return {
      success: false,
      status: "EMPTY_OUTPUT",
      error:
        outputCheck.error
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

    captions: {
      enabled: captionsEnabled,
      burnedIntoVideo:
        captionsEnabled,
      source:
        captionInfo?.file || null
    },

    videoSource:
      path.resolve(videoFile),

    audioSource:
      path.resolve(audioFile),

    sizeBytes:
      outputCheck.sizeBytes,

    ffmpeg: {
      available: true,
      version: ffmpeg.version
    },

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

    captionSupport: true,

    captionFormat: "SRT",

    captionMode:
      "BURNED_IN",

    capabilities: [
      "video input",
      "voice input",
      "audio-video merge",
      "optional SRT captions",
      "burn captions into MP4",
      "shortest stream handling",
      "H.264 encoding",
      "AAC audio encoding",
      "faststart MP4 output",
      "output validation",
      "FFmpeg availability check"
    ],

    message:
      "Final Short renderer is ready for video, voice and optional burned-in captions."
  };
}

export default {
  renderFinalShort,
  checkMediaFiles,
  checkCaptionFile,
  getFinalShortRendererStatus
};