import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function runFFprobe(args = []) {
  return new Promise((resolve) => {
    const process = spawn(
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
            "FFprobe could not start."
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

function numberValue(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
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

  try {
    const stats =
      await fs.stat(
        absolutePath
      );

    if (
      !stats.isFile() ||
      stats.size === 0
    ) {
      return {
        success: false,
        status: "INVALID",
        error:
          "Video file is empty or invalid."
      };
    }
  } catch {
    return {
      success: false,
      status: "NOT_FOUND",
      error:
        "Video file does not exist."
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
    file: absolutePath,
    sizeBytes:
      (await fs.stat(
        absolutePath
      )).size,
    durationSeconds:
      duration,
    format:
      data.format?.format_name ||
      null,
    video: videoStream
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
    audio: audioStream
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
  minSeconds = 20,
  maxSeconds = 59,
  requiredWidth = 1080,
  requiredHeight = 1920
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
      ]
    };
  }

  const errors = [];
  const warnings = [];

  const duration =
    inspection.durationSeconds;

  if (
    duration === null
  ) {
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
    inspection.video?.codec !==
    "h264"
  ) {
    warnings.push(
      "Video codec is not H.264."
    );
  }

  if (
    inspection.audio &&
    inspection.audio.codec !==
      "aac"
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
    checkedAt:
      new Date().toISOString()
  };
}

export function getVideoQualityGuardStatus() {
  return {
    configured: true,
    status: "READY",
    checks: [
      "file exists",
      "file is not empty",
      "duration 20-59 seconds",
      "1080x1920 resolution",
      "video stream",
      "audio stream",
      "H.264 warning",
      "AAC warning"
    ],
    message:
      "Final video quality guard is ready."
  };
}
