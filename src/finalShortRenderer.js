import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_OUTPUT_DIR =
  "./storage/final";

const MIN_SHORT_DURATION = 20;
const MAX_SHORT_DURATION = 59;

const REQUIRED_WIDTH = 1080;
const REQUIRED_HEIGHT = 1920;

function runCommand(
  command,
  args = []
) {
  return new Promise((resolve) => {
    let child;
    let settled = false;

    const finish = (result) => {
      if (settled) return;

      settled = true;
      resolve(result);
    };

    try {
      child = spawn(
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
    } catch (error) {
      finish({
        success: false,
        error:
          error?.message ||
          `${command} could not start.`
      });

      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on(
      "data",
      (data) => {
        stdout +=
          data.toString();
      }
    );

    child.stderr.on(
      "data",
      (data) => {
        stderr +=
          data.toString();
      }
    );

    child.on(
      "error",
      (error) => {
        finish({
          success: false,
          error:
            error?.message ||
            `${command} failed.`,
          stdout,
          stderr
        });
      }
    );

    child.on(
      "close",
      (code) => {
        finish({
          success:
            code === 0,
          code,
          stdout,
          stderr
        });
      }
    );
  });
}

function runFFmpeg(args = []) {
  return runCommand(
    "ffmpeg",
    args
  );
}

function runFFprobe(args = []) {
  return runCommand(
    "ffprobe",
    args
  );
}

function cleanText(
  value = ""
) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function isNonEmptyString(
  value
) {
  return (
    typeof value ===
      "string" &&
    value.trim().length > 0
  );
}

function escapeSubtitlePath(
  filePath
) {
  return path
    .resolve(filePath)
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /:/g,
      "\\:"
    )
    .replace(
      /'/g,
      "\\'"
    );
}

function validateInput({
  videoFile,
  audioFile,
  outputDir
} = {}) {
  const errors = [];

  if (
    !isNonEmptyString(
      videoFile
    )
  ) {
    errors.push(
      "Video file is required."
    );
  }

  if (
    !isNonEmptyString(
      audioFile
    )
  ) {
    errors.push(
      "Audio file is required."
    );
  }

  if (
    !isNonEmptyString(
      outputDir
    )
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

async function checkFile(
  filePath,
  label
) {
  if (
    !isNonEmptyString(
      filePath
    )
  ) {
    return {
      valid: false,
      error:
        `${label} is required.`
    };
  }

  try {
    const stats =
      await fs.stat(
        filePath
      );

    if (!stats.isFile()) {
      return {
        valid: false,
        error:
          `${label} is not a file.`
      };
    }

    if (stats.size <= 0) {
      return {
        valid: false,
        error:
          `${label} is empty.`
      };
    }

    return {
      valid: true,
      sizeBytes:
        stats.size
    };
  } catch {
    return {
      valid: false,
      error:
        `${label} does not exist.`
    };
  }
}

export async function checkMediaFiles({
  videoFile,
  audioFile
} = {}) {
  const errors = [];

  const videoCheck =
    await checkFile(
      videoFile,
      "Video file"
    );

  if (!videoCheck.valid) {
    errors.push(
      videoCheck.error
    );
  }

  const audioCheck =
    await checkFile(
      audioFile,
      "Audio file"
    );

  if (!audioCheck.valid) {
    errors.push(
      audioCheck.error
    );
  }

  return {
    valid:
      errors.length === 0,
    errors,
    video:
      videoCheck,
    audio:
      audioCheck
  };
}

export async function checkCaptionFile(
  captionFile
) {
  if (
    !isNonEmptyString(
      captionFile
    )
  ) {
    return {
      valid: false,
      error:
        "Caption file was not provided."
    };
  }

  const extension =
    path.extname(
      captionFile
    ).toLowerCase();

  if (
    extension !== ".srt"
  ) {
    return {
      valid: false,
      error:
        "Caption file must be an SRT file."
    };
  }

  const result =
    await checkFile(
      captionFile,
      "Caption file"
    );

  return {
    valid:
      result.valid,
    error:
      result.error ||
      null,
    sizeBytes:
      result.sizeBytes ||
      0
  };
}

async function validateFFmpeg() {
  const result =
    await runFFmpeg([
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
    String(
      result.stdout || ""
    )
      .split("\n")[0]
      .trim();

  return {
    available: true,
    version:
      firstLine ||
      "FFmpeg"
  };
}

async function validateFFprobe() {
  const result =
    await runFFprobe([
      "-version"
    ]);

  if (!result.success) {
    return {
      available: false,
      error:
        result.error ||
        result.stderr ||
        "FFprobe is not available."
    };
  }

  const firstLine =
    String(
      result.stdout || ""
    )
      .split("\n")[0]
      .trim();

  return {
    available: true,
    version:
      firstLine ||
      "FFprobe"
  };
}

async function inspectMedia(
  filePath
) {
  const result =
    await runFFprobe([
      "-v",
      "error",

      "-show_entries",
      [
        "format=duration",
        "stream=index",
        "stream=codec_type",
        "stream=codec_name",
        "stream=width",
        "stream=height",
        "stream=pix_fmt"
      ].join(","),

      "-of",
      "json",

      path.resolve(
        filePath
      )
    ]);

  if (!result.success) {
    return {
      valid: false,
      error:
        result.stderr ||
        result.error ||
        "FFprobe could not inspect media."
    };
  }

  let data;

  try {
    data =
      JSON.parse(
        result.stdout
      );
  } catch {
    return {
      valid: false,
      error:
        "FFprobe returned invalid JSON."
    };
  }

  const streams =
    Array.isArray(
      data?.streams
    )
      ? data.streams
      : [];

  const formatDuration =
    Number(
      data?.format?.duration
    );

  const videoStream =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "video"
    );

  const audioStream =
    streams.find(
      (stream) =>
        stream.codec_type ===
        "audio"
    );

  if (!videoStream) {
    return {
      valid: false,
      error:
        "Final output has no video stream."
    };
  }

  if (!audioStream) {
    return {
      valid: false,
      error:
        "Final output has no audio stream."
    };
  }

  if (
    !Number.isFinite(
      formatDuration
    ) ||
    formatDuration <= 0
  ) {
    return {
      valid: false,
      error:
        "Final output has invalid duration."
    };
  }

  return {
    valid: true,

    durationSeconds:
      Number(
        formatDuration.toFixed(3)
      ),

    video: {
      codec:
        videoStream.codec_name ||
        null,

      width:
        Number(
          videoStream.width
        ),

      height:
        Number(
          videoStream.height
        ),

      pixelFormat:
        videoStream.pix_fmt ||
        null
    },

    audio: {
      codec:
        audioStream.codec_name ||
        null
    }
  };
}

async function validateFinalOutput(
  outputFile
) {
  const fileCheck =
    await checkFile(
      outputFile,
      "Final output"
    );

  if (!fileCheck.valid) {
    return {
      valid: false,
      error:
        fileCheck.error
    };
  }

  const media =
    await inspectMedia(
      outputFile
    );

  if (!media.valid) {
    return {
      valid: false,
      error:
        media.error
    };
  }

  if (
    media.video.width !==
      REQUIRED_WIDTH ||
    media.video.height !==
      REQUIRED_HEIGHT
  ) {
    return {
      valid: false,
      error:
        `Final video must be ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}.`,
      media
    };
  }

  if (
    media.video.codec !==
    "h264"
  ) {
    return {
      valid: false,
      error:
        "Final video codec must be H.264.",
      media
    };
  }

  if (
    media.audio.codec !==
    "aac"
  ) {
    return {
      valid: false,
      error:
        "Final audio codec must be AAC.",
      media
    };
  }

  if (
    media.video.pixelFormat &&
    media.video.pixelFormat !==
      "yuv420p"
  ) {
    return {
      valid: false,
      error:
        "Final video pixel format must be yuv420p.",
      media
    };
  }

  if (
    media.durationSeconds <
      MIN_SHORT_DURATION
  ) {
    return {
      valid: false,
      error:
        `Final Short is shorter than ${MIN_SHORT_DURATION} seconds.`,
      media
    };
  }

  if (
    media.durationSeconds >
      MAX_SHORT_DURATION
  ) {
    return {
      valid: false,
      error:
        `Final Short is longer than ${MAX_SHORT_DURATION} seconds.`,
      media
    };
  }

  return {
    valid: true,

    sizeBytes:
      fileCheck.sizeBytes,

    durationSeconds:
      media.durationSeconds,

    video:
      media.video,

    audio:
      media.audio
  };
}

async function renderWithoutCaptions({
  videoFile,
  audioFile,
  outputFile
}) {
  return runFFmpeg([
    "-y",

    "-i",
    path.resolve(
      videoFile
    ),

    "-i",
    path.resolve(
      audioFile
    ),

    "-map",
    "0:v:0",

    "-map",
    "1:a:0",

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

async function renderWithCaptions({
  videoFile,
  audioFile,
  captionFile,
  outputFile
}) {
  const subtitlePath =
    escapeSubtitlePath(
      captionFile
    );

  const subtitleFilter =
    `subtitles='${subtitlePath}'`;

  return runFFmpeg([
    "-y",

    "-i",
    path.resolve(
      videoFile
    ),

    "-i",
    path.resolve(
      audioFile
    ),

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
      status:
        "INVALID",
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
      status:
        "MEDIA_INVALID",
      errors:
        mediaCheck.errors
    };
  }

  const ffmpeg =
    await validateFFmpeg();

  if (!ffmpeg.available) {
    return {
      success: false,
      status:
        "FFMPEG_NOT_AVAILABLE",
      error:
        ffmpeg.error
    };
  }

  const ffprobe =
    await validateFFprobe();

  if (!ffprobe.available) {
    return {
      success: false,
      status:
        "FFPROBE_NOT_AVAILABLE",
      error:
        ffprobe.error
    };
  }

  let captionsEnabled =
    false;

  let captionInfo =
    null;

  if (
    isNonEmptyString(
      captionFile
    )
  ) {
    const captionCheck =
      await checkCaptionFile(
        captionFile
      );

    if (!captionCheck.valid) {
      return {
        success: false,
        status:
          "CAPTION_INVALID",
        error:
          captionCheck.error ||
          "Caption file is invalid."
      };
    }

    captionsEnabled =
      true;

    captionInfo = {
      file:
        path.resolve(
          captionFile
        ),

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
    `short_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

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
    await validateFinalOutput(
      outputFile
    );

  if (!outputCheck.valid) {
    return {
      success: false,
      status:
        "FINAL_OUTPUT_VALIDATION_FAILED",
      error:
        outputCheck.error,
      media:
        outputCheck.media ||
        null
    };
  }

  return {
    success: true,

    status:
      "FINAL_SHORT_READY",

    id,

    title:
      cleanText(title),

    outputFile,

    format:
      "mp4",

    durationSeconds:
      outputCheck.durationSeconds,

    resolution: {
      width:
        outputCheck.video.width,
      height:
        outputCheck.video.height
    },

    videoCodec:
      outputCheck.video.codec,

    audioCodec:
      outputCheck.audio.codec,

    pixelFormat:
      outputCheck.video.pixelFormat,

    captions: {
      enabled:
        captionsEnabled,

      burnedIntoVideo:
        captionsEnabled,

      source:
        captionInfo?.file ||
        null,

      sizeBytes:
        captionInfo?.sizeBytes ||
        0
    },

    videoSource:
      path.resolve(
        videoFile
      ),

    audioSource:
      path.resolve(
        audioFile
      ),

    sizeBytes:
      outputCheck.sizeBytes,

    ffmpeg: {
      available: true,
      version:
        ffmpeg.version
    },

    ffprobe: {
      available: true,
      version:
        ffprobe.version
    },

    validation: {
      duration:
        "20-59_SECONDS",

      resolution:
        "1080x1920",

      video:
        "H264",

      audio:
        "AAC",

      pixelFormat:
        "YUV420P",

      output:
        "VALID"
    },

    createdAt:
      new Date().toISOString()
  };
}

export function getFinalShortRendererStatus() {
  return {
    configured: true,

    status:
      "READY",

    format:
      "MP4",

    videoCodec:
      "H.264",

    audioCodec:
      "AAC",

    resolution:
      "1080x1920",

    duration:
      "20-59 seconds",

    pixelFormat:
      "yuv420p",

    captionSupport:
      true,

    captionFormat:
      "SRT",

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
      "1080x1920 validation",
      "20-59 second validation",
      "audio stream validation",
      "video stream validation",
      "FFmpeg availability check",
      "FFprobe availability check",
      "final output validation",
      "faststart MP4 output"
    ],

    message:
      "Final Short renderer validates the actual rendered MP4, including duration, resolution, H.264 video, AAC audio, pixel format and optional burned-in captions."
  };
}

export default {
  renderFinalShort,
  checkMediaFiles,
  checkCaptionFile,
  getFinalShortRendererStatus
};