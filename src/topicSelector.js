const TARGET_REGIONS = [
  "US",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL"
];

function scoreTopic(topic) {
  let score = 0;

  score += Number(topic.trendScore || 0) * 0.45;
  score += Number(topic.relevanceScore || 0) * 0.30;
  score += Number(topic.originalityScore || 0) * 0.15;
  score += Number(topic.visualScore || 0) * 0.10;

  return Math.round(score * 100) / 100;
}

export function selectTopics(
  topics = [],
  maxTopics = 5
) {
  const prepared = topics
    .filter(Boolean)
    .map((topic) => ({
      ...topic,
      region: topic.region || TARGET_REGIONS[0],
      score: scoreTopic(topic)
    }))
    .filter((topic) => topic.score > 0);

  prepared.sort((a, b) => b.score - a.score);

  const selected = [];
  const usedRegions = new Set();

  for (const topic of prepared) {
    if (selected.length >= maxTopics) {
      break;
    }

    const region = topic.region;

    if (!usedRegions.has(region) || selected.length < 2) {
      selected.push(topic);
      usedRegions.add(region);
    }
  }

  return selected;
}

export function validateTopic(topic) {
  if (!topic || typeof topic !== "object") {
    return {
      valid: false,
      reason: "Topic object is missing."
    };
  }

  if (!topic.title || String(topic.title).trim().length < 5) {
    return {
      valid: false,
      reason: "Topic title is too short."
    };
  }

  return {
    valid: true,
    reason: null
  };
}
