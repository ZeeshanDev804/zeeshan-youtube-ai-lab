import config from "./config.js";

const DEFAULT_REGIONS = [
  "US",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL"
];

function createSeedTopics() {
  return [
    {
      id: "seed-tech",
      title: "Technology trends people are watching",
      category: "technology",
      region: "US",
      trendScore: 50,
      relevanceScore: 50,
      originalityScore: 50,
      visualScore: 50,
      source: "system-seed"
    },
    {
      id: "seed-business",
      title: "Business trends changing everyday life",
      category: "business",
      region: "GB",
      trendScore: 45,
      relevanceScore: 55,
      originalityScore: 50,
      visualScore: 50,
      source: "system-seed"
    }
  ];
}

export async function collectTrends() {
  const regions =
    config.audience.regions.length > 0
      ? config.audience.regions
      : DEFAULT_REGIONS;

  /*
   * Provider integrations will be added here.
   *
   * Important:
   * No fake trend data is presented as real-world data.
   * Until a real provider is configured, the system returns
   * clearly marked seed topics only.
   */

  return createSeedTopics().filter((topic) =>
    regions.includes(topic.region)
  );
}

export async function getTrendRadar() {
  const topics = await collectTrends();

  return {
    generatedAt: new Date().toISOString(),
    lookbackHours: config.trends.lookbackHours,
    topicCount: topics.length,
    topics,
    sourceStatus: "SEED_ONLY"
  };
}
