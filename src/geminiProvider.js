import "dotenv/config";

import {
  GoogleGenAI
} from "@google/genai";

const apiKey =
  process.env.AI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";

const model =
  process.env.AI_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

let client = null;

if (apiKey) {
  client = new GoogleGenAI({
    apiKey
  });
}

export function getGeminiStatus() {
  return {
    provider: "Google Gemini",
    configured: Boolean(apiKey),
    model,
    status: apiKey
      ? "READY"
      : "NOT_CONFIGURED"
  };
}

export async function generateGeminiText({
  prompt,
  systemInstruction = "",
  thinkingLevel = "low",
  temperature
} = {}) {
  if (!client) {
    return {
      success: false,
      status: "NOT_CONFIGURED",
      reason:
        "AI_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY is not configured."
    };
  }

  if (!prompt || typeof prompt !== "string") {
    return {
      success: false,
      status: "INVALID_INPUT",
      reason: "A prompt is required."
    };
  }

  const cleanPrompt = prompt.trim();

  if (!cleanPrompt) {
    return {
      success: false,
      status: "INVALID_INPUT",
      reason: "The prompt cannot be empty."
    };
  }

  try {
    const request = {
      model,
      input: cleanPrompt
    };

    if (
      systemInstruction &&
      typeof systemInstruction === "string"
    ) {
      request.system_instruction =
        systemInstruction.trim();
    }

    const generationConfig = {};

    if (thinkingLevel) {
      generationConfig.thinking_level =
        thinkingLevel;
    }

    if (
      typeof temperature === "number" &&
      Number.isFinite(temperature)
    ) {
      generationConfig.temperature =
        temperature;
    }

    if (Object.keys(generationConfig).length > 0) {
      request.generation_config =
        generationConfig;
    }

    const response =
      await client.interactions.create(
        request
      );

    const output =
      response?.output_text ||
      "";

    if (!output.trim()) {
      return {
        success: false,
        status: "EMPTY_RESPONSE",
        model,
        reason:
          "Gemini returned an empty response."
      };
    }

    return {
      success: true,
      status: "READY",
      model,
      text: output.trim()
    };

  } catch (error) {
    return {
      success: false,
      status: "API_ERROR",
      model,
      error:
        error?.message ||
        String(error)
    };
  }
}