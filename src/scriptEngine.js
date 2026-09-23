export function validateScript(script) {
  if (!script || typeof script !== "string") {
    return {
      valid: false,
      reason: "Script is missing."
    };
  }

  const cleaned = script.trim();

  if (cleaned.length < 100) {
    return {
      valid: false,
      reason: "Script is too short."
    };
  }

  return {
    valid: true,
    characters: cleaned.length,
    words: cleaned.split(/\s+/).length
  };
}

export function buildScriptRequest(topic) {
  if (!topic?.title) {
    throw new Error("A valid topic is required.");
  }

  return {
    task: "Create an original YouTube Short script.",
    language: "English",
    targetDurationSeconds: 35,
    topic: topic.title,
    category: topic.category || "general",

    rules: [
      "Use original wording.",
      "Do not copy source articles.",
      "Do not invent facts.",
      "Avoid misleading clickbait.",
      "Use a strong but accurate opening hook.",
      "Keep the information understandable.",
      "End naturally without fake engagement tactics."
    ]
  };
}

export function createScriptPlaceholder(topic) {
  return {
    status: "PENDING_AI_PROVIDER",
    topic: topic.title,
    request: buildScriptRequest(topic),
    script: null
  };
}
