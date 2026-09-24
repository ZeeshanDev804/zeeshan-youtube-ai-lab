import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { GoogleGenAI } from "@google/genai";

const DEFAULT_OUTPUT_DIR = "./storage/assets";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createImageId() {
  return `gemini_image_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function getConfig() {
  return {
    apiKey:
      process.env.AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      "",

    model:
      process.env.IMAGE_MODEL ||
      "gemini-3.1-flash-image"
  };
}

function validatePrompt(prompt) {
  const cleanPromptValue =
    cleanText(prompt);

  if (!cleanPromptValue) {
    return {
      valid: false,
      error: "Image prompt is required."
    };
  }

  if (cleanPromptValue.length > 4000) {
    return {
      valid: false,
      error: "Image prompt is too long."
    };
  }

  return {
    valid: true,
    prompt: cleanPromptValue
  };
}

function validateAspectRatio(aspectRatio) {
  const allowed = [
    "9:16",
    "16:9",
    "1:1",
    "4:3",
    "3:4"
  ];

  return allowed.includes(aspectRatio)
    ? aspectRatio
    : "9:16";
}

function findImageData(response) {
  const candidates =
    Array.isArray(response?.candidates)
      ? response.candidates
      : [];

  for (const candidate of candidates) {
    const parts =
      Array.isArray(
        candidate?.content?.parts
      )
        ? candidate.content.parts
        : [];

    for (const part of parts) {
      if (
        part?.inlineData?.data
      ) {
        return {
          data:
            part.inlineData.data,

          mimeType:
            part.inlineData.mimeType ||
            "image/png"
        };
      }
    }
  }

  return null;
}

function getSafeExtension(mimeType = "") {
  const normalized =
    String(mimeType)
      .toLowerCase()
      .split(";")[0]
      .trim();

  if (
    normalized === "image/jpeg" ||
    normalized === "image/jpg"
  ) {
    return "jpg";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  return "png";
}

export function getGeminiImageStatus() {
  const config =
    getConfig();

  const configured =
    Boolean(
      config.apiKey &&
      config.model
    );

  return {
    configured,

    provider:
      "Google Gemini",

    model:
      config.model,

    status:
      configured
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    apiKeySource:
      process.env.AI_API_KEY
        ? "AI_API_KEY"
        : process.env.GEMINI_API_KEY
          ? "GEMINI_API_KEY"
          : process.env.GOOGLE_API_KEY
            ? "GOOGLE_API_KEY"
            : null,

    message:
      "Gemini image generation adapter uses the Google GenAI generateContent API."
  };
}

export async function generateGeminiImage({
  prompt,

  outputDir =
    DEFAULT_OUTPUT_DIR,

  aspectRatio = "9:16",

  model
} = {}) {
  const config =
    getConfig();

  const validation =
    validatePrompt(prompt);

  if (!validation.valid) {
    return {
      success: false,

      status:
        "INVALID",

      error:
        validation.error
    };
  }

  if (!config.apiKey) {
    return {
      success: false,

      status:
        "NOT_CONFIGURED",

      error:
        "AI_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY is not configured."
    };
  }

  const finalModel =
    model ||
    config.model;

  const finalAspectRatio =
    validateAspectRatio(
      aspectRatio
    );

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
    "Use a vertical 9:16 composition.",
    "Create a professional documentary/editorial visual.",
    "Use an original visual concept.",
    "Do not include logos or brand marks.",
    "Do not include watermarks.",
    "Do not recreate copyrighted characters.",
    "Do not imitate a living artist.",
    "Avoid unnecessary readable text inside the image.",
    validation.prompt
  ].join(" ");

  try {
    const response =
      await ai.models.generateContent({
        model:
          finalModel,

        contents:
          finalPrompt,

        config: {
          responseModalities: [
            "IMAGE"
          ],

          responseFormat: {
            image: {
              aspectRatio:
                finalAspectRatio
            }
          }
        }
      });

    const imageData =
      findImageData(
        response
      );

    if (!imageData) {
      return {
        success: false,

        status:
          "NO_IMAGE",

        model:
          finalModel,

        error:
          "Gemini did not return image data."
      };
    }

    const id =
      createImageId();

    const extension =
      getSafeExtension(
        imageData.mimeType
      );

    const outputFile =
      path.resolve(
        outputDir,
        `${id}.${extension}`
      );

    const buffer =
      Buffer.from(
        imageData.data,
        "base64"
      );

    if (!buffer.length) {
      return {
        success: false,

        status:
          "EMPTY_IMAGE",

        model:
          finalModel,

        error:
          "Gemini returned empty image data."
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

    if (
      !stats.isFile() ||
      stats.size <= 0
    ) {
      return {
        success: false,

        status:
          "INVALID_IMAGE_FILE",

        model:
          finalModel,

        error:
          "Generated image file is missing or empty."
      };
    }

    return {
      success: true,

      status:
        "GENERATED",

      provider:
        "Google Gemini",

      model:
        finalModel,

      id,

      outputFile,

      format:
        extension,

      mimeType:
        imageData.mimeType,

      aspectRatio:
        finalAspectRatio,

      sizeBytes:
        stats.size,

      createdAt:
        new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,

      status:
        "PROVIDER_ERROR",

      provider:
        "Google Gemini",

      model:
        finalModel,

      error:
        error?.message ||
        "Gemini image generation failed."
    };
  }
}