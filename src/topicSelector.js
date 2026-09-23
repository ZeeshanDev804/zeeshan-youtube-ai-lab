import config from "./config.js";

const BLOCKED_TOPIC_PATTERNS = [
  /\bhow to hack\b/i,
  /\bmalware\b/i,
  /\bransomware\b/i,
  /\bterrorist attack\b/i,
  /\bexplosive\b/i,
  /\bmake a bomb\b/i,
  /\bself harm\b/i
];

const PREFERRED_CATEGORIES = [
  "technology",
  "science",
  "business",
  "entertainment",
  "sports",
  "culture",
  "gaming"
];

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlocked(topic) {
  const text = normalize(
    `${topic.title || ""} ${topic.category || ""}`
  );

  return BLOCKED_TOPIC_PATTERNS.some(
    (pattern) => pattern.test(text)
  );
}

function calculateScore(topic) {
  const trend =
    Number(topic.trendScore || 0);

  const relevance =
    Number(topic.relevanceScore || 0);

  const originality =
    Number(topic.originalityScore || 0);

  const visual =
    Number(topic.visualScore || 0);

  let score =
    trend * 0.45 +
    relevance * 0.25 +
    originality * 0.20 +
    visual * 0.10;

  if (
    PREFERRED_CATEGORIES.includes(
      normalize(topic.category)
    )
  ) {
    score += 5;
  }

  return Math.min(
    100,
    Math.round(score * 100) / 100
  );
}

export function validateTopic(topic) {
  if (!topic || typeof topic !== "object") {
    return {
      valid: false,
      reason: "Topic object is missing."
    };
  }

  if (
    !topic.title ||
    String(topic.title).trim().length < 5
  ) {
    return {
      valid: false,
      reason: "Topic title is too short."
    };
  }

  if (isBlocked(topic)) {
    return {
      valid: false,
      reason: "Topic matched a blocked safety pattern."
    };
  }

  return {
    valid: true,
    reason: null
  };
}

export function selectTopics(
  topics = [],
  maxTopics = config.system.maxDailyVideos
) {
  const safeTopics = [];

  for (const topic of topics) {
    const validation =
      validateTopic(topic);

    if (!validation.valid) {
      continue;
    }

    safeTopics.push({
      ...topic,
      score: calculateScore(topic)
    });
  }

  safeTopics.sort(
    (a, b) => b.score - a.score
  );

  const selected = [];
  const usedTitles = new Set();

  for (const topic of safeTopics) {
    if (selected.length >= maxTopics) {
      break;
    }

    const key = normalize(
      topic.title
    );

    if (usedTitles.has(key)) {
      continue;
    }

    usedTitles.add(key);

    selected.push(topic);
  }

  return selected;
}

export function rankTopics(topics = []) {
  return topics
    .filter(Boolean)
    .map((topic) => ({
      ...topic,
      score: calculateScore(topic)
    }))
    .sort(
      (a, b) => b.score - a.score
    );
}