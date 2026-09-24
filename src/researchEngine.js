import "dotenv/config";
import config from "./config.js";
import {
  generateGeminiText,
  getGeminiStatus
} from "./geminiProvider.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url = "") {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function createSourceRecord(source = {}) {
  return {
    title: cleanText(source.title),
    url: normalizeUrl(source.url),
    publisher: cleanText(source.publisher),
    publishedAt: source.publishedAt || null,
    retrievedAt: new Date().toISOString()
  };
}

function normalizeClaims(claims = []) {
  if (!Array.isArray(claims)) return [];

  return claims
    .map((item) => ({
      claim: cleanText(item?.claim),
      status: cleanText(
        item?.status || "UNVERIFIED"
      ).toUpperCase(),
      sources: Array.isArray(item?.sources)
        ? item.sources
            .map(normalizeUrl)
            .filter(Boolean)
        : []
    }))
    .filter((item) => item.claim);
}

function calculateResearchConfidence({
  sourceCount,
  verifiedClaimCount,
  hasRecentSource,
  hasMultiplePublishers
}) {
  let score = 0;

  if (sourceCount >= 1) score += 25;
  if (sourceCount >= 2) score += 20;
  if (verifiedClaimCount >= 1) score += 25;
  if (verifiedClaimCount >= 2) score += 15;
  if (hasRecentSource) score += 10;
  if (hasMultiplePublishers) score += 5;

  return Math.min(100, score);
}

function parseJsonResponse(text = "") {
  const raw = String(text).trim();

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function validateResearchInput(topic) {
  if (!topic || typeof topic !== "object") {
    return {
      valid: false,
      reason: "Topic is missing."
    };
  }

  if (
    !topic.title ||
    String(topic.title).trim().length < 5
  ) {
    return {
      valid: false,
      reason: "Topic title is invalid."
    };
  }

  return {
    valid: true
  };
}

export function buildResearchRequest(topic) {
  const validation =
    validateResearchInput(topic);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  return {
    topic: cleanText(topic.title),
    region:
      topic.region ||
      config.audience?.regions?.[0] ||
      "US",
    language:
      config.audience?.language ||
      "English",
    instructions: [
      "Find reliable and relevant evidence.",
      "Prefer primary or authoritative sources.",
      "Do not invent sources or URLs.",
      "Do not invent factual claims.",
      "Separate confirmed facts from uncertainty.",
      "Identify claims requiring verification.",
      "Do not treat social media as automatically verified.",
      "Record source URLs.",
      "Do not copy source wording."
    ]
  };
}

export function buildResearchResult({
  topic,
  sources = [],
  claims = [],
  notes = []
} = {}) {
  const normalizedSources = sources
    .map(createSourceRecord)
    .filter((source) => source.url);

  const normalizedClaims =
    normalizeClaims(claims);

  const verifiedClaimCount =
    normalizedClaims.filter(
      (claim) =>
        claim.status === "VERIFIED" ||
        claim.status === "CONFIRMED"
    ).length;

  const publishers = new Set(
    normalizedSources
      .map((source) => source.publisher)
      .filter(Boolean)
      .map((publisher) =>
        publisher.toLowerCase()
      )
  );

  const hasRecentSource =
    normalizedSources.some(
      (source) => Boolean(source.publishedAt)
    );

  const confidence =
    calculateResearchConfidence({
      sourceCount:
        normalizedSources.length,
      verifiedClaimCount,
      hasRecentSource,
      hasMultiplePublishers:
        publishers.size >= 2
    });

  let status =
    "INSUFFICIENT_RESEARCH";

  if (
    confidence >= 70 &&
    verifiedClaimCount >= 1 &&
    normalizedSources.length >= 1
  ) {
    status = "RESEARCH_SUPPORTED";
  } else if (confidence >= 40) {
    status = "REVIEW_REQUIRED";
  }

  return {
    status,
    topic: cleanText(topic?.title),
    region: topic?.region || null,
    confidence,
    sources: normalizedSources,
    claims: normalizedClaims,
    notes: Array.isArray(notes)
      ? notes.map(cleanText).filter(Boolean)
      : [],
    generatedAt:
      new Date().toISOString()
  };
}

function buildResearchPrompt(request) {
  return `
You are the factual research engine for
ZEESHAN AI LABS.

Topic:
${request.topic}

Region:
${request.region}

Language:
${request.language}

Return ONLY valid JSON.

{
  "sources": [
    {
      "title": "",
      "url": "",
      "publisher": "",
      "publishedAt": ""
    }
  ],
  "claims": [
    {
      "claim": "",
      "status": "VERIFIED|UNVERIFIED|CONTRADICTED|REVIEW_REQUIRED",
      "sources": []
    }
  ],
  "notes": []
}

Rules:
1. Never invent a source.
2. Never invent a URL.
3. Never invent a factual claim.
4. Only mark a claim VERIFIED when reliable evidence supports it.
5. If evidence is unavailable, use UNVERIFIED or REVIEW_REQUIRED.
6. Prefer official and authoritative sources.
7. Do not copy article text.
8. Clearly identify uncertainty.
9. If reliable evidence is unavailable, return empty sources.
10. This result is used by an automated publishing system.
`.trim();
}

export async function researchTopic(topic) {
  const request =
    buildResearchRequest(topic);

  const provider =
    getGeminiStatus();

  if (!provider.configured) {
    return {
      status:
        "READY_FOR_RESEARCH_PROVIDER",

      providerStatus:
        "NOT_CONFIGURED",

      request,

      result:
        buildResearchResult({
          topic,
          sources: [],
          claims: [],
          notes: [
            "No research provider is configured.",
            "No factual claim has been marked as verified."
          ]
        })
    };
  }

  const response =
    await generateGeminiText({
      prompt:
        buildResearchPrompt(request),
      systemInstruction:
        "You are a strict factual research assistant. Never fabricate evidence."
    });

  if (!response?.success) {
    return {
      status:
        "RESEARCH_PROVIDER_ERROR",

      providerStatus:
        response?.status ||
        "ERROR",

      request,

      result:
        buildResearchResult({
          topic,
          sources: [],
          claims: [],
          notes: [
            "Research provider failed.",
            response?.reason ||
              response?.error ||
              "Unknown provider error."
          ]
        })
    };
  }

  const parsed =
    parseJsonResponse(
      response.text
    );

  if (!parsed) {
    return {
      status:
        "RESEARCH_PARSE_ERROR",

      providerStatus:
        "READY",

      request,

      result:
        buildResearchResult({
          topic,
          sources: [],
          claims: [],
          notes: [
            "Research provider returned invalid JSON.",
            "No factual claim has been marked as verified."
          ]
        })
    };
  }

  const result =
    buildResearchResult({
      topic,
      sources:
        Array.isArray(parsed.sources)
          ? parsed.sources
          : [],
      claims:
        Array.isArray(parsed.claims)
          ? parsed.claims
          : [],
      notes:
        Array.isArray(parsed.notes)
          ? parsed.notes
          : []
    });

  return {
    status: result.status,
    providerStatus: "READY",
    provider: provider.provider,
    model: provider.model,
    request,
    result,
    researchComplete:
      result.status ===
      "RESEARCH_SUPPORTED"
  };
}

export function getResearchStatus(
  researchResult = null
) {
  if (
    researchResult?.result?.status
  ) {
    return researchResult.result.status;
  }

  if (researchResult?.status) {
    return researchResult.status;
  }

  return "UNKNOWN";
}

export function getResearchSources(
  researchResult = null
) {
  if (
    Array.isArray(
      researchResult?.result?.sources
    )
  ) {
    return researchResult.result.sources;
  }

  if (
    Array.isArray(
      researchResult?.sources
    )
  ) {
    return researchResult.sources;
  }

  return [];
}

export function getResearchConfidence(
  researchResult = null
) {
  const value =
    researchResult?.result?.confidence ??
    researchResult?.confidence ??
    0;

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

export function getResearchEngineStatus() {
  const provider =
    getGeminiStatus();

  return {
    module: "Research Engine",
    provider:
      provider.provider || "unknown",
    model:
      provider.model || "unknown",
    providerConfigured:
      Boolean(provider.configured),
    status:
      provider.configured
        ? "READY"
        : "NOT_CONFIGURED",
    safetyRule:
      "Unverified research must not enter automatic publishing."
  };
}