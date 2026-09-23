import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_OUTPUT_DIR = "./storage/assets";

const SUPPORTED_TYPES = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
];

function createId() {
  return `visual_${crypto
    .randomBytes(8)
    .toString("hex")}`;
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function validateInput({
  prompt,
  provider = "not_configured"
} = {}) {
  const errors = [];

  const cleanPrompt =
    cleanText(prompt);

  if (!cleanPrompt) {
    errors.push(
      "Visual prompt is required."
    );
  }

  if (cleanPrompt.length > 2000) {
    errors.push(
      "Visual prompt is too long."
    );
  }

  if (
    typeof provider !== "string" ||
    !provider.trim()
  ) {
    errors.push(
      "Visual provider is required."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    prompt: cleanPrompt,
    provider:
      provider.trim()
  };
}

export function createVisualJob({
  prompt,
  provider = "not_configured",
  outputDir = DEFAULT_OUTPUT_DIR
} = {}) {
  const validation =
    validateInput({
      prompt,
      provider
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
    id: createId(),
    status: "READY_FOR_PROVIDER",
    provider:
      validation.provider,
    prompt:
      validation.prompt,
    outputDir:
      path.resolve(outputDir),
    outputFile: null,
    licenseVerified: false,
    createdAt:
      new Date().toISOString()
  };
}

export async function prepareVisualDirectory(
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

export function validateVisualOutput(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Visual output path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  if (
    !SUPPORTED_TYPES.includes(
      extension
    )
  ) {
    return {
      valid: false,
      reason:
        "Unsupported visual format."
    };
  }

  return {
    valid: true,
    extension
  };
}

export async function checkVisualOutput(
  filePath
) {
  const validation =
    validateVisualOutput(filePath);

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
          "Visual output is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        reason:
          "Visual file is empty."
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
        "Visual output file does not exist."
    };
  }
}

export function verifyVisualLicense({
  source,
  license,
  licenseVerified = false
} = {}) {
  const validSource =
    typeof source === "string" &&
    source.trim().length > 0;

  const validLicense =
    typeof license === "string" &&
    license.trim().length > 0;

  if (
    !validSource ||
    !validLicense ||
    licenseVerified !== true
  ) {
    return {
      verified: false,
      status: "REVIEW",
      reason:
        "Source and verified license information are required."
    };
  }

  return {
    verified: true,
    status: "PASS",
    source:
      source.trim(),
    license:
      license.trim()
  };
}

export async function createVisualAsset({
  filePath,
  prompt,
  source,
  license,
  licenseVerified = false
} = {}) {
  const fileCheck =
    await checkVisualOutput(
      filePath
    );

  if (!fileCheck.valid) {
    return {
      success: false,
      status: "INVALID_FILE",
      error:
        fileCheck.reason
    };
  }

  const licenseCheck =
    verifyVisualLicense({
      source,
      license,
      licenseVerified
    });

  return {
    success:
      licenseCheck.verified,
    status:
      licenseCheck.verified
        ? "READY_FOR_RENDER"
        : "REVIEW_REQUIRED",
    id: createId(),
    path:
      path.resolve(filePath),
    prompt:
      cleanText(prompt),
    source:
      source || null,
    license:
      license || null,
    licenseVerified:
      licenseCheck.verified,
    sizeBytes:
      fileCheck.sizeBytes,
    createdAt:
      new Date().toISOString()
  };
}

export function getVisualProviderStatus() {
  return {
    configured: false,
    provider: null,
    status: "NOT_CONFIGURED",
    message:
      "A real visual provider must be configured before automatic asset generation."
  };
}
