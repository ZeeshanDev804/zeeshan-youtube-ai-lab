import {
  generateGeminiImage,
  getGeminiImageStatus
} from "./geminiImageProvider.js";

import {
  validateGeneratedImage
} from "./imageProvider.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateVisualScene({
  prompt,
  outputDir = "./storage/assets"
} = {}) {
  const cleanPrompt = cleanText(prompt);

  if (!cleanPrompt) {
    return {
      success: false,
      status: "INVALID",
      error: "Visual prompt is required."
    };
  }

  const result =
    await generateGeminiImage({
      prompt: cleanPrompt,
      outputDir,
      aspectRatio: "9:16"
    });

  if (!result.success) {
    return result;
  }

  const fileCheck =
    await validateGeneratedImage(
      result.outputFile
    );

  if (!fileCheck.valid) {
    return {
      success: false,
      status: "INVALID_GENERATED_IMAGE",
      error: fileCheck.reason
    };
  }

  return {
    success: true,
    status: "VISUAL_READY",
    provider: result.provider,
    model: result.model,
    id: result.id,
    outputFile: result.outputFile,
    format: result.format,
    aspectRatio: result.aspectRatio,
    sizeBytes: fileCheck.sizeBytes,
    createdAt: result.createdAt
  };
}

export async function generateVisualScenes({
  scenes = [],
  outputDir = "./storage/assets"
} = {}) {
  if (
    !Array.isArray(scenes) ||
    scenes.length === 0
  ) {
    return {
      success: false,
      status: "INVALID",
      errors: [
        "At least one visual scene is required."
      ]
    };
  }

  const results = [];

  for (const scene of scenes) {
    const prompt =
      typeof scene === "string"
        ? scene
        : scene?.description || "";

    const result =
      await generateVisualScene({
        prompt,
        outputDir
      });

    results.push(result);

    if (!result.success) {
      return {
        success: false,
        status: "VISUAL_GENERATION_FAILED",
        results,
        error:
          result.error ||
          "A visual scene failed."
      };
    }
  }

  return {
    success: true,
    status: "ALL_VISUALS_READY",
    count: results.length,
    results
  };
}

export function getVisualGenerationStatus() {
  const providerStatus =
    getGeminiImageStatus();

  return {
    provider:
      providerStatus.provider,
    model:
      providerStatus.model,
    configured:
      providerStatus.configured,
    status:
      providerStatus.status,
    capabilities: [
      "single scene generation",
      "multiple scene generation",
      "9:16 Shorts visuals",
      "generated image validation",
      "local asset storage"
    ]
  };
}
