import config from "./config.js";
import { GoogleGenAI } from "@google/genai";

function getAIClient() {
  if (!config.ai.apiKey) {
    throw new Error(
      "AI_API_KEY is missing. Add the Gemini API key as a secure environment variable."
    );
  }

  return new GoogleGenAI({
    apiKey: config.ai.apiKey
  });
}

function cleanJsonText(text = "") {
  return String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validateGeneratedScript(data) {
  if (!data || typeof data !== "object") {
    throw new Error("AI returned an invalid script object.");
  }

  if (!data.title || !data.script) {
    throw new Error(
      "AI response is missing title or script."
    );
  }

  const script = String(data.script).trim();

  if (script.length < 100) {
    throw new Error(
      "Generated script is too short."
    );
  }

  return {
    title: String(data.title).trim(),
    hook: String(data.hook || "").trim(),
    script,
    description: String(
      data.description || ""
    ).trim(),
    hashtags: Array.isArray(data.hashtags)
      ? data.hashtags
          .map((tag) => String(tag).trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    category: String(
      data.category || "general"
    ).trim()
  };
}

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
    task: "Create an original YouTube Short.",
    language: config.audience.language,
    targetDurationSeconds: 35,

    topic: topic.title,

    category:
      topic.category || "general",

    region:
      topic.region || "US",

    rules: [
      "Write completely original wording.",
      "Do not copy articles or other creators.",
      "Do not invent facts.",
      "Do not present uncertain information as confirmed.",
      "Avoid misleading clickbait.",
      "Create a strong accurate opening hook.",
      "Keep the script concise and easy to understand.",
      "Use natural spoken English.",
      "Do not use fake quotes.",
      "Do not encourage fake engagement.",
      "Do not impersonate real people.",
      "Do not create fabricated news.",
      "End naturally."
    ]
  };
}

export async function generateScript(topic) {
  const request = buildScriptRequest(topic);

  const ai = getAIClient();

  const model =
    config.ai.model ||
    "gemini-2.5-flash";

  const prompt = `
You are the professional scriptwriter for
ZEESHAN AI YOUTUBE LAB.

Create ONE original YouTube Short script.

TOPIC:
${request.topic}

CATEGORY:
${request.category}

TARGET REGION:
${request.region}

TARGET LANGUAGE:
${request.language}

TARGET LENGTH:
Approximately ${request.targetDurationSeconds} seconds.

IMPORTANT RULES:

1. Write original content.
2. Never copy wording from articles, websites,
   videos or other creators.
3. Never invent facts.
4. If a claim cannot safely be established,
   do not present it as fact.
5. No fake news.
6. No fake quotes.
7. No misleading clickbait.
8. No impersonation.
9. No fake engagement requests.
10. Make the opening hook interesting but accurate.
11. Make the narration natural for an AI voice.
12. Keep the information useful and entertaining.
13. Use simple international English.
14. Do not mention that you are an AI.
15. Do not include production instructions
    inside the spoken script.

Return ONLY valid JSON.

Required JSON structure:

{
  "title": "Short accurate YouTube title",
  "hook": "Opening hook",
  "script": "Complete spoken narration",
  "description": "Short YouTube description",
  "hashtags": ["#Shorts", "#..."],
  "category": "technology"
}
`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.7,
      responseMimeType: "application/json"
    }
  });

  const rawText =
    response?.text || "";

  if (!rawText.trim()) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(
      cleanJsonText(rawText)
    );
  } catch (error) {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }

  return validateGeneratedScript(parsed);
}

export function createScriptPlaceholder(topic) {
  return {
    status: "READY_FOR_AI",
    topic: topic.title,
    request: buildScriptRequest(topic),
    script: null
  };
}