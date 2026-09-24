import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_OUTPUT_DIR = "./storage/audio";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createAudioId() {
  return `audio_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}`;
}

function getConfig() {
  return {
    apiKey:
      process.env.ELEVENLABS_API_KEY || "",

    voiceId:
      process.env.ELEVENLABS_VOICE_ID || "",

    modelId:
      process.env.ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2"
  };
}

function validateInput({
  text,
  voiceId,
  apiKey
} = {}) {
  const errors = [];

  const cleanTextValue =
    cleanText(text);

  if (!cleanTextValue) {
    errors.push(
      "Text is required."
    );
  }

  if (
    cleanTextValue.length > 12000
  ) {
    errors.push(
      "Text is too long."
    );
  }

  if (
    !apiKey ||
    !String(apiKey).trim()
  ) {
    errors.push(
      "ElevenLabs API key is not configured."
    );
  }

  if (
    !voiceId ||
    !String(voiceId).trim()
  ) {
    errors.push(
      "ElevenLabs voice ID is not configured."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    text:
      cleanTextValue
  };
}

async function readProviderError(response) {
  try {
    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      const json =
        await response.json();

      return (
        json?.detail?.message ||
        json?.detail ||
        json?.message ||
        JSON.stringify(json)
      );
    }

    const text =
      await response.text();

    return (
      text ||
      "ElevenLabs request failed."
    );

  } catch {
    return "ElevenLabs request failed.";
  }
}

export function getElevenLabsStatus() {
  const config =
    getConfig();

  const configured =
    Boolean(
      config.apiKey &&
      config.voiceId
    );

  return {
    configured,

    provider:
      "ElevenLabs",

    model:
      config.modelId,

    voiceConfigured:
      Boolean(config.voiceId),

    apiKeyConfigured:
      Boolean(config.apiKey),

    status:
      configured
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    commercialUse:
      "VERIFY_CURRENT_PLAN_RIGHTS",

    message:
      "ElevenLabs TTS adapter is configured for API-based voice generation. Verify the current ElevenLabs plan and usage rights before monetized production use."
  };
}

export async function generateElevenLabsVoice({
  text,
  voiceId,
  outputDir =
    DEFAULT_OUTPUT_DIR,
  modelId,
  stability,
  similarityBoost,
  style,
  useSpeakerBoost = true
} = {}) {
  const config =
    getConfig();

  const finalVoiceId =
    voiceId ||
    config.voiceId;

  const finalModelId =
    modelId ||
    config.modelId;

  const validation =
    validateInput({
      text,
      voiceId:
        finalVoiceId,
      apiKey:
        config.apiKey
    });

  if (!validation.valid) {
    return {
      success: false,

      status:
        "NOT_CONFIGURED",

      errors:
        validation.errors
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const id =
    createAudioId();

  const outputFile =
    path.resolve(
      outputDir,
      `${id}.mp3`
    );

  const endpoint =
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
      finalVoiceId
    )}?output_format=mp3_44100_128`;

  const voiceSettings = {};

  if (
    typeof stability === "number" &&
    Number.isFinite(stability)
  ) {
    voiceSettings.stability =
      Math.max(
        0,
        Math.min(
          1,
          stability
        )
      );
  }

  if (
    typeof similarityBoost === "number" &&
    Number.isFinite(similarityBoost)
  ) {
    voiceSettings.similarity_boost =
      Math.max(
        0,
        Math.min(
          1,
          similarityBoost
        )
      );
  }

  if (
    typeof style === "number" &&
    Number.isFinite(style)
  ) {
    voiceSettings.style =
      Math.max(
        0,
        Math.min(
          1,
          style
        )
      );
  }

  voiceSettings.use_speaker_boost =
    Boolean(useSpeakerBoost);

  const requestBody = {
    text:
      validation.text,

    model_id:
      finalModelId,

    voice_settings:
      voiceSettings
  };

  try {
    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "xi-api-key":
              config.apiKey,

            "Content-Type":
              "application/json",

            "Accept":
              "audio/mpeg"
          },

          body:
            JSON.stringify(
              requestBody
            )
        }
      );

    if (!response.ok) {
      const error =
        await readProviderError(
          response
        );

      return {
        success: false,

        status:
          "PROVIDER_ERROR",

        httpStatus:
          response.status,

        voiceId:
          finalVoiceId,

        model:
          finalModelId,

        error
      };
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      contentType &&
      !contentType.includes(
        "audio"
      )
    ) {
      const unexpectedResponse =
        await response.text();

      return {
        success: false,

        status:
          "INVALID_AUDIO_RESPONSE",

        httpStatus:
          response.status,

        error:
          unexpectedResponse ||
          "ElevenLabs did not return an audio response."
      };
    }

    const audioBuffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (
      audioBuffer.length === 0
    ) {
      return {
        success: false,

        status:
          "EMPTY_AUDIO",

        error:
          "ElevenLabs returned empty audio."
      };
    }

    await fs.writeFile(
      outputFile,
      audioBuffer
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
          "INVALID_AUDIO_FILE",

        error:
          "Generated audio file is missing or empty."
      };
    }

    return {
      success: true,

      status:
        "GENERATED",

      provider:
        "ElevenLabs",

      model:
        finalModelId,

      voiceId:
        finalVoiceId,

      outputFile,

      sizeBytes:
        stats.size,

      format:
        "mp3",

      contentType:
        contentType ||
        "audio/mpeg",

      createdAt:
        new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,

      status:
        "PROVIDER_ERROR",

      voiceId:
        finalVoiceId,

      model:
        finalModelId,

      error:
        error?.message ||
        "ElevenLabs request failed."
    };
  }
}