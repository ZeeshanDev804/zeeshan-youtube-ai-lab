import {
  getElevenLabsStatus,
  generateElevenLabsVoice
} from "./elevenLabsProvider.js";

import {
  checkAudioOutput
} from "./ttsProvider.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateProductionVoice({
  script,
  language = "en-US",
  voiceId,
  outputDir = "./storage/audio"
} = {}) {
  const cleanScript = cleanText(script);

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID_SCRIPT",
      error: "Script is required."
    };
  }

  const providerStatus =
    getElevenLabsStatus();

  if (
    providerStatus.status !==
    "CONFIGURED"
  ) {
    return {
      success: false,
      status:
        "VOICE_PROVIDER_REQUIRED",
      provider:
        providerStatus.provider ||
        "ElevenLabs",
      providerStatus,
      message:
        providerStatus.message ||
        "ElevenLabs TTS is not configured."
    };
  }

  const selectedVoice =
    cleanText(
      voiceId ||
      process.env.ELEVENLABS_VOICE_ID ||
      ""
    );

  if (!selectedVoice) {
    return {
      success: false,
      status:
        "VOICE_ID_REQUIRED",
      error:
        "ELEVENLABS_VOICE_ID is required."
    };
  }

  const result =
    await generateElevenLabsVoice({
      text: cleanScript,
      voiceId: selectedVoice,
      outputDir
    });

  if (!result?.success) {
    return {
      success: false,
      status:
        "VOICE_GENERATION_FAILED",
      provider:
        "ElevenLabs",
      providerResult:
        result
    };
  }

  if (!result.outputFile) {
    return {
      success: false,
      status:
        "VOICE_OUTPUT_MISSING",
      error:
        "ElevenLabs returned success but no audio output file.",
      providerResult:
        result
    };
  }

  const audioCheck =
    await checkAudioOutput(
      result.outputFile
    );

  if (!audioCheck.valid) {
    return {
      success: false,
      status:
        "VOICE_OUTPUT_INVALID",
      error:
        audioCheck.reason ||
        "Generated audio file is invalid.",
      providerResult:
        result
    };
  }

  const durationSeconds =
    Number(
      audioCheck.durationSeconds
    );

  if (
    !Number.isFinite(
      durationSeconds
    ) ||
    durationSeconds <= 0
  ) {
    return {
      success: false,
      status:
        "VOICE_DURATION_INVALID",
      error:
        "Generated voice audio has no valid duration.",
      audioCheck,
      providerResult:
        result
    };
  }

  return {
    success: true,
    status:
      "VOICE_READY",

    provider:
      "ElevenLabs",

    model:
      result.model ||
      providerStatus.model ||
      process.env.ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2",

    outputFile:
      result.outputFile,

    sizeBytes:
      audioCheck.sizeBytes,

    durationSeconds,

    format:
      audioCheck.extension
        ? audioCheck.extension.replace(
            ".",
            ""
          )
        : "mp3",

    hasAudio:
      audioCheck.hasAudio === true,

    language,

    voiceId:
      selectedVoice,

    createdAt:
      new Date().toISOString()
  };
}

export function getVoiceProductionStatus() {
  const providerStatus =
    getElevenLabsStatus();

  return {
    configured:
      providerStatus.status ===
      "CONFIGURED",

    provider:
      providerStatus.provider ||
      "ElevenLabs",

    status:
      providerStatus.status,

    model:
      providerStatus.model ||
      process.env.ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2",

    commercialUse:
      providerStatus.commercialUse ||
      null,

    message:
      providerStatus.message ||
      "ElevenLabs voice provider status."
  };
}

export default {
  generateProductionVoice,
  getVoiceProductionStatus
};