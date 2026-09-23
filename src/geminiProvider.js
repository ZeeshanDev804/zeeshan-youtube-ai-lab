import "dotenv/config";

import {
  GoogleGenAI
} from "@google/genai";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  "";

const model =
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
  systemInstruction = ""
} = {}) {
  if (!client) {
    return {
      success: false,
      status: "NOT_CONFIGURED",
      reason:
        "GEMINI_API_KEY or GOOGLE_API_KEY is not configured."
    };
  }

  if (!prompt || typeof prompt !== "string") {
    return {
      success: false,
      status: "INVALID_INPUT",
      reason: "A prompt is required."
    };
  }

  try {
    const input = systemInstruction
      ? `${systemInstruction}\n\n${prompt}`
      : prompt;

    const response =
      await client.interactions.create({
        model,
        input
      });

    const output =
      response?.output_text ||
      "";

    if (!output.trim()) {
      return {
        success: false,
        status: "EMPTY_RESPONSE",
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
