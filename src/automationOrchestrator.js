import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import { collectTrends } from "./trendRadar.js";
import { researchTopic } from "./researchEngine.js";
import { generateScript } from "./scriptEngine.js";
import { analyzeSafety } from "./safetyGuard.js";
import { checkCopyrightSafety } from "./copyrightGuard.js";
import { checkDuplicateContent } from "./duplicateGuard.js";
import { produceFinalShort } from "./finalShortProductionPipeline.js";
import { checkFinalShortQuality } from "./finalShortQAPipeline.js";

import {
  canRunAutomation,
  createCEOApprovalRequest,
  getSystemStatus
} from "./ceoControl.js";

import {
  prepareSupportingContent,
  getContentLearningReport
} from "./contentLearningIntegration.js";

const AUTOMATION_DIR = "./storage/automation";

const STATE_FILE = path.join(
  AUTOMATION_DIR,
  "automation-state.json"
);

const LOG_FILE = path.join(
  AUTOMATION_DIR,
  "automation-log.jsonl"
);

// IMPORTANT:
// 5 is a daily TARGET only.
// There is NO hard maximum.
const DAILY_TARGET_VIDEOS = 5;

const MAX_STAGE_RETRIES = 2;

const DEFAULT_REGION = "US";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRunId(prefix = "auto") {
  return (
    `${prefix}_${Date.now()}_` +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

function normalizeRegion(value) {
  const region = cleanText(value).toUpperCase();

  if (!region) {
    return DEFAULT_REGION;
  }

  const aliases = {
    USA: "USA",
    US: "USA",
    UNITED_STATES: "USA",
    UNITEDSTATES: "USA",

    UK: "UK",
    UNITED_KINGDOM: "UK",
    UNITEDKINGDOM: "UK",

    EUROPE: "EUROPE",
    EU: "EUROPE",

    MIDDLE_EAST: "MIDDLE_EAST",
    MIDDLEEAST: "MIDDLE_EAST",
    ME: "MIDDLE_EAST",

    ALL: "ALL"
  };

  return aliases[region] || region;
}

function normalizeRequestedVideos(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 1;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(number)
  );
}

async function ensureAutomationStorage() {
  await fs.mkdir(
    AUTOMATION_DIR,
    {
      recursive: true
    }
  );
}

async function readState() {
  await ensureAutomationStorage();

  try {
    const raw =
      await fs.readFile(
        STATE_FILE,
        "utf8"
      );

    const state =
      JSON.parse(raw);

    return {
      dailyCount:
        Number(
          state.dailyCount || 0
        ),

      date:
        state.date ||
        new Date()
          .toISOString()
          .slice(0, 10),

      lastRun:
        state.lastRun || null,

      lastStatus:
        state.lastStatus || null,

      lastRunId:
        state.lastRunId || null,

      lastRegion:
        state.lastRegion || null,

      lastRequestedVideos:
        Number(
          state.lastRequestedVideos || 1
        ),

      updatedAt:
        state.updatedAt || null
    };
  } catch {
    return {
      dailyCount: 0,

      date:
        new Date()
          .toISOString()
          .slice(0, 10),

      lastRun: null,

      lastStatus: null,

      lastRunId: null,

      lastRegion: null,

      lastRequestedVideos: 1,

      updatedAt: null
    };
  }
}

async function writeState(state) {
  await ensureAutomationStorage();

  const nextState = {
    ...state,

    updatedAt:
      new Date().toISOString()
  };

  await fs.writeFile(
    STATE_FILE,
    JSON.stringify(
      nextState,
      null,
      2
    ),
    "utf8"
  );

  return nextState;
}

async function appendLog(entry) {
  await ensureAutomationStorage();

  await fs.appendFile(
    LOG_FILE,
    `${JSON.stringify({
      ...entry,
      loggedAt:
        new Date().toISOString()
    })}\n`,
    "utf8"
  );
}

function resetDailyStateIfNeeded(state) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    state.date !== today
  ) {
    return {
      ...state,

      date: today,

      dailyCount: 0
    };
  }

  return state;
}

function getDailyLimitStatus(state) {
  const used =
    Number(
      state.dailyCount || 0
    );

  const remainingToTarget =
    Math.max(
      0,
      DAILY_TARGET_VIDEOS - used
    );

  return {
    target:
      DAILY_TARGET_VIDEOS,

    dailyTargetVideos:
      DAILY_TARGET_VIDEOS,

    used,

    remainingToTarget,

    targetReached:
      used >= DAILY_TARGET_VIDEOS,

    overTarget:
      used > DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    maxDailyVideos:
      null,

    canContinueBeyondTarget:
      true,

    message:
      used >= DAILY_TARGET_VIDEOS
        ? "Daily target reached. Automation may continue when additional topics are strong, original, safe, researched and eligible."
        : `${remainingToTarget} more video(s) needed to reach the daily target.`
  };
}

async function runStage(
  stageName,
  handler,
  {
    maxRetries =
      MAX_STAGE_RETRIES
  } = {}
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= maxRetries;
    attempt += 1
  ) {
    try {
      const result =
        await handler();

      if (
        result &&
        result.success === false
      ) {
        lastError =
          result.error ||
          result.errors ||
          `${stageName} failed.`;

        if (
          attempt < maxRetries
        ) {
          continue;
        }

        return {
          success: false,

          stage:
            stageName,

          attempts:
            attempt,

          error:
            lastError,

          result
        };
      }

      return {
        success: true,

        stage:
          stageName,

        attempts:
          attempt,

        result
      };
    } catch (error) {
      lastError =
        error?.message ||
        String(error);

      if (
        attempt < maxRetries
      ) {
        continue;
      }

      return {
        success: false,

        stage:
          stageName,

        attempts:
          attempt,

        error:
          lastError
      };
    }
  }

  return {
    success: false,

    stage:
      stageName,

    attempts:
      maxRetries,

    error:
      lastError ||
      `${stageName} failed.`
  };
}

function extractTrendList(
  trendsResult
) {
  if (
    Array.isArray(
      trendsResult
    )
  ) {
    return trendsResult;
  }

  if (
    Array.isArray(
      trendsResult?.trends
    )
  ) {
    return trendsResult.trends;
  }

  if (
    Array.isArray(
      trendsResult?.items
    )
  ) {
    return trendsResult.items;
  }

  if (
    Array.isArray(
      trendsResult?.results
    )
  ) {
    return trendsResult.results;
  }

  return [];
}

function normalizeTrend(
  trend,
  index,
  requestedRegion
) {
  if (
    typeof trend ===
    "string"
  ) {
    return {
      title:
        cleanText(trend),

      topic:
        cleanText(trend),

      rank:
        index + 1,

      category:
        "general",

      region:
        requestedRegion ||
        DEFAULT_REGION
    };
  }

  const title =
    cleanText(
      trend?.title ||
      trend?.topic ||
      trend?.name ||
      trend?.query ||
      ""
    );

  return {
    ...trend,

    title,

    topic:
      cleanText(
        trend?.topic ||
        title
      ),

    rank:
      Number(
        trend?.rank ||
        index + 1
      ),

    category:
      cleanText(
        trend?.category ||
        "general"
      ),

    region:
      cleanText(
        trend?.region ||
        requestedRegion ||
        DEFAULT_REGION
      )
  };
}

function normalizeTrendCollection(
  trendsResult,
  requestedRegion
) {
  return extractTrendList(
    trendsResult
  )
    .map(
      (
        trend,
        index
      ) =>
        normalizeTrend(
          trend,
          index,
          requestedRegion
        )
    )
    .filter(
      (item) =>
        cleanText(
          item.topic
        )
    );
}

function removeDuplicateTrendTopics(
  trends
) {
  const seen =
    new Set();

  return trends.filter(
    (trend) => {
      const key =
        cleanText(
          trend.topic
        ).toLowerCase();

      if (!key) {
        return false;
      }

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

function selectTrend(
  trends,
  requestedRegion
) {
  const normalized =
    removeDuplicateTrendTopics(
      normalizeTrendCollection(
        trends,
        requestedRegion
      )
    );

  if (
    normalized.length === 0
  ) {
    return null;
  }

  return normalized[0];
}

function selectTrends(
  trends,
  requestedVideos,
  requestedRegion
) {
  const normalized =
    removeDuplicateTrendTopics(
      normalizeTrendCollection(
        trends,
        requestedRegion
      )
    );

  if (
    normalized.length === 0
  ) {
    return [];
  }

  return normalized.slice(
    0,
    requestedVideos
  );
}

function getResearchResult(
  researchStageResult
) {
  if (
    researchStageResult?.result
  ) {
    return researchStageResult.result;
  }

  return (
    researchStageResult ||
    null
  );
}

function getResearchText(
  research
) {
  const claims =
    Array.isArray(
      research?.claims
    )
      ? research.claims
          .filter(
            (claim) =>
              claim &&
              (
                claim.status ===
                  "VERIFIED" ||
                claim.status ===
                  "CONFIRMED"
              )
          )
          .map(
            (claim) =>
              cleanText(
                claim.claim
              )
          )
          .filter(Boolean)
      : [];

  const notes =
    Array.isArray(
      research?.notes
    )
      ? research.notes
          .map(cleanText)
          .filter(Boolean)
      : [];

  const directText =
    cleanText(
      research?.summary ||
      research?.researchSummary ||
      research?.content ||
      research?.text ||
      research?.findings ||
      ""
    );

  return cleanText(
    [
      directText,

      claims.join(". "),

      notes.join(". ")
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getScriptText(
  scriptResult
) {
  if (
    typeof scriptResult ===
    "string"
  ) {
    return cleanText(
      scriptResult
    );
  }

  return cleanText(
    scriptResult?.script ||
    scriptResult?.content ||
    scriptResult?.text ||
    scriptResult?.generatedScript ||
    ""
  );
}

function normalizeRisk(value) {
  const risk =
    String(
      value || ""
    ).toUpperCase();

  if (
    [
      "HIGH",
      "MEDIUM",
      "LOW"
    ].includes(risk)
  ) {
    return risk;
  }

  return null;
}

function calculateRiskLevel({
  research,
  safety,
  copyright,
  duplicate
}) {
  const risks = [];

  const researchStatus =
    String(
      research?.status || ""
    ).toUpperCase();

  const researchRisk =
    normalizeRisk(
      research?.riskLevel
    );

  const safetyRisk =
    normalizeRisk(
      safety?.riskLevel ||
      safety?.level
    );

  const copyrightRisk =
    normalizeRisk(
      copyright?.riskLevel
    );

  if (
    researchStatus !==
    "RESEARCH_SUPPORTED"
  ) {
    risks.push(
      "MEDIUM"
    );
  }

  if (researchRisk) {
    risks.push(
      researchRisk
    );
  }

  if (safetyRisk) {
    risks.push(
      safetyRisk
    );
  }

  if (
    String(
      copyright?.status || ""
    ).toUpperCase() ===
    "REVIEW"
  ) {
    risks.push(
      "MEDIUM"
    );
  }

  if (copyrightRisk) {
    risks.push(
      copyrightRisk
    );
  }

  if (
    duplicate?.isDuplicate === true ||
    duplicate?.duplicate === true ||
    duplicate?.blocked === true
  ) {
    risks.push(
      "HIGH"
    );
  }

  if (
    risks.includes("HIGH")
  ) {
    return "HIGH";
  }

  if (
    risks.includes("MEDIUM")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function shouldRequireCEOApproval(
  riskLevel
) {
  return (
    riskLevel !==
    "LOW"
  );
}

async function loadExistingContent() {
  const candidates = [
    path.join(
      AUTOMATION_DIR,
      "published-content.json"
    ),

    path.join(
      AUTOMATION_DIR,
      "content-history.json"
    )
  ];

  for (
    const file of candidates
  ) {
    try {
      const raw =
        await fs.readFile(
          file,
          "utf8"
        );

      const data =
        JSON.parse(raw);

      if (
        Array.isArray(data)
      ) {
        return data;
      }

      if (
        Array.isArray(
          data?.items
        )
      ) {
        return data.items;
      }

      if (
        Array.isArray(
          data?.content
        )
      ) {
        return data.content;
      }
    } catch {
      // Continue.
    }
  }

  return [];
}

function createManifest({
  runId,
  topic,
  title,
  script,
  description,
  language,
  region,
  production,
  riskLevel
}) {
  return {
    id:
      runId,

    metadata: {
      topic:
        cleanText(topic),

      title:
        cleanText(
          title ||
          topic
        ),

      description:
        cleanText(
          description
        ),

      language:
        cleanText(
          language
        ),

      region:
        normalizeRegion(
          region
        ),

      riskLevel
    },

    script:
      cleanText(script),

    production:
      production || null,

    createdAt:
      new Date().toISOString()
  };
}

async function runSupportingContentStage({
  topic,
  script,
  riskLevel
}) {
  try {
    const result =
      await prepareSupportingContent({
        topic,
        script,
        riskLevel
      });

    return {
      success: true,

      status:
        "SUPPORTING_CONTENT_READY",

      result
    };
  } catch (error) {
    return {
      success: false,

      status:
        "SUPPORTING_CONTENT_FAILED",

      error:
        error?.message ||
        String(error)
    };
  }
}

async function createCEOReview({
  runId,
  topic,
  riskLevel,
  manifest,
  safety,
  copyright,
  duplicate,
  qa
}) {
  try {
    return await createCEOApprovalRequest({
      type:
        "YOUTUBE_SHORT_PUBLISH",

      runId,

      topic,

      riskLevel,

      reason:
        `Automation produced a ${riskLevel} risk Short that requires CEO approval.`,

      manifest,

      safety,

      copyright,

      duplicate,

      qa
    });
  } catch (error) {
    return {
      success: false,

      status:
        "APPROVAL_REQUEST_FAILED",

      error:
        error?.message ||
        String(error)
    };
  }
}

async function processSingleTrend({
  trend,
  runId,
  language,
  voiceId,
  dryRun,
  region,
  state
}) {
  const selectedTopic =
    cleanText(
      trend?.topic
    );

  if (
    !selectedTopic
  ) {
    return {
      success: false,

      status:
        "INVALID_TOPIC",

      runId,

      region
    };
  }

  /*
   * =========================================================
   * 1. RESEARCH
   * =========================================================
   */

  const researchTopicInput = {
    ...trend,

    title:
      selectedTopic,

    topic:
      selectedTopic,

    language,

    region
  };

  const researchStage =
    await runStage(
      "RESEARCH",
      async () =>
        researchTopic(
          researchTopicInput
        )
    );

  if (
    !researchStage.success
  ) {
    return {
      success: false,

      status:
        "RESEARCH_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      research:
        researchStage
    };
  }

  const researchEnvelope =
    researchStage.result;

  const research =
    getResearchResult(
      researchEnvelope
    );

  const researchStatus =
    String(
      research?.status ||
      researchEnvelope?.status ||
      ""
    ).toUpperCase();

  const researchText =
    getResearchText(
      research
    );

  if (
    researchStatus !==
    "RESEARCH_SUPPORTED"
  ) {
    return {
      success: true,

      status:
        "RESEARCH_REVIEW_REQUIRED",

      runId,

      topic:
        selectedTopic,

      region,

      research:
        researchEnvelope,

      researchResult:
        research,

      nextStage:
        "RESEARCH_PROVIDER_OR_CEO_REVIEW"
    };
  }

  if (
    researchText.length <
    50
  ) {
    return {
      success: false,

      status:
        "RESEARCH_INSUFFICIENT",

      runId,

      topic:
        selectedTopic,

      region,

      research:
        researchEnvelope
    };
  }

  /*
   * =========================================================
   * 2. SCRIPT
   * =========================================================
   */

  const scriptInput = {
    ...trend,

    title:
      selectedTopic,

    topic:
      selectedTopic,

    category:
      trend?.category ||
      "general",

    region,

    language,

    research:
      researchText,

    researchResult:
      research
  };

  const scriptStage =
    await runStage(
      "SCRIPT",
      async () =>
        generateScript(
          scriptInput
        )
    );

  if (
    !scriptStage.success
  ) {
    return {
      success: false,

      status:
        "SCRIPT_STAGE_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      script:
        scriptStage
    };
  }

  const scriptResult =
    scriptStage.result;

  const finalScript =
    getScriptText(
      scriptResult
    );

  if (
    finalScript.length <
    100
  ) {
    return {
      success: false,

      status:
        "SCRIPT_TOO_SHORT",

      runId,

      topic:
        selectedTopic,

      region,

      script:
        finalScript
    };
  }

  const finalTitle =
    cleanText(
      scriptResult?.title ||
      trend?.title ||
      selectedTopic
    );

  const finalDescription =
    cleanText(
      scriptResult?.description ||
      ""
    );

  /*
   * =========================================================
   * 3. SAFETY
   * =========================================================
   */

  const safetyStage =
    await runStage(
      "SAFETY",
      async () =>
        analyzeSafety({
          title:
            finalTitle,

          script:
            finalScript,

          description:
            finalDescription,

          research:
            researchEnvelope
        })
    );

  if (
    !safetyStage.success
  ) {
    return {
      success: false,

      status:
        "SAFETY_STAGE_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      safety:
        safetyStage
    };
  }

  const safety =
    safetyStage.result;

  const safetyLevel =
    normalizeRisk(
      safety?.level ||
      safety?.riskLevel
    ) ||
    "MEDIUM";

  if (
    safetyLevel ===
    "HIGH"
  ) {
    return {
      success: false,

      status:
        "SAFETY_BLOCKED",

      runId,

      topic:
        selectedTopic,

      region,

      safety
    };
  }

  /*
   * =========================================================
   * 4. COPYRIGHT
   * =========================================================
   */

  const researchSources =
    Array.isArray(
      research?.sources
    )
      ? research.sources
      : [];

  const copyrightStage =
    await runStage(
      "COPYRIGHT",
      async () =>
        checkCopyrightSafety({
          title:
            finalTitle,

          script:
            finalScript,

          sources:
            researchSources,

          metadata: {
            visuals: [],

            audio: [],

            category:
              scriptResult?.category ||
              trend?.category ||
              "general",

            region
          }
        })
    );

  if (
    !copyrightStage.success
  ) {
    return {
      success: false,

      status:
        "COPYRIGHT_STAGE_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      copyright:
        copyrightStage
    };
  }

  const copyright =
    copyrightStage.result;

  const copyrightStatus =
    String(
      copyright?.status ||
      ""
    ).toUpperCase();

  if (
    copyrightStatus !==
    "PASS"
  ) {
    return {
      success: true,

      status:
        "COPYRIGHT_REVIEW_REQUIRED",

      runId,

      topic:
        selectedTopic,

      region,

      copyright,

      nextStage:
        "CEO_APPROVAL"
    };
  }

  /*
   * =========================================================
   * 5. DUPLICATE
   * =========================================================
   */

  const existingContent =
    await loadExistingContent();

  const duplicateStage =
    await runStage(
      "DUPLICATE",
      async () =>
        checkDuplicateContent({
          title:
            finalTitle,

          script:
            finalScript,

          existingContent
        })
    );

  if (
    !duplicateStage.success
  ) {
    return {
      success: false,

      status:
        "DUPLICATE_STAGE_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      duplicate:
        duplicateStage
    };
  }

  const duplicate =
    duplicateStage.result;

  if (
    duplicate?.isDuplicate === true ||
    duplicate?.duplicate === true ||
    duplicate?.blocked === true
  ) {
    return {
      success: false,

      status:
        "DUPLICATE_BLOCKED",

      runId,

      topic:
        selectedTopic,

      region,

      duplicate
    };
  }

  /*
   * =========================================================
   * 6. RISK ENGINE
   * =========================================================
   */

  const riskLevel =
    calculateRiskLevel({
      research,
      safety,
      copyright,
      duplicate
    });

  const requiresCEOApproval =
    shouldRequireCEOApproval(
      riskLevel
    );

  /*
   * =========================================================
   * 7. SUPPORTING CONTENT
   * =========================================================
   */

  const supportingStage =
    await runSupportingContentStage({
      topic:
        selectedTopic,

      script:
        finalScript,

      riskLevel
    });

  /*
   * =========================================================
   * 8. FINAL SHORT PRODUCTION
   * =========================================================
   */

  const productionStage =
    await runStage(
      "FINAL_SHORT_PRODUCTION",
      async () =>
        produceFinalShort({
          topic:
            selectedTopic,

          title:
            finalTitle,

          script:
            finalScript,

          language,

          voiceId,

          region
        })
    );

  if (
    !productionStage.success
  ) {
    return {
      success: false,

      status:
        "PRODUCTION_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      riskLevel,

      production:
        productionStage,

      supportingContent:
        supportingStage
    };
  }

  const production =
    productionStage.result;

  /*
   * =========================================================
   * 9. MANIFEST
   * =========================================================
   */

  const manifest =
    createManifest({
      runId,

      topic:
        selectedTopic,

      title:
        finalTitle,

      script:
        finalScript,

      description:
        finalDescription,

      language,

      region,

      production,

      riskLevel
    });

  /*
   * =========================================================
   * 10. FINAL VIDEO
   * =========================================================
   */

  const finalVideoFile =
    cleanText(
      production?.finalVideo
        ?.outputFile ||
      production?.finalVideoFile ||
      production?.outputFile ||
      ""
    );

  if (
    !finalVideoFile
  ) {
    return {
      success: false,

      status:
        "FINAL_VIDEO_MISSING",

      runId,

      topic:
        selectedTopic,

      region,

      riskLevel,

      manifest,

      production
    };
  }

  /*
   * =========================================================
   * 11. QA
   * =========================================================
   */

  const qaStage =
    await runStage(
      "QUALITY_ASSURANCE",
      async () =>
        checkFinalShortQuality({
          manifest,

          finalVideoFile
        })
    );

  if (
    !qaStage.success
  ) {
    return {
      success: false,

      status:
        "QA_FAILED",

      runId,

      topic:
        selectedTopic,

      region,

      riskLevel,

      manifest,

      production,

      qa:
        qaStage.result ||
        qaStage
    };
  }

  const qa =
    qaStage.result;

  if (
    qa?.passed !== true
  ) {
    return {
      success: false,

      status:
        "QA_BLOCKED",

      runId,

      topic:
        selectedTopic,

      region,

      riskLevel,

      manifest,

      production,

      qa
    };
  }

  /*
   * =========================================================
   * 12. CEO APPROVAL
   * =========================================================
   */

  let approval = null;

  if (
    requiresCEOApproval
  ) {
    approval =
      await createCEOReview({
        runId,

        topic:
          selectedTopic,

        riskLevel,

        manifest,

        safety,

        copyright,

        duplicate,

        qa
      });

    return {
      success: true,

      status:
        "CEO_REVIEW_REQUIRED",

      runId,

      topic:
        selectedTopic,

      title:
        finalTitle,

      description:
        finalDescription,

      language,

      region,

      riskLevel,

      requiresCEOApproval:
        true,

      manifest,

      production,

      finalVideoFile,

      qa,

      safety,

      copyright,

      duplicate,

      supportingContent:
        supportingStage,

      approval,

      dailyLimit:
        getDailyLimitStatus(
          state
        ),

      nextStage:
        "YOUTUBE_UPLOAD_AFTER_CEO_APPROVAL"
    };
  }

  /*
   * =========================================================
   * 13. DRY RUN
   * =========================================================
   */

  if (
    dryRun
  ) {
    return {
      success: true,

      status:
        "DRY_RUN_READY",

      runId,

      topic:
        selectedTopic,

      title:
        finalTitle,

      description:
        finalDescription,

      language,

      region,

      riskLevel,

      requiresCEOApproval:
        false,

      manifest,

      production,

      finalVideoFile,

      qa,

      supportingContent:
        supportingStage,

      dailyLimit:
        getDailyLimitStatus(
          state
        ),

      nextStage:
        "YOUTUBE_UPLOAD"
    };
  }

  /*
   * =========================================================
   * 14. READY FOR YOUTUBE
   * =========================================================
   */

  let learningReport = null;

  try {
    learningReport =
      await getContentLearningReport();
  } catch {
    learningReport = null;
  }

  return {
    success: true,

    status:
      "READY_FOR_YOUTUBE",

    runId,

    topic:
      selectedTopic,

    title:
      finalTitle,

    description:
      finalDescription,

    language,

    region,

    riskLevel,

    requiresCEOApproval:
      false,

    manifest,

    production,

    finalVideoFile,

    qa,

    supportingContent:
      supportingStage,

    learningReport,

    dailyLimit:
      getDailyLimitStatus(
        state
      ),

    nextStage:
      "YOUTUBE_UPLOAD",

    createdAt:
      new Date().toISOString()
  };
}

export async function runAutomation({
  topic = "",
  title = "",
  description = "",
  language = "en-US",
  voiceId,
  dryRun = false,
  region = DEFAULT_REGION,
  runId = null,
  requestedVideos = 1
} = {}) {
  const automationRunId =
    cleanText(runId) ||
    createRunId();

  const normalizedRegion =
    normalizeRegion(
      region
    );

  const requestedCount =
    normalizeRequestedVideos(
      requestedVideos
    );

  let state =
    resetDailyStateIfNeeded(
      await readState()
    );

  state =
    await writeState(
      state
    );

  const dailyTarget =
    getDailyLimitStatus(
      state
    );

  let systemStatus;

  try {
    systemStatus =
      getSystemStatus();
  } catch (error) {
    systemStatus = {
      status:
        "UNKNOWN",

      error:
        error?.message ||
        String(error)
    };
  }

  let automationAllowed =
    false;

  try {
    automationAllowed =
      canRunAutomation() ===
      true;
  } catch {
    automationAllowed =
      false;
  }

  if (
    automationAllowed !==
    true
  ) {
    await appendLog({
      runId:
        automationRunId,

      status:
        "AUTOMATION_BLOCKED",

      region:
        normalizedRegion
    });

    return {
      success: false,

      status:
        "AUTOMATION_BLOCKED",

      runId:
        automationRunId,

      region:
        normalizedRegion,

      requestedVideos:
        requestedCount,

      systemStatus,

      dailyLimit:
        dailyTarget
    };
  }

  const explicitTopic =
    cleanText(
      topic || title
    );

  await appendLog({
    runId:
      automationRunId,

    status:
      "AUTOMATION_STARTED",

    topic:
      explicitTopic || null,

    region:
      normalizedRegion,

    requestedVideos:
      requestedCount,

    dryRun:
      Boolean(dryRun),

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false
  });

  /*
   * =========================================================
   * TREND DISCOVERY
   * =========================================================
   */

  let selectedTrends = [];

  if (
    explicitTopic
  ) {
    selectedTrends = [
      {
        topic:
          explicitTopic,

        title:
          explicitTopic,

        rank: 1,

        source:
          "manual",

        category:
          "general",

        region:
          normalizedRegion
      }
    ];
  } else {
    const trendStage =
      await runStage(
        "TREND_RADAR",
        async () =>
          collectTrends({
            region:
              normalizedRegion,

            requestedVideos:
              requestedCount
          })
      );

    if (
      !trendStage.success
    ) {
      await appendLog({
        runId:
          automationRunId,

        status:
          "TREND_STAGE