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

const MAX_REQUESTED_VIDEOS = 50;

/*
|--------------------------------------------------------------------------
| Safe fallback topics
|--------------------------------------------------------------------------
|
| IMPORTANT:
| These are NOT live Google Trends.
|
| They are backup discovery topics only.
|
| Every fallback topic must still pass:
| - research
| - safety
| - copyright
| - duplicate
| - production QA
| - upload guard
| - CEO publish gate
|
|--------------------------------------------------------------------------
*/

const FALLBACK_TOPICS = {
  USA: [
    "useful AI tools for everyday work",
    "AI productivity tips for professionals",
    "simple technology tips that save time",
    "useful smartphone features people miss",
    "practical cybersecurity tips for everyday users",
    "useful digital tools for everyday life",
    "simple AI tips for beginners",
    "technology habits that improve productivity"
  ],

  UK: [
    "useful AI tools for everyday work",
    "practical productivity tips",
    "useful technology tips for everyday life",
    "simple cybersecurity tips",
    "AI tools that can save time",
    "useful digital tools for everyday life",
    "simple AI tips for beginners",
    "technology habits that improve productivity"
  ],

  EUROPE: [
    "useful AI tools for everyday work",
    "practical technology tips",
    "AI productivity ideas",
    "simple cybersecurity tips",
    "useful digital tools for everyday life",
    "simple AI tips for beginners",
    "technology habits that improve productivity",
    "useful smartphone features"
  ],

  MIDDLE_EAST: [
    "useful AI tools for everyday work",
    "AI productivity tips for professionals",
    "useful smartphone features",
    "practical cybersecurity tips",
    "technology tips that save time",
    "useful digital tools for everyday life",
    "simple AI tips for beginners",
    "technology habits that improve productivity",
    "practical digital safety tips",
    "useful technology tips for everyday users"
  ]
};


/*
|--------------------------------------------------------------------------
| Basic helpers
|--------------------------------------------------------------------------
*/

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
      MAX_REQUESTED_VIDEOS,
      Math.floor(value)
    )
  );
}


/*
|--------------------------------------------------------------------------
| Topic normalization
|--------------------------------------------------------------------------
*/

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


/*
|--------------------------------------------------------------------------
| Fallback topic creation
|--------------------------------------------------------------------------
*/

function createFallbackTopic(
  title,
  region,
  index = 0
) {
  const normalizedRegion =
    normalizeRegion(region);

  const cleanTitle =
    cleanText(title);

  if (!cleanTitle) {
    return null;
  }

  return {
    id:
      `fallback_${normalizedRegion}_${Date.now()}_${index}_${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    title:
      cleanTitle,

    category:
      "general",

    region:
      normalizedRegion,

    geo:
      "FALLBACK",

    /*
     * This is deliberately capped.
     * It is NOT a live trend score.
     */
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
      "No usable live Google Trends topic was available for this region.",

    collectedAt:
      new Date().toISOString()
  };
}


function getFallbackPool(
  region
) {
  const normalizedRegion =
    normalizeRegion(region);

  const regionalTopics =
    FALLBACK_TOPICS[
      normalizedRegion
    ];

  if (
    Array.isArray(regionalTopics) &&
    regionalTopics.length > 0
  ) {
    return regionalTopics;
  }

  /*
   * Unknown region safety fallback.
   */
  return FALLBACK_TOPICS.EUROPE;
}


function getFallbackTopics(
  region,
  requestedVideos
) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  const pool =
    getFallbackPool(
      region
    );

  const result =
    [];

  for (
    let index = 0;
    index < pool.length &&
    result.length < requested;
    index += 1
  ) {
    const topic =
      createFallbackTopic(
        pool[index],
        region,
        index
      );

    if (topic) {
      result.push(topic);
    }
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| Google Trends
|--------------------------------------------------------------------------
*/

async function fetchGoogleDailyTrends(
  geo
) {
  const url =
    `${GOOGLE_TRENDS_URL}?hl=en-US&tz=0&geo=${encodeURIComponent(geo)}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "ZEESHAN-AI-YOUTUBE-LAB/1.0",
          "Accept":
            "application/json,text/plain,*/*"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Google Trends request failed for ${geo}: ${response.status}`
    );
  }

  const raw =
    await response.text();

  if (!raw) {
    throw new Error(
      `Google Trends returned an empty response for ${geo}.`
    );
  }

  /*
   * Google Trends can return
   * a JSON security prefix.
   */
  const jsonText =
    raw
      .replace(
        /^\)\]\}',?\n/,
        ""
      )
      .trim();

  if (!jsonText) {
    throw new Error(
      `Google Trends returned empty JSON for ${geo}.`
    );
  }

  let data;

  try {
    data =
      JSON.parse(
        jsonText
      );
  } catch (error) {
    throw new Error(
      `Google Trends returned invalid JSON for ${geo}.`
    );
  }

  const searches =
    Array.isArray(
      data?.default?.trendingSearches
    )
      ? data.default.trendingSearches
      : [];

  return searches;
}


/*
|--------------------------------------------------------------------------
| Traffic parsing
|--------------------------------------------------------------------------
*/

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
    parseFloat(
      match[1]
    );

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


/*
|--------------------------------------------------------------------------
| Discovery scoring
|--------------------------------------------------------------------------
*/

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
   * Fallback topics must NEVER
   * be promoted as live trends.
   */
  if (
    topic?.fallback === true
  ) {
    return Math.min(
      50,
      Math.max(
        0,
        Math.round(
          trendScore
        )
      )
    );
  }

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
      Math.round(
        trendScore
      )
    )
  );
}


function calculateTopicScores(
  topic
) {
  const trendScore =
    scoreTopic(
      topic
    );

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


/*
|--------------------------------------------------------------------------
| Deduplication
|--------------------------------------------------------------------------
*/

function deduplicateTopics(
  topics
) {
  const seen =
    new Set();

  const result =
    [];

  for (
    const topic of Array.isArray(topics)
      ? topics
      : []
  ) {
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

    seen.add(
      key
    );

    result.push(
      topic
    );
  }

  return result;
}


/*
|--------------------------------------------------------------------------
| Ranking
|--------------------------------------------------------------------------
*/

function rankTopics(
  topics
) {
  return [
    ...(Array.isArray(topics)
      ? topics
      : [])
  ].sort(
    (a, b) => {

      const scoreA =
        (
          safeNumber(
            a?.trendScore
          ) * 0.50
        ) +
        (
          safeNumber(
            a?.relevanceScore
          ) * 0.25
        ) +
        (
          safeNumber(
            a?.visualScore
          ) * 0.15
        ) +
        (
          safeNumber(
            a?.originalityScore
          ) * 0.10
        );

      const scoreB =
        (
          safeNumber(
            b?.trendScore
          ) * 0.50
        ) +
        (
          safeNumber(
            b?.relevanceScore
          ) * 0.25
        ) +
        (
          safeNumber(
            b?.visualScore
          ) * 0.15
        ) +
        (
          safeNumber(
            b?.originalityScore
          ) * 0.10
        );

      return scoreB - scoreA;
    }
  );
}


/*
|--------------------------------------------------------------------------
| Topic selection
|--------------------------------------------------------------------------
*/

function selectTopics(
  topics,
  requestedVideos
) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  return (
    Array.isArray(topics)
      ? topics
      : []
  )
    .filter(
      (topic) => {

        /*
         * Live topics need the minimum
         * discovery trend score.
         */
        if (
          topic?.fallback !== true
        ) {
          return (
            safeNumber(
              topic?.trendScore
            ) >= MIN_TREND_SCORE
          );
        }

        /*
         * Fallback topics are valid
         * discovery inputs.
         *
         * They are NOT labelled as
         * live trending topics.
         */
        return true;
      }
    )
    .slice(
      0,
      requested
    );
}


/*
|--------------------------------------------------------------------------
| Guaranteed regional fallback
|--------------------------------------------------------------------------
*/

function buildRegionalTopics({
  liveTopics,
  region,
  requestedVideos
}) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  const rankedLive =
    rankTopics(
      deduplicateTopics(
        Array.isArray(liveTopics)
          ? liveTopics
          : []
      )
    );

  /*
   * First keep usable live topics.
   */
  const selectedLive =
    selectTopics(
      rankedLive,
      requested
    );

  /*
   * If live topics are enough,
   * no fallback is required.
   */
  if (
    selectedLive.length >= requested
  ) {
    return {
      topics:
        selectedLive.slice(
          0,
          requested
        ),

      fallbackUsed:
        false,

      liveTopicCount:
        selectedLive.length
    };
  }

  /*
   * Fill only the missing amount
   * from safe fallback topics.
   */
  const needed =
    requested -
    selectedLive.length;

  const fallbackTopics =
    getFallbackTopics(
      region,
      needed
    );

  const combined =
    deduplicateTopics([
      ...selectedLive,
      ...fallbackTopics
    ]);

  const selected =
    combined.slice(
      0,
      requested
    );

  return {
    topics:
      selected,

    fallbackUsed:
      selected.some(
        (topic) =>
          topic?.fallback === true
      ),

    liveTopicCount:
      selected.filter(
        (topic) =>
          topic?.fallback !== true
      ).length
  };
}


/*
|--------------------------------------------------------------------------
| Main TrendRadar
|--------------------------------------------------------------------------
*/

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
    regions = [
      region
    ];
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
  for (
    const selectedRegion of regions
  ) {
    const geos =
      getGeosForRegion(
        selectedRegion
      );

    for (
      const geo of geos
    ) {
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
   * Remove duplicate live topics.
   */
  const uniqueTopics =
    deduplicateTopics(
      allTopics
    );


  /*
   * Discovery scoring.
   */
  const scoredTopics =
    uniqueTopics.map(
      calculateTopicScores
    );


  /*
   * Build final topics.
   */
  let finalTopics =
    [];

  let fallbackUsed =
    false;


  /*
   * Specific region:
   *
   * IMPORTANT:
   * fallback is generated here even
   * when ALL Google Trends requests
   * fail.
   */
  if (
    region !== "ALL"
  ) {

    const liveForRegion =
      scoredTopics.filter(
        (topic) =>
          normalizeRegion(
            topic?.region
          ) === region
      );

    const regionalResult =
      buildRegionalTopics({
        liveTopics:
          liveForRegion,

        region,

        requestedVideos
      });

    finalTopics =
      regionalResult.topics;

    fallbackUsed =
      regionalResult.fallbackUsed;

  } else {

    /*
     * Worldwide mode:
     * process each region separately
     * so one failed region does not
     * destroy the whole result.
     */
    const regionalCollections =
      [];

    for (
      const selectedRegion of regions
    ) {
      const regionalLive =
        scoredTopics.filter(
          (topic) =>
            normalizeRegion(
              topic?.region
            ) === selectedRegion
        );

      const regionalResult =
        buildRegionalTopics({
          liveTopics:
            regionalLive,

          region:
            selectedRegion,

          requestedVideos
        });

      regionalCollections.push(
        ...regionalResult.topics
      );

      if (
        regionalResult.fallbackUsed
      ) {
        fallbackUsed =
          true;
      }
    }

    /*
     * Keep unique topics globally.
     */
    finalTopics =
      deduplicateTopics(
        regionalCollections
      )
        .slice(
          0,
          requestedVideos
        );

    /*
     * Absolute final safety fallback.
     *
     * This prevents:
     * trends: []
     *
     * when all live regions fail.
     */
    if (
      finalTopics.length === 0
    ) {

      const emergencyFallback =
        getFallbackTopics(
          "MIDDLE_EAST",
          requestedVideos
        );

      finalTopics =
        deduplicateTopics(
          emergencyFallback
        )
          .slice(
            0,
            requestedVideos
          );

      fallbackUsed =
        finalTopics.length > 0;
    }
  }


  /*
   * Final guarantee:
   *
   * For a specific known region,
   * never return an empty topic list
   * while a configured fallback exists.
   */
  if (
    finalTopics.length === 0 &&
    region !== "ALL"
  ) {

    const guaranteedFallback =
      getFallbackTopics(
        region,
        requestedVideos
      );

    finalTopics =
      deduplicateTopics(
        guaranteedFallback
      )
        .slice(
          0,
          requestedVideos
        );

    fallbackUsed =
      finalTopics.length > 0;
  }


  const rankedLiveTopics =
    rankTopics(
      scoredTopics
    );


  const hasLiveTopics =
    rankedLiveTopics.length > 0;


  const hasSelectedTopics =
    finalTopics.length > 0;


  let sourceStatus;

  if (
    hasLiveTopics &&
    sourceErrors.length === 0 &&
    !fallbackUsed
  ) {
    sourceStatus =
      "LIVE";

  } else if (
    hasLiveTopics &&
    fallbackUsed
  ) {
    sourceStatus =
      "PARTIAL";

  } else if (
    hasSelectedTopics &&
    fallbackUsed
  ) {
    sourceStatus =
      "FALLBACK";

  } else {
    sourceStatus =
      "FAILED";
  }


  /*
   * TRENDS_AVAILABLE means that the
   * discovery stage has a usable topic.
   *
   * It does NOT mean that the topic
   * is automatically publishable.
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

    /*
     * Daily target is NOT a hard
     * maximum.
     */
    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    region,

    regions,

    /*
     * Live Google Trends count only.
     */
    topicCount:
      rankedLiveTopics.length,

    /*
     * Final topics available to
     * the next pipeline stage.
     */
    selectedTopicCount:
      finalTopics.length,

    topics:
      finalTopics,

    /*
     * Live topics only.
     */
    allTopics:
      rankedLiveTopics,

    fallbackUsed,

    sourceStatus,

    sourceErrors
  };
}


/*
|--------------------------------------------------------------------------
| Compatibility export
|--------------------------------------------------------------------------
*/

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