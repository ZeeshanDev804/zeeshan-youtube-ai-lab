import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const DEFAULT_OUTPUT_DIR = "./storage/videos";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRenderId() {
  return `visual_video_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function runCommand(command, args = []) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;

    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      finish({
        success: false,
        error:
          error?.message ||
          "Process could not be started."
      });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      finish({
        success: false,
        code: null,
        stdout,
        stderr,
        error:
          error?.message ||
          "Process failed."
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

export async function checkFFmpeg() {
  const result = await runCommand(
    "ffmpeg",
    ["-version"]
  );

  return {
    available: Boolean(result.success),

    version:
      result.success
        ? cleanText(
            result.stdout
              .split("\n")[0]
          )
        : null,

    error:
      result.success
        ? null
        : cleanText(
            result.error ||
              result.stderr ||
              "FFmpeg is unavailable."
          )
  };
}

async function checkFFprobe() {
  const result = await runCommand(
    "ffprobe",
    ["-version"]
  );

  return {
    available: Boolean(result.success),
    version:
      result.success
        ? cleanText(
            result.stdout
              .split("\n")[0]
          )
        : null,
    error:
      result.success
        ? null
        : cleanText(
            result.error ||
              result.stderr ||
              "FFprobe is unavailable."
          )
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

  const supported = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ];

  for (
    let index = 0;
    index < images.length;
    index += 1
  ) {
    const image = images[index];

    if (
      typeof image !== "string" ||
      !image.trim()
    ) {
      return {
        valid: false,
        error:
          `Image ${index + 1} has an invalid file path.`
      };
    }

    const extension =
      path.extname(image)
        .toLowerCase();

    if (
      !supported.includes(extension)
    ) {
      return {
        valid: false,
        error:
          `Image ${index + 1} has unsupported format: ${extension}`
      };
    }
  }

  return {
    valid: true
  };
}

async function verifyImageFiles(images) {
  const errors = [];

  for (
    let index = 0;
    index < images.length;
    index += 1
  ) {
    const imagePath =
      path.resolve(images[index]);

    try {
      const stats =
        await fs.stat(imagePath);

      if (!stats.isFile()) {
        errors.push(
          `Image ${index + 1} is not a file.`
        );
        continue;
      }

      if (stats.size <= 0) {
        errors.push(
          `Image ${index + 1} is empty.`
        );
      }
    } catch {
      errors.push(
        `Image ${index + 1} does not exist: ${imagePath}`
      );
    }
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

async function validateRenderedVideo(
  outputFile
) {
  try {
    const stats =
      await fs.stat(outputFile);

    if (
      !stats.isFile() ||
      stats.size <= 0
    ) {
      return {
        valid: false,
        error:
          "Rendered video is missing or empty."
      };
    }
  } catch {
    return {
      valid: false,
      error:
        "Rendered video file could not be read."
    };
  }

  const ffprobe =
    await checkFFprobe();

  if (!ffprobe.available) {
    return {
      valid: false,
      error:
        "FFprobe is required to validate the rendered video."
    };
  }

  const probe =
    await runCommand(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,pix_fmt",
        "-of",
        "json",
        outputFile
      ]
    );

  if (!probe.success) {
    return {
      valid: false,
      error:
        cleanText(
          probe.stderr ||
            probe.error ||
            "FFprobe validation failed."
        )
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
      valid: false,
      error:
        "FFprobe returned invalid JSON."
    };
  }

  const stream =
    data?.streams?.[0];

  if (!stream) {
    return {
      valid: false,
      error:
        "No video stream found."
    };
  }

  if (
    Number(stream.width) !== 1080 ||
    Number(stream.height) !== 1920
  ) {
    return {
      valid: false,
      error:
        `Invalid video resolution: ${stream.width}x${stream.height}.`
    };
  }

  if (
    stream.codec_name !==
    "h264"
  ) {
    return {
      valid: false,
      error:
        `Invalid video codec: ${stream.codec_name}.`
    };
  }

  return {
    valid: true,
    width:
      Number(stream.width),
    height:
      Number(stream.height),
    codec:
      stream.codec_name,
    pixelFormat:
      stream.pix_fmt || null
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
      status: "INVALID_IMAGES",
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
    numericDuration <= 0 ||
    numericDuration > 30
  ) {
    return {
      success: false,
      status:
        "INVALID_DURATION",
      error:
        "Duration per image must be greater than 0 and no more than 30 seconds."
    };
  }

  const numericWidth =
    Number(width);

  const numericHeight =
    Number(height);

  if (
    numericWidth !== 1080 ||
    numericHeight !== 1920
  ) {
    return {
      success: false,
      status:
        "INVALID_RESOLUTION",
      error:
        "Video must be exactly 1080x1920."
    };
  }

  const numericFps =
    Number(fps);

  if (
    !Number.isFinite(
      numericFps
    ) ||
    numericFps < 24 ||
    numericFps > 60
  ) {
    return {
      success: false,
      status:
        "INVALID_FPS",
      error:
        "FPS must be between 24 and 60."
    };
  }

  const imageFiles =
    images.map((image) =>
      path.resolve(image)
    );

  const imageValidation =
    await verifyImageFiles(
      imageFiles
    );

  if (
    !imageValidation.valid
  ) {
    return {
      success: false,
      status:
        "IMAGE_FILES_INVALID",
      errors:
        imageValidation.errors
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
      status:
        "FFMPEG_NOT_AVAILABLE",
      error:
        ffmpeg.error ||
        "FFmpeg is not available."
    };
  }

  const ffprobe =
    await checkFFprobe();

  if (!ffprobe.available) {
    return {
      success: false,
      status:
        "FFPROBE_NOT_AVAILABLE",
      error:
        ffprobe.error ||
        "FFprobe is required."
    };
  }

  const id =
    createRenderId();

  const outputFile =
    path.resolve(
      outputDir,
      `${id}.mp4`
    );

  const concatFile =
    path.resolve(
      outputDir,
      `${id}.txt`
    );

  try {
    const concatLines = [];

    for (
      const image of imageFiles
    ) {
      const escapedImage =
        image.replace(
          /'/g,
          "'\\''"
        );

      concatLines.push(
        `file '${escapedImage}'`
      );

      concatLines.push(
        `duration ${numericDuration}`
      );
    }

    const lastImage =
      imageFiles[
        imageFiles.length - 1
      ];

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

          "-hide_banner",

          "-loglevel",
          "error",

          "-f",
          "concat",

          "-safe",
          "0",

          "-i",
          concatFile,

          "-vf",
          `scale=${numericWidth}:${numericHeight}:force_original_aspect_ratio=decrease,pad=${numericWidth}:${numericHeight}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,

          "-r",
          String(numericFps),

          "-c:v",
          "libx264",

          "-preset",
          "veryfast",

          "-crf",
          "23",

          "-pix_fmt",
          "yuv420p",

          "-movflags",
          "+faststart",

          outputFile
        ]
      );

    if (!render.success) {
      return {
        success: false,
        status:
          "RENDER_FAILED",
        error:
          cleanText(
            render.stderr ||
              render.error ||
              "FFmpeg failed to render the video."
          )
      };
    }

    const finalValidation =
      await validateRenderedVideo(
        outputFile
      );

    if (
      !finalValidation.valid
    ) {
      await fs.rm(
        outputFile,
        {
          force: true
        }
      );

      return {
        success: false,
        status:
          "OUTPUT_VALIDATION_FAILED",
        error:
          finalValidation.error
      };
    }

    const stats =
      await fs.stat(
        outputFile
      );

    if (
      stats.size <= 0
    ) {
      return {
        success: false,
        status:
          "EMPTY_VIDEO",
        error:
          "Rendered video is empty."
      };
    }

    return {
      success: true,
      status:
        "VIDEO_READY",

      id,

      outputFile,

      imageCount:
        imageFiles.length,

      durationPerImage:
        numericDuration,

      estimatedDuration:
        numericDuration *
        imageFiles.length,

      width:
        numericWidth,

      height:
        numericHeight,

      fps:
        numericFps,

      codec:
        finalValidation.codec,

      pixelFormat:
        finalValidation.pixelFormat,

      format:
        "mp4",

      sizeBytes:
        stats.size,

      createdAt:
        new Date().toISOString()
    };

  } finally {
    await fs.rm(
      concatFile,
      {
        force: true
      }
    );
  }
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

    fps:
      "24-60",

    validation: [
      "FFmpeg availability",
      "FFprobe availability",
      "image file validation",
      "resolution validation",
      "H.264 validation",
      "MP4 output validation"
    ],

    capabilities: [
      "multiple image scenes",
      "vertical Shorts format",
      "FFmpeg rendering",
      "automatic scene timing",
      "local MP4 output",
      "production output validation"
    ]
  };
}