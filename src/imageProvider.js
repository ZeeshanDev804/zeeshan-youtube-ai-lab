import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/assets";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createImageId() {
  return `image_${Date.now()}`;
}

function getConfig() {
  return {
    provider:
      process.env.IMAGE_PROVIDER || "not_configured",
    apiKey:
      process.env.IMAGE_API_KEY || "",
    model:
      process.env.IMAGE_MODEL || ""
  };
}

function validateInput({
  prompt,
  apiKey,
  provider
} = {}) {
  const errors = [];

  const cleanPrompt =
    cleanText(prompt);

  if (!cleanPrompt) {
    errors.push(
      "Image prompt is required."
    );
  }

  if (cleanPrompt.length > 2000) {
    errors.push(
      "Image prompt is too long."
    );
  }

  if (!provider || provider === "not_configured") {
    errors.push(
      "Image provider is not configured."
    );
  }

  if (!apiKey) {
    errors.push(
      "Image provider API key is not configured."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    prompt: cleanPrompt
  };
}

export function getImageProviderStatus() {
  const config = getConfig();

  return {
    configured: Boolean(
      config.provider !== "not_configured" &&
      config.apiKey
    ),
    provider: config.provider,
    model: config.model || null,
    status:
      config.provider !== "not_configured" &&
      config.apiKey
        ? "CONFIGURED"
        : "NOT_CONFIGURED",
    message:
      "Image provider adapter is ready for secure API integration."
  };
}

export async function prepareImageDirectory(
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

export async function generateImageAsset({
  prompt,
  outputDir = DEFAULT_OUTPUT_DIR,
  provider,
  model
} = {}) {
  const config = getConfig();

  const finalProvider =
    provider || config.provider;

  const finalModel =
    model || config.model;

  const validation =
    validateInput({
      prompt,
      apiKey: config.apiKey,
      provider: finalProvider
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "NOT_CONFIGURED",
      errors: validation.errors
    };
  }

  await prepareImageDirectory(
    outputDir
  );

  /*
   * Provider-neutral stage.
   *
   * The actual image API call will be
   * connected after we choose the final
   * production provider.
   *
   * No fake image file is created here.
   */

  return {
    success: false,
    status: "PROVIDER_CONNECTION_REQUIRED",
    provider: finalProvider,
    model: finalModel || null,
    prompt: validation.prompt,
    outputDir:
      path.resolve(outputDir),
    outputFile: null,
    message:
      "Image provider credentials are detected, but the provider-specific generation adapter is not connected yet."
  };
}

export async function validateGeneratedImage(
  filePath
) {
  if (
    typeof filePath !== "string" ||
    !filePath.trim()
  ) {
    return {
      valid: false,
      reason:
        "Image file path is required."
    };
  }

  const extension =
    path.extname(filePath)
      .toLowerCase();

  const supportedFormats = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ];

  if (
    !supportedFormats.includes(
      extension
    )
  ) {
    return {
      valid: false,
      reason:
        "Unsupported image format."
    };
  }

  try {
    const stats =
      await fs.stat(filePath);

    if (!stats.isFile()) {
      return {
        valid: false,
        reason:
          "Image path is not a file."
      };
    }

    if (stats.size === 0) {
      return {
        valid: false,
        reason:
          "Image file is empty."
      };
    }

    return {
      valid: true,
      extension,
      sizeBytes:
        stats.size
    };
  } catch {
    return {
      valid: false,
      reason:
        "Image file does not exist."
    };
  }
}
