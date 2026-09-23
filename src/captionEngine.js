import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/captions";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createCaptionId() {
  return `caption_${Date.now()}`;
}

function validateInput({
  text,
  durationSeconds = 30
} = {}) {
  const errors = [];

  const cleanTextValue =
    cleanText(text);

  const duration =
    Number(durationSeconds);

  if (!cleanTextValue) {
    errors.push(
      "Caption text is required."
    );
  }

  if (
    cleanTextValue.length > 12000
  ) {
    errors.push(
      "Caption text is too long."
    );
  }

  if (
    !Number.isFinite(duration) ||
    duration < 1
  ) {
    errors.push(
      "Valid duration is required."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    text: cleanTextValue,
    durationSeconds: duration
  };
}

function splitIntoChunks(
  text,
  maxWords = 7
) {
  const words =
    cleanText(text)
      .split(" ")
      .filter(Boolean);

  const chunks = [];

  for (
    let index = 0;
    index < words.length;
    index += maxWords
  ) {
    chunks.push(
      words
        .slice(
          index,
          index + maxWords
        )
        .join(" ")
    );
  }

  return chunks;
}

function formatTimestamp(seconds) {
  const totalMilliseconds =
    Math.max(
      0,
      Math.round(
        Number(seconds) * 1000
      )
    );

  const hours =
    Math.floor(
      totalMilliseconds / 3600000
    );

  const minutes =
    Math.floor(
      (totalMilliseconds % 3600000) /
        60000
    );

  const remainingMilliseconds =
    totalMilliseconds % 60000;

  const secs =
    Math.floor(
      remainingMilliseconds / 1000
    );

  const milliseconds =
    remainingMilliseconds % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(secs).padStart(
      2,
      "0"
    )},${String(
      milliseconds
    ).padStart(3, "0")}`
  ].join(":");
}

export function createCaptionTimeline({
  text,
  durationSeconds = 30,
  maxWordsPerCaption = 7
} = {}) {
  const validation =
    validateInput({
      text,
      durationSeconds
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  const chunks =
    splitIntoChunks(
      validation.text,
      maxWordsPerCaption
    );

  if (chunks.length === 0) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "No caption segments created."
      ]
    };
  }

  const segmentDuration =
    validation.durationSeconds /
    chunks.length;

  const captions =
    chunks.map(
      (captionText, index) => {
        const start =
          index *
          segmentDuration;

        const end =
          index ===
          chunks.length - 1
            ? validation.durationSeconds
            : (index + 1) *
              segmentDuration;

        return {
          index: index + 1,
          text: captionText,
          startSeconds:
            Number(
              start.toFixed(3)
            ),
          endSeconds:
            Number(
              end.toFixed(3)
            ),
          start:
            formatTimestamp(start),
          end:
            formatTimestamp(end)
        };
      }
    );

  return {
    success: true,
    status: "READY",
    durationSeconds:
      validation.durationSeconds,
    captions
  };
}

export function createSRT(
  captions = []
) {
  if (
    !Array.isArray(captions) ||
    captions.length === 0
  ) {
    return "";
  }

  return captions
    .map(
      (caption, index) =>
        `${index + 1}\n` +
        `${caption.start} --> ${caption.end}\n` +
        `${cleanText(
          caption.text
        )}\n`
    )
    .join("\n");
}

export async function saveSRT(
  captions,
  outputDir = DEFAULT_OUTPUT_DIR,
  fileName = null
) {
  const srtContent =
    createSRT(captions);

  if (!srtContent) {
    return {
      success: false,
      status: "INVALID",
      error:
        "No caption data available."
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const finalFileName =
    fileName ||
    `${createCaptionId()}.srt`;

  const outputFile =
    path.resolve(
      outputDir,
      finalFileName
    );

  await fs.writeFile(
    outputFile,
    srtContent,
    "utf8"
  );

  return {
    success: true,
    status: "SAVED",
    outputFile,
    format: "srt",
    sizeBytes:
      Buffer.byteLength(
        srtContent,
        "utf8"
      )
  };
}

export function validateCaptionFile(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Caption file path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  if (extension !== ".srt") {
    return {
      valid: false,
      reason:
        "Only SRT caption files are supported."
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkCaptionFile(
  filePath
) {
  const validation =
    validateCaptionFile(
      filePath
    );

  if (!validation.valid) {
    return validation;
  }

  try {
    const stats =
      await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        reason:
          "Caption path is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        reason:
          "Caption file is empty."
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size,
      extension:
        validation.extension
    };
  } catch {
    return {
      valid: false,
      reason:
        "Caption file does not exist."
    };
  }
}

export function getCaptionEngineStatus() {
  return {
    configured: true,
    status: "READY",
    format: "SRT",
    maxWordsPerCaption: 7,
    message:
      "Caption engine is ready for subtitle generation."
  };
}
