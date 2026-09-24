import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const DEFAULT_OUTPUT_DIR = "./storage/audio";

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function createJobId() {
  return `tts_${Date.now()}_${crypto
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

async function getAudioDuration(
  filePath
) {
  const result =
    await runCommand(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ]
    );

  if (!result.success) {
    return {
      valid: false,
      reason:
        result.stderr ||
        result.error ||
        "FFprobe could not read audio duration."
    };
  }

  const duration =
    Number(
      String(result.stdout).trim()
    );

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return {
      valid: false,
      reason:
        "Audio duration is invalid."
    };
  }

  return {
    valid: true,
    durationSeconds:
      Number(duration.toFixed(3))
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

    if (stats.size <= 0) {
      return {
        valid: false,
        reason:
          "Audio file is empty."
      };
    }

    const duration =
      await getAudioDuration(
        filePath
      );

    if (!duration.valid) {
      return {
        valid: false,
        reason:
          duration.reason
      };
    }

    return {
      valid: true,

      sizeBytes:
        stats.size,

      extension:
        validation.extension,

      durationSeconds:
        duration.durationSeconds,

      hasAudio:
        true
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

    status:
      "PROVIDER_REQUIRED",

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

    status:
      "NOT_CONFIGURED",

    message:
      "A real TTS provider must be configured before audio generation."
  };
}