import config from "./config.js";

const GOOGLE_TRENDS_URL =
  "https://trends.google.com/trends/api/dailytrends";

/*
|--------------------------------------------------------------------------
| Worldwide regions
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

/*
|--------------------------------------------------------------------------
| Safe fallback topics
|--------------------------------------------------------------------------
|
| IMPORTANT:
| These are NOT presented as live Google Trends.
|
| They are discovery fallback topics used only when
| the live trend source gives no usable topics.
|
| They still have to pass the later:
| - research
| - safety
| - copyright
| - duplicate
| - quality
| - CEO publish
| gates before publication.
|--------------------------------------------------------------------------
*/

const FALLBACK_TOPICS = {
  USA: [
    "useful AI tools for everyday work",
    "AI productivity tips for professionals",
    "simple technology tips that save time",
    "useful smartphone features people miss",
    "practical cybersecurity tips for everyday users"
  ],

  UK: [
    "useful AI tools for everyday work",
    "practical productivity tips",
    "useful technology tips for everyday life",
    "simple cybersecurity tips",
    "AI tools that can save time"
  ],

  EUROPE: [
    "useful AI tools for everyday work",
    "practical technology tips",
    "AI productivity ideas",
    "simple cybersecurity tips",
    "useful digital tools for everyday life"
  ],

  MIDDLE_EAST: [
    "useful AI tools for everyday work",
    "AI productivity tips for professionals",
    "useful smartphone features",
    "practical cybersecurity tips",
    "technology tips that save time",
    "useful digital tools for everyday life"
  ]
};


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

    fallback:
      false,

    collectedAt:
      new Date().toISOString()
  };
}


function createFallbackTopic(
  title,
  region,
  index = 0
) {
  return {
    id:
      `fallback_${region}_${Date.now()}_${index}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    title:
      cleanText(title),

    category:
      "general",

    region,

    geo:
      "FALLBACK",

    trendScore:
      50,

    relevanceScore:
      70,

    originalityScore:
      65,

    visualScore:
      75,

    traffic:
      "",

    source:
      "safe-fallback",

    fallback:
      true,

    fallbackReason:
      "No valid live Google Trends were available for this region.",

    collectedAt:
      new Date().toISOString()
  };
}


function getFallbackTopics(
  region,
  requestedVideos
) {
  const normalizedRegion =
    normalizeRegion(region);

  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  const regionalTopics =
    FALLBACK_TOPICS[
      normalizedRegion
    ] ||
    FALLBACK_TOPICS.EUROPE;

  return regionalTopics
    .slice(
      0,
      requested
    )
    .map(
      (title, index) =>
        createFallbackTopic(
          title,
          normalizedRegion,
          index
        )
    );
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
   * Fallback topics must NOT be
   * artificially promoted as live trends.
   */

  if (
    topic?.fallback === true
  ) {
    return Math.min(
      50,
      Math.max(
        0,
        Math.round(trendScore)
      )
    );
  }

  /*
   * Live Google Trends traffic strength.
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
   * Discovery-stage estimates only.
   *
   * Final protection remains in:
   * research
   * safety
   * copyright
   * duplicate
   * quality
   * CEO publish gate
   */

  const relevanceScore =
    topic?.fallback === true
      ? Math.min(
          100,
          Math.max(
            0,
            safeNumber(
              topic?.relevanceScore,
              70
            )
          )
        )
      : Math.min(
          100,
          Math.max(
            0,
            Math.round(
              trendScore * 0.9
            )
          )
        );

  const visualScore =
    topic?.fallback === true
      ? Math.min(
          100,
          Math.max(
            0,
            safeNumber(
              topic?.visualScore,
              75
            )
          )
        )
      : Math.min(
          100,
          Math.max(
            0,
            Math.round(
              trendScore * 0.8
            )
          )
        );

  const originalityScore =
    topic?.fallback === true
      ? Math.min(
          100,
          Math.max(
            0,
            safeNumber(
              topic?.originalityScore,
              65
            )
          )
        )
      : Math.min(
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
   */

  return topics
    .filter(
      (topic) => {

        /*
         * Live topics require the
         * normal minimum trend score.
         */

        if (
          topic?.fallback !== true
        ) {
          return safeNumber(
            topic?.trendScore
          ) >= MIN_TREND_SCORE;
        }

        /*
         * Fallback topics are allowed
         * into the research pipeline.
         *
         * They are NOT automatically
         * considered trending.
         */

        return true;
      }
    )
    .slice(
      0,
      requested
    );
}


function addFallbackIfNeeded({
  rankedTopics,
  region,
  requestedVideos
}) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  /*
   * If enough live topics exist,
   * do not use fallback topics.
   */

  if (
    rankedTopics.length >= requested
  ) {
    return {
      topics:
        rankedTopics.slice(
          0,
          requested
        ),

      fallbackUsed:
        false
    };
  }

  const needed =
    Math.max(
      0,
      requested -
        rankedTopics.length
    );

  const fallbackTopics =
    getFallbackTopics(
      region,
      needed
    );

  const combined =
    [
      ...rankedTopics,
      ...fallbackTopics
    ];

  const unique =
    deduplicateTopics(
      combined
    );

  return {
    topics:
      unique.slice(
        0,
        requested
      ),

    fallbackUsed:
      fallbackTopics.length > 0
  };
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
   * Specific region.
   */

  if (
    region !== "ALL" &&
    REGION_MAP[region]
  ) {
    regions = [region];

  } else {

    /*
     * Otherwise use configured
     * audience regions.
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
   * Collect live Google Trends.
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
   * Remove duplicates.
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
   * Rank live topics.
   */

  const rankedLiveTopics =
    rankTopics(
      scoredTopics
    );


  /*
   * Only use fallback when the
   * live source does not provide
   * enough usable topics.
   *
   * For ALL, fallback is applied
   * per selected region only when
   * that region has no live topics.
   */

  let finalTopics =
    [];

  let fallbackUsed =
    false;


  if (region !== "ALL") {

    const liveForRegion =
      rankedLiveTopics.filter(
        (topic) =>
          normalizeRegion(
            topic?.region
          ) === region
      );

    const fallbackResult =
      addFallbackIfNeeded({
        rankedTopics:
          liveForRegion,

        region,

        requestedVideos
      });

    finalTopics =
      fallbackResult.topics;

    fallbackUsed =
      fallbackResult.fallbackUsed;

  } else {

    /*
     * For worldwide mode, preserve
     * live topics first.
     */

    finalTopics =
      rankedLiveTopics.slice(
        0,
        requestedVideos
      );

    /*
     * If worldwide live trends are
     * insufficient, add safe global
     * fallback topics.
     */

    if (
      finalTopics.length <
      requestedVideos
    ) {

      const needed =
        requestedVideos -
        finalTopics.length;

      const fallbackPool =
        DEFAULT_REGIONS.flatMap(
          (item) =>
            getFallbackTopics(
              item,
              needed
            )
        );

      const combined =
        deduplicateTopics([
          ...finalTopics,
          ...fallbackPool
        ]);

      finalTopics =
        combined.slice(
          0,
          requestedVideos
        );

      fallbackUsed =
        finalTopics.some(
          (topic) =>
            topic?.fallback === true
        );
    }
  }


  const hasLiveTopics =
    rankedLiveTopics.length > 0;

  const hasSelectedTopics =
    finalTopics.length > 0;


  let sourceStatus;

  if (hasLiveTopics) {

    sourceStatus =
      sourceErrors.length > 0
        ? "PARTIAL"
        : "LIVE";

  } else if (hasSelectedTopics) {

    sourceStatus =
      "FALLBACK";

  } else {

    sourceStatus =
      "FAILED";
  }


  /*
   * NO_VALID_TRENDS should no longer
   * automatically mean automation
   * failure when safe fallback topics
   * are available.
   */

  const status =
    hasSelectedTopics
      ? "TRENDS_AVAILABLE"
      : "NO_VALID_TRENDS";


  return {

    success:
      hasSelectedTopics,

    status,

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
      rankedLiveTopics.length,

    selectedTopicCount:
      finalTopics.length,

    topics:
      finalTopics,

    allTopics:
      rankedLiveTopics,

    fallbackUsed,

    sourceStatus,

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