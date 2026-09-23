import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/audio";

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function validateVoiceInput({
  text,
  language = "en-US"
} = {}) {
  const cleanedText = cleanText(text);

  if (!cleanedText) {
    throw new Error("Voice text is required.");
  }

  if (cleanedText.length < 10) {
    throw new Error(
      "Voice text is too short."
    );
  }

  if (cleanedText.length > 12000) {
    throw new Error(
      "Voice text is too long."
    );
  }

  if (
    typeof language !== "string" ||
    !language.trim()
  ) {
    throw new Error(
      "Voice language is required."
    );
  }

  return {
    text: cleanedText,
    language: language.trim()
  };
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, {
    recursive: true
  });
}

function createVoiceJob({
  text,
  language = "en-US",
  voice = "default"
} = {}) {
  const timestamp = Date.now();

  return {
    id: `voice_${timestamp}`,
    status: "READY",
    provider: "NOT_CONFIGURED",
    text,
    language,
    voice,
    createdAt:
      new Date().toISOString()
  };
}

export async function createVoiceFile({
  text,
  language = "en-US",
  voice = "default",
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  const input = validateVoiceInput({
    text,
    language
  });

  await ensureDirectory(outputDir);

  const job = createVoiceJob({
    text: input.text,
    language: input.language,
    voice
  });

  return {
    ...job,
    status: "READY_FOR_TTS_PROVIDER",
    outputDir: path.resolve(outputDir),
    outputFile: null,
    message:
      "Voice provider is not connected yet. No fake audio file was created."
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

  const safeWpm =
    Number(wordsPerMinute) > 0
      ? Number(wordsPerMinute)
      : 150;

  const seconds =
    (words / safeWpm) * 60;

  return Number(
    seconds.toFixed(2)
  );
}

export function validateAudioFile(filePath) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason: "Audio file path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  const supportedFormats = [
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg"
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

export async function checkAudioFile(
  filePath
) {
  const validation =
    validateAudioFile(filePath);

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
          "Audio path is not a file."
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
        "Audio file does not exist."
    };
  }
}

export function createVoicePlan({
  text = "",
  language = "en-US",
  voice = "default"
} = {}) {
  const input = validateVoiceInput({
    text,
    language
  });

  const estimatedSeconds =
    estimateSpeechDuration(
      input.text
    );

  return {
    provider: "TTS_PROVIDER_REQUIRED",
    language: input.language,
    voice,
    estimatedSeconds,
    textLength:
      input.text.length,
    ready:
      estimatedSeconds > 0
  };
}