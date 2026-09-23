import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const DEFAULT_OUTPUT_DIR = "./storage/assets";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getConfig() {
  return {
    apiKey:
      process.env.AI_API_KEY || "",
    model:
      process.env.IMAGE_MODEL ||
      "gemini-3.1-flash-image"
  };
}

function createImageId() {
  return `gemini_image_${Date.now()}`;
}

function validatePrompt(prompt) {
  const cleanPrompt =
    cleanText(prompt);

  if (!cleanPrompt) {
    return {
      valid: false,
      error: "Image prompt is required."
    };
  }

  if (cleanPrompt.length > 4000) {
    return {
      valid: false,
      error: "Image prompt is too long."
    };
  }

  return {
    valid: true,
    prompt: cleanPrompt
  };
}

export function getGeminiImageStatus() {
  const config =
    getConfig();

  return {
    configured:
      Boolean(config.apiKey),
    provider:
      "Google Gemini",
    model:
      config.model,
    status:
      config.apiKey
        ? "CONFIGURED"
        : "NOT_CONFIGURED",
    message:
      "Gemini image generation adapter is ready."
  };
}

export async function generateGeminiImage({
  prompt,
  outputDir =
    DEFAULT_OUTPUT_DIR,
  aspectRatio = "9:16"
} = {}) {
  const config =
    getConfig();

  const validation =
    validatePrompt(prompt);

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      error:
        validation.error
    };
  }

  if (!config.apiKey) {
    return {
      success: false,
      status: "NOT_CONFIGURED",
      error:
        "AI_API_KEY is not configured."
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const ai =
    new GoogleGenAI({
      apiKey:
        config.apiKey
    });

  const finalPrompt = [
    "Create an original visual for a YouTube Short.",
    "Vertical 9:16 composition.",
    "Professional documentary style.",
    "No logos.",
    "No watermarks.",
    "No copyrighted characters.",
    "Do not imitate a living artist.",
    validation.prompt
  ].join(" ");

  try {
    const interaction =
      await ai.interactions.create({
        model:
          config.model,
        input:
          finalPrompt,
        response_format: {
          type: "image",
          aspect_ratio:
            aspectRatio
        }
      });

    const generatedImage =
      interaction.output_image;

    if (
      !generatedImage ||
      !generatedImage.data
    ) {
      return {
        success: false,
        status: "NO_IMAGE",
        error:
          "Gemini did not return an image."
      };
    }

    const id =
      createImageId();

    const outputFile =
      path.resolve(
        outputDir,
        `${id}.png`
      );

    const buffer =
      Buffer.from(
        generatedImage.data,
        "base64"
      );

    if (buffer.length === 0) {
      return {
        success: false,
        status: "EMPTY_IMAGE",
        error:
          "Generated image is empty."
      };
    }

    await fs.writeFile(
      outputFile,
      buffer
    );

    const stats =
      await fs.stat(
        outputFile
      );

    return {
      success: true,
      status: "GENERATED",
      provider:
        "Google Gemini",
      model:
        config.model,
      id,
      outputFile,
      format: "png",
      aspectRatio,
      sizeBytes:
        stats.size,
      createdAt:
        new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      status: "PROVIDER_ERROR",
      error:
        error?.message ||
        "Gemini image generation failed."
    };
  }
}
