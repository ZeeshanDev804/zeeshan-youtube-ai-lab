import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "./storage/audio";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createAudioId() {
  return `audio_${Date.now()}`;
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
    valid: errors.length === 0,
    errors,
    text: cleanTextValue
  };
}

export function getElevenLabsStatus() {
  const config =
    getConfig();

  return {
    configured:
      Boolean(
        config.apiKey &&
        config.voiceId
      ),

    provider:
      "ElevenLabs",

    model:
      config.modelId,

    status:
      config.apiKey &&
      config.voiceId
        ? "CONFIGURED"
        : "NOT_CONFIGURED",

    commercialUse:
      "PAID_PLAN_REQUIRED",

    message:
      "ElevenLabs TTS adapter is ready. Commercial monetized use requires appropriate paid-plan rights."
  };
}

export async function generateElevenLabsVoice({
  text,
  voiceId,
  outputDir =
    DEFAULT_OUTPUT_DIR,
  modelId
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
      status: "NOT_CONFIGURED",
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
              "application/json"
          },

          body:
            JSON.stringify({
              text:
                validation.text,

              model_id:
                finalModelId
            })
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      return {
        success: false,
        status:
          "PROVIDER_ERROR",

        httpStatus:
          response.status,

        error:
          errorText ||
          "ElevenLabs request failed."
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

      createdAt:
        new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,

      status:
        "PROVIDER_ERROR",

      error:
        error?.message ||
        "ElevenLabs request failed."
    };
  }
}