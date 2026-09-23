import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/audio";

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function validateInput({
  text,
  language = "en-US",
  voice = "default"
} = {}) {
  const errors = [];
  const cleanedText = cleanText(text);

  if (!cleanedText) {
    errors.push("Text is required.");
  }

  if (cleanedText.length > 12000) {
    errors.push(
      "Text is too long for one voice job."
    );
  }

  if (
    typeof language !== "string" ||
    !language.trim()
  ) {
    errors.push("Language is required.");
  }

  if (
    typeof voice !== "string" ||
    !voice.trim()
  ) {
    errors.push("Voice is required.");
  }

  return {
    valid: errors.length === 0,
    errors,
    text: cleanedText,
    language: language.trim(),
    voice: voice.trim()
  };
}

function createJobId() {
  return `tts_${Date.now()}`;
}

export function createTTSJob({
  text,
  language = "en-US",
  voice = "default",
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  const validation =
    validateInput({
      text,
      language,
      voice
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  return {
    success: true,
    id: createJobId(),
    status: "READY_FOR_PROVIDER",
    provider: "NOT_CONFIGURED",
    text: validation.text,
    language: validation.language,
    voice: validation.voice,
    outputDir: path.resolve(outputDir),
    outputFile: null,
    createdAt:
      new Date().toISOString()
  };
}

export function estimateSpeechDuration(
  text = "",
  wordsPerMinute = 150
) {
  const words = cleanText(text)
    .split(" ")
    .filter(Boolean)
    .length;

  const wpm = Number(wordsPerMinute);

  if (
    words === 0 ||
    !Number.isFinite(wpm) ||
    wpm <= 0
  ) {
    return 0;
  }

  return Number(
    ((words / wpm) * 60).toFixed(2)
  );
}

export async function prepareTTSDirectory(
  outputDir = DEFAULT_OUTPUT_DIR
) {
  await fs.mkdir(outputDir, {
    recursive: true
  });

  return {
    ready: true,
    directory:
      path.resolve(outputDir)
  };
}

export function validateAudioOutput(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Audio output path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  const supportedFormats = [
    ".mp3",
    ".wav",
    ".m4a",
    ".ogg",
    ".aac"
  ];

  if (
    !supportedFormats.includes(
      extension
    )
  ) {
    return {
      valid: false,
      reason:
        "Unsupported audio format."
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkAudioOutput(
  filePath
) {
  const validation =
    validateAudioOutput(filePath);

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
          "Audio output is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        reason:
          "Audio file is empty."
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
        "Audio output file does not exist."
    };
  }
}

export async function generateVoice(
  options = {}
) {
  const job =
    createTTSJob(options);

  if (!job.success) {
    return job;
  }

  await prepareTTSDirectory(
    options.outputDir ||
      DEFAULT_OUTPUT_DIR
  );

  return {
    ...job,
    status: "PROVIDER_REQUIRED",
    estimatedDuration:
      estimateSpeechDuration(
        job.text
      ),
    message:
      "TTS provider is not connected. No fake audio was generated."
  };
}

export function getTTSProviderStatus() {
  return {
    configured: false,
    provider: null,
    status: "NOT_CONFIGURED",
    message:
      "A real TTS provider must be configured before audio generation."
  };
}
