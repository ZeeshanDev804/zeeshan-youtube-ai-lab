export function createVoiceJob({
  script,
  language = "en",
  voice = "default"
} = {}) {
  if (!script || String(script).trim().length === 0) {
    throw new Error("Voice job requires a script.");
  }

  return {
    id: `voice_${Date.now()}`,
    status: "READY_FOR_TTS",
    createdAt: new Date().toISOString(),
    language,
    voice,
    script
  };
}

export function validateVoiceFile(filePath) {
  if (!filePath) {
    return {
      valid: false,
      reason: "Voice file is missing."
    };
  }

  return {
    valid: true,
    filePath
  };
}
