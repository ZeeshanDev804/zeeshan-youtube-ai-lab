import config from "./config.js";

const GOOGLE_TRENDS_URL =
  "https://trends.google.com/trends/api/dailytrends";

const REGION_MAP = {
  US: "US",
  GB: "GB",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  ES: "ES",
  NL: "NL"
};

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTopic(item, region) {
  const title = cleanText(
    item?.title?.query ||
    item?.title ||
    item?.query ||
    ""
  );

  if (!title) {
    return null;
  }

  const traffic =
    item?.formattedTraffic ||
    item?.traffic ||
    "";

  return {
    id: `trend_${region}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`,

    title,

    category: "general",

    region,

    trendScore: 50,

    relevanceScore: 50,

    originalityScore: 50,

    visualScore: 50,

    traffic,

    source: "google-trends",

    collectedAt: new Date().toISOString()
  };
}

async function fetchGoogleDailyTrends(region) {
  const geo = REGION_MAP[region];

  if (!geo) {
    return [];
  }

  const url =
    `${GOOGLE_TRENDS_URL}?hl=en-US&tz=0&geo=${geo}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "ZEESHAN-AI-YOUTUBE-LAB/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Google Trends request failed for ${region}: ${response.status}`
    );
  }

  const raw = await response.text();

  /*
   * Google Trends may return a JSON security prefix.
   */
  const jsonText = raw.replace(
    /^\)\]\}',?\n/,
    ""
  );

  const data = JSON.parse(jsonText);

  const searches =
    data?.default?.trendingSearches || [];

  return searches
    .map((item) =>
      normalizeTopic(item, region)
    )
    .filter(Boolean);
}

function scoreTopic(topic) {
  const trafficText =
    String(topic.traffic || "")
      .replace(/[,+]/g, "");

  const trafficNumber =
    parseFloat(trafficText) || 0;

  let trendScore =
    topic.trendScore || 50;

  if (trafficNumber >= 1000000) {
    trendScore += 30;
  } else if (trafficNumber >= 500000) {
    trendScore += 20;
  } else if (trafficNumber >= 100000) {
    trendScore += 10;
  }

  return Math.min(
    100,
    Math.round(trendScore)
  );
}

function deduplicateTopics(topics) {
  const seen = new Set();
  const result = [];

  for (const topic of topics) {
    const key = cleanText(
      topic.title
    ).toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(topic);
  }

  return result;
}

export async function collectTrends() {
  const regions =
    Array.isArray(config.audience.regions) &&
    config.audience.regions.length > 0
      ? config.audience.regions
      : Object.keys(REGION_MAP);

  const allTopics = [];
  const sourceErrors = [];

  for (const region of regions) {
    try {
      const topics =
        await fetchGoogleDailyTrends(region);

      allTopics.push(...topics);
    } catch (error) {
      sourceErrors.push({
        region,
        error: error.message
      });
    }
  }

  const uniqueTopics =
    deduplicateTopics(allTopics);

  const scoredTopics =
    uniqueTopics.map((topic) => ({
      ...topic,
      trendScore: scoreTopic(topic)
    }));

  scoredTopics.sort(
    (a, b) =>
      b.trendScore - a.trendScore
  );

  return {
    generatedAt:
      new Date().toISOString(),

    lookbackHours:
      config.trends.lookbackHours,

    topicCount:
      scoredTopics.length,

    topics:
      scoredTopics.slice(
        0,
        config.trends.maxTopics
      ),

    sourceStatus:
      sourceErrors.length === 0
        ? "LIVE"
        : scoredTopics.length > 0
          ? "PARTIAL"
          : "FAILED",

    sourceErrors
  };
}

export async function getTrendRadar() {
  return collectTrends();
}