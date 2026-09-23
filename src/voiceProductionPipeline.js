import {
  getTTSProviderStatus
} from "./ttsProvider.js";

import {
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
  const cleanScript =
    cleanText(script);

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID_SCRIPT",
      error:
        "Script is required."
    };
  }

  const providerStatus =
    getTTSProviderStatus();

  if (
    providerStatus.status !==
    "CONFIGURED"
  ) {
    return {
      success: false,
      status: "VOICE_PROVIDER_REQUIRED",
      provider:
        providerStatus.provider,
      message:
        providerStatus.message
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
      status: "VOICE_ID_REQUIRED",
      error:
        "ELEVENLABS_VOICE_ID is required."
    };
  }

  const result =
    await generateElevenLabsVoice({
      text:
        cleanScript,
      language,
      voiceId:
        selectedVoice,
      outputDir
    });

  if (!result.success) {
    return {
      success: false,
      status:
        "VOICE_GENERATION_FAILED",
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
        audioCheck.reason,
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
    outputFile:
      result.outputFile,
    sizeBytes:
      audioCheck.sizeBytes,
    language,
    voiceId:
      selectedVoice,
    createdAt:
      new Date().toISOString()
  };
}

export function getVoiceProductionStatus() {
  const providerStatus =
    getTTSProviderStatus();

  return {
    configured:
      providerStatus.status ===
      "CONFIGURED",
    provider:
      providerStatus.provider ||
      "ElevenLabs",
    status:
      providerStatus.status,
    message:
      providerStatus.message
  };
}
