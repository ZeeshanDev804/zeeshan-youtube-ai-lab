import config from "./config.js";

const GOOGLE_TRENDS_URL =
  "https://trends.google.com/trends/api/dailytrends";

/*
|--------------------------------------------------------------------------
| Worldwide regions
|--------------------------------------------------------------------------
|
| USA       -> US
| UK        -> GB
| EUROPE    -> DE, FR, IT, ES, NL
| MIDDLE_EAST -> AE, SA, QA
|
| ALL       -> all supported regions
|--------------------------------------------------------------------------
*/

const REGION_MAP = {
  USA: ["US"],
  UK: ["GB"],

  EUROPE: [
    "DE",
    "FR",
    "IT",
    "ES",
    "NL"
  ],

  MIDDLE_EAST: [
    "AE",
    "SA",
    "QA"
  ]
};

const DEFAULT_REGIONS = [
  "USA",
  "UK",
  "EUROPE",
  "MIDDLE_EAST"
];

const MIN_TREND_SCORE = 50;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function normalizeRegion(region) {
  const value =
    cleanText(region || "")
      .toUpperCase();

  if (!value) {
    return "ALL";
  }

  const aliases = {
    US: "USA",
    USA: "USA",

    GB: "UK",
    UK: "UK",

    EU: "EUROPE",
    EUROPE: "EUROPE",

    ME: "MIDDLE_EAST",
    MIDDLEEAST: "MIDDLE_EAST",
    "MIDDLE EAST": "MIDDLE_EAST",
    MIDDLE_EAST: "MIDDLE_EAST",

    ALL: "ALL"
  };

  return aliases[value] || value;
}

function getGeosForRegion(region = "ALL") {
  const normalized =
    normalizeRegion(region);

  if (normalized === "ALL") {
    return DEFAULT_REGIONS.flatMap(
      (item) =>
        REGION_MAP[item] || []
    );
  }

  return REGION_MAP[normalized] || [];
}

function normalizeRequestedVideos(
  requestedVideos
) {
  const value =
    safeNumber(
      requestedVideos,
      5
    );

  return Math.max(
    1,
    Math.min(
      50,
      Math.floor(value)
    )
  );
}

function normalizeTopic(
  item,
  region,
  geo
) {
  const title =
    cleanText(
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
    id:
      `trend_${region}_${geo}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    title,

    category:
      "general",

    region,

    geo,

    trendScore:
      50,

    relevanceScore:
      50,

    originalityScore:
      50,

    visualScore:
      50,

    traffic,

    source:
      "google-trends",

    collectedAt:
      new Date().toISOString()
  };
}

async function fetchGoogleDailyTrends(
  geo
) {
  const url =
    `${GOOGLE_TRENDS_URL}?hl=en-US&tz=0&geo=${geo}`;

  const response =
    await fetch(url, {
      headers: {
        "User-Agent":
          "ZEESHAN-AI-YOUTUBE-LAB/1.0"
      }
    });

  if (!response.ok) {
    throw new Error(
      `Google Trends request failed for ${geo}: ${response.status}`
    );
  }

  const raw =
    await response.text();

  /*
   * Google Trends can return
   * a JSON security prefix.
   */
  const jsonText =
    raw.replace(
      /^\)\]\}',?\n/,
      ""
    );

  const data =
    JSON.parse(jsonText);

  const searches =
    data?.default?.trendingSearches || [];

  return searches;
}

function parseTraffic(value) {
  const text =
    cleanText(value)
      .toLowerCase()
      .replace(/,/g, "");

  if (!text) {
    return 0;
  }

  const match =
    text.match(
      /([\d.]+)\s*([km])?/
    );

  if (!match) {
    return 0;
  }

  let number =
    parseFloat(match[1]);

  const suffix =
    match[2];

  if (suffix === "m") {
    number *= 1000000;
  } else if (suffix === "k") {
    number *= 1000;
  }

  return Number.isFinite(number)
    ? number
    : 0;
}

function scoreTopic(topic) {
  const trafficNumber =
    parseTraffic(
      topic?.traffic
    );

  let trendScore =
    safeNumber(
      topic?.trendScore,
      50
    );

  /*
   * Traffic strength
   */
  if (trafficNumber >= 1000000) {
    trendScore += 30;
  } else if (trafficNumber >= 500000) {
    trendScore += 20;
  } else if (trafficNumber >= 100000) {
    trendScore += 10;
  } else if (trafficNumber >= 50000) {
    trendScore += 5;
  }

  /*
   * Keep score within 0–100.
   */
  return Math.min(
    100,
    Math.max(
      0,
      Math.round(trendScore)
    )
  );
}

function calculateTopicScores(
  topic
) {
  const trendScore =
    scoreTopic(topic);

  /*
   * These are discovery-stage
   * estimates only.
   *
   * Research, safety, copyright
   * and duplicate guards remain
   * the final protection layers.
   */

  const relevanceScore =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          trendScore * 0.9
        )
      )
    );

  const visualScore =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          trendScore * 0.8
        )
      )
    );

  const originalityScore =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          trendScore * 0.75
        )
      )
    );

  return {
    ...topic,

    trendScore,

    relevanceScore,

    visualScore,

    originalityScore
  };
}

function deduplicateTopics(
  topics
) {
  const seen =
    new Set();

  const result =
    [];

  for (const topic of topics) {
    const key =
      cleanText(
        topic?.title
      )
        .toLowerCase();

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(
      topic
    );
  }

  return result;
}

function rankTopics(
  topics
) {
  return [...topics]
    .sort(
      (a, b) => {

        const scoreA =
          (
            safeNumber(
              a.trendScore
            ) * 0.50
          ) +
          (
            safeNumber(
              a.relevanceScore
            ) * 0.25
          ) +
          (
            safeNumber(
              a.visualScore
            ) * 0.15
          ) +
          (
            safeNumber(
              a.originalityScore
            ) * 0.10
          );

        const scoreB =
          (
            safeNumber(
              b.trendScore
            ) * 0.50
          ) +
          (
            safeNumber(
              b.relevanceScore
            ) * 0.25
          ) +
          (
            safeNumber(
              b.visualScore
            ) * 0.15
          ) +
          (
            safeNumber(
              b.originalityScore
            ) * 0.10
          );

        return scoreB - scoreA;
      }
    );
}

function selectTopics(
  topics,
  requestedVideos
) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  /*
   * 5 is the normal daily target,
   * NOT a hard maximum.
   *
   * We therefore select up to the
   * requested number of good topics.
   */
  return topics
    .filter(
      (topic) =>
        safeNumber(
          topic.trendScore
        ) >= MIN_TREND_SCORE
    )
    .slice(
      0,
      requested
    );
}

export async function collectTrends(
  options = {}
) {
  const region =
    normalizeRegion(
      options?.region
    );

  const requestedVideos =
    normalizeRequestedVideos(
      options?.requestedVideos
    );

  let regions;

  /*
   * If orchestrator gives a specific
   * region, use that region.
   */
  if (
    region !== "ALL" &&
    REGION_MAP[region]
  ) {
    regions = [region];
  } else {

    /*
     * Otherwise use config audience
     * regions if available.
     */
    const configured =
      Array.isArray(
        config?.audience?.regions
      )
        ? config.audience.regions
        : [];

    const normalizedConfigured =
      configured
        .map(
          normalizeRegion
        )
        .filter(
          (item) =>
            item === "USA" ||
            item === "UK" ||
            item === "EUROPE" ||
            item === "MIDDLE_EAST"
        );

    regions =
      normalizedConfigured.length > 0
        ? [
            ...new Set(
              normalizedConfigured
            )
          ]
        : DEFAULT_REGIONS;
  }

  const allTopics =
    [];

  const sourceErrors =
    [];

  /*
   * Collect Google Trends from
   * every selected region.
   */
  for (const selectedRegion of regions) {

    const geos =
      getGeosForRegion(
        selectedRegion
      );

    for (const geo of geos) {

      try {

        const rawTopics =
          await fetchGoogleDailyTrends(
            geo
          );

        const topics =
          rawTopics
            .map(
              (item) =>
                normalizeTopic(
                  item,
                  selectedRegion,
                  geo
                )
            )
            .filter(Boolean);

        allTopics.push(
          ...topics
        );

      } catch (error) {

        sourceErrors.push({
          region:
            selectedRegion,

          geo,

          error:
            error?.message ||
            "Unknown Google Trends error"
        });
      }
    }
  }

  /*
   * Remove duplicate topics
   * across countries/regions.
   */
  const uniqueTopics =
    deduplicateTopics(
      allTopics
    );

  /*
   * Calculate discovery scores.
   */
  const scoredTopics =
    uniqueTopics.map(
      calculateTopicScores
    );

  /*
   * Rank strongest topics first.
   */
  const rankedTopics =
    rankTopics(
      scoredTopics
    );

  /*
   * Select requested amount.
   */
  const selectedTopics =
    selectTopics(
      rankedTopics,
      requestedVideos
    );

  return {

    success:
      true,

    generatedAt:
      new Date().toISOString(),

    lookbackHours:
      safeNumber(
        config?.trends?.lookbackHours,
        24
      ),

    requestedVideos,

    dailyTarget:
      5,

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    region,

    regions,

    topicCount:
      rankedTopics.length,

    selectedTopicCount:
      selectedTopics.length,

    topics:
      selectedTopics,

    allTopics:
      rankedTopics,

    sourceStatus:
      sourceErrors.length === 0
        ? "LIVE"
        : rankedTopics.length > 0
          ? "PARTIAL"
          : "FAILED",

    sourceErrors
  };
}

export async function getTrendRadar(
  options = {}
) {
  return collectTrends(
    options
  );
}

export default {
  collectTrends,
  getTrendRadar
};