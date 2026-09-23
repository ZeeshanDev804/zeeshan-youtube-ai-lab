import config from "./config.js";

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
  const url = normalizeUrl(source.url);

  return {
    title: cleanText(source.title || ""),
    url,
    publisher: cleanText(source.publisher || ""),
    publishedAt: source.publishedAt || null,
    retrievedAt: new Date().toISOString()
  };
}

function calculateResearchConfidence({
  sourceCount,
  hasRecentSource,
  hasMultiplePublishers
}) {
  let score = 0;

  if (sourceCount >= 1) {
    score += 40;
  }

  if (sourceCount >= 2) {
    score += 25;
  }

  if (hasRecentSource) {
    score += 20;
  }

  if (hasMultiplePublishers) {
    score += 15;
  }

  return Math.min(100, score);
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
      config.audience.regions[0] ||
      "US",

    language:
      config.audience.language,

    instructions: [
      "Find reliable and relevant sources.",
      "Prefer primary or authoritative sources.",
      "Compare important factual claims.",
      "Do not treat social media posts as automatically verified.",
      "Identify uncertainty.",
      "Separate confirmed facts from speculation.",
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

      hasRecentSource,

      hasMultiplePublishers:
        publishers.size >= 2
    });

  return {
    status:
      confidence >= 70
        ? "RESEARCH_SUPPORTED"
        : confidence >= 40
          ? "REVIEW_REQUIRED"
          : "INSUFFICIENT_RESEARCH",

    topic: cleanText(
      topic?.title || ""
    ),

    region:
      topic?.region || null,

    confidence,

    sources:
      normalizedSources,

    claims: Array.isArray(claims)
      ? claims.map((claim) => ({
          claim: cleanText(
            claim.claim || ""
          ),
          status:
            claim.status ||
            "UNVERIFIED",
          sources:
            Array.isArray(claim.sources)
              ? claim.sources
              : []
        }))
      : [],

    notes:
      Array.isArray(notes)
        ? notes.map(cleanText)
        : [],

    generatedAt:
      new Date().toISOString()
  };
}

export async function researchTopic(topic) {
  /*
   * Real search-provider integration will be
   * connected in the next integration stage.
   *
   * This function intentionally does NOT invent
   * sources or factual claims.
   */

  const request =
    buildResearchRequest(topic);

  return {
    status: "READY_FOR_RESEARCH_PROVIDER",
    request,
    result: buildResearchResult({
      topic,
      sources: [],
      claims: [],
      notes: [
        "No live research provider is configured yet.",
        "No factual claim has been marked as verified."
      ]
    })
  };
}
