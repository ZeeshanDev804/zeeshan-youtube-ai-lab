import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_MIN_SECONDS = 20;
const DEFAULT_MAX_SECONDS = 59;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;

const REQUIRED_FORMAT = "mp4";
const REQUIRED_VIDEO_CODEC = "h264";
const REQUIRED_AUDIO_CODEC = "aac";

function runFFprobe(args = []) {
  return new Promise((resolve) => {
    const process = spawn("ffprobe", args, {
      stdio: [
        "ignore",
        "pipe",
        "pipe"
      ]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

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
        finish({
          success: false,
          error:
            error?.message ||
            "FFprobe could not start.",
          stdout,
          stderr
        });
      }
    );

    process.on(
      "close",
      (code) => {
        finish({
          success: code === 0,
          code,
          stdout,
          stderr
        });
      }
    );
  });
}

function numberValue(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function cleanFormat(format = "") {
  return String(format)
    .split(",")
    .map((value) =>
      value.trim().toLowerCase()
    )
    .filter(Boolean);
}

function hasFormat(
  format,
  requiredFormat
) {
  return cleanFormat(format).includes(
    String(requiredFormat).toLowerCase()
  );
}

async function getFileStats(filePath) {
  try {
    const stats =
      await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        error:
          "Video path does not point to a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        error:
          "Video file is empty."
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
        "Video file does not exist."
    };
  }
}

export async function inspectVideo(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      success: false,
      status: "INVALID",
      error:
        "Video file path is required."
    };
  }

  const absolutePath =
    path.resolve(filePath);

  const fileCheck =
    await getFileStats(
      absolutePath
    );

  if (!fileCheck.valid) {
    return {
      success: false,
      status:
        fileCheck.error ===
        "Video file does not exist."
          ? "NOT_FOUND"
          : "INVALID",
      error:
        fileCheck.error
    };
  }

  const probe =
    await runFFprobe([
      "-v",
      "error",

      "-show_entries",
      "format=duration,format_name",

      "-show_entries",
      "stream=index,codec_type,codec_name,width,height,r_frame_rate",

      "-of",
      "json",

      absolutePath
    ]);

  if (!probe.success) {
    return {
      success: false,
      status: "FFPROBE_FAILED",
      error:
        probe.stderr ||
        probe.error ||
        "Unable to inspect video."
    };
  }

  let data;

  try {
    data =
      JSON.parse(
        probe.stdout
      );
  } catch {
    return {
      success: false,
      status: "INVALID_METADATA",
      error:
        "FFprobe returned invalid metadata."
    };
  }

  const streams =
    Array.isArray(data.streams)
      ? data.streams
      : [];

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

  const duration =
    numberValue(
      data.format?.duration
    );

  return {
    success: true,
    status: "INSPECTED",

    file:
      absolutePath,

    sizeBytes:
      fileCheck.sizeBytes,

    durationSeconds:
      duration,

    format:
      data.format?.format_name ||
      null,

    video:
      videoStream
        ? {
            codec:
              videoStream.codec_name ||
              null,

            width:
              numberValue(
                videoStream.width
              ),

            height:
              numberValue(
                videoStream.height
              ),

            frameRate:
              videoStream.r_frame_rate ||
              null
          }
        : null,

    audio:
      audioStream
        ? {
            codec:
              audioStream.codec_name ||
              null
          }
        : null
  };
}

export async function runVideoQualityCheck({
  filePath,

  minSeconds =
    DEFAULT_MIN_SECONDS,

  maxSeconds =
    DEFAULT_MAX_SECONDS,

  requiredWidth =
    DEFAULT_WIDTH,

  requiredHeight =
    DEFAULT_HEIGHT,

  requireMp4 = true,

  requireH264 = true,

  requireAac = true
} = {}) {
  const inspection =
    await inspectVideo(
      filePath
    );

  if (!inspection.success) {
    return {
      success: false,
      status: "QA_FAILED",
      passed: false,

      errors: [
        inspection.error
      ],

      warnings: []
    };
  }

  const errors = [];
  const warnings = [];

  const duration =
    inspection.durationSeconds;

  if (duration === null) {
    errors.push(
      "Video duration could not be detected."
    );
  } else if (
    duration < minSeconds
  ) {
    errors.push(
      `Video is shorter than ${minSeconds} seconds.`
    );
  } else if (
    duration > maxSeconds
  ) {
    errors.push(
      `Video is longer than ${maxSeconds} seconds.`
    );
  }

  const width =
    inspection.video?.width;

  const height =
    inspection.video?.height;

  if (
    width !== requiredWidth ||
    height !== requiredHeight
  ) {
    errors.push(
      `Video resolution must be ${requiredWidth}x${requiredHeight}.`
    );
  }

  if (!inspection.video) {
    errors.push(
      "Video stream is missing."
    );
  }

  if (!inspection.audio) {
    errors.push(
      "Audio stream is missing."
    );
  }

  if (
    requireMp4 &&
    !hasFormat(
      inspection.format,
      REQUIRED_FORMAT
    )
  ) {
    errors.push(
      "Final video container must be MP4."
    );
  }

  if (
    requireH264 &&
    inspection.video?.codec !==
      REQUIRED_VIDEO_CODEC
  ) {
    errors.push(
      "Video codec must be H.264."
    );
  }

  if (
    requireAac &&
    inspection.audio &&
    inspection.audio.codec !==
      REQUIRED_AUDIO_CODEC
  ) {
    errors.push(
      "Audio codec must be AAC."
    );
  }

  if (
    !requireH264 &&
    inspection.video &&
    inspection.video.codec !==
      REQUIRED_VIDEO_CODEC
  ) {
    warnings.push(
      "Video codec is not H.264."
    );
  }

  if (
    !requireAac &&
    inspection.audio &&
    inspection.audio.codec !==
      REQUIRED_AUDIO_CODEC
  ) {
    warnings.push(
      "Audio codec is not AAC."
    );
  }

  const passed =
    errors.length === 0;

  return {
    success: true,

    status:
      passed
        ? "QA_PASS"
        : "QA_FAILED",

    passed,

    errors,

    warnings,

    inspection,

    requirements: {
      minSeconds,
      maxSeconds,

      width:
        requiredWidth,

      height:
        requiredHeight,

      mp4Required:
        requireMp4,

      h264Required:
        requireH264,

      aacRequired:
        requireAac
    },

    checkedAt:
      new Date().toISOString()
  };
}

export function getVideoQualityGuardStatus() {
  return {
    configured: true,

    status: "READY",

    requirements: {
      format:
        REQUIRED_FORMAT.toUpperCase(),

      videoCodec:
        REQUIRED_VIDEO_CODEC.toUpperCase(),

      audioCodec:
        REQUIRED_AUDIO_CODEC.toUpperCase(),

      resolution:
        `${DEFAULT_WIDTH}x${DEFAULT_HEIGHT}`,

      duration:
        `${DEFAULT_MIN_SECONDS}-${DEFAULT_MAX_SECONDS} seconds`
    },

    checks: [
      "file exists",
      "file is not empty",
      "MP4 container",
      "duration 20-59 seconds",
      "1080x1920 resolution",
      "video stream",
      "audio stream",
      "H.264 video codec",
      "AAC audio codec"
    ],

    message:
      "Final video quality guard enforces the required YouTube Shorts media specification."
  };
}

export default {
  inspectVideo,
  runVideoQualityCheck,
  getVideoQualityGuardStatus
};