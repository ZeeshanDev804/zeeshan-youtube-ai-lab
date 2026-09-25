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

const DAILY_TARGET_VIDEOS = 5;

const MAX_STAGE_RETRIES = 2;

const DEFAULT_REGION = "USA";

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
    US: "USA",
    USA: "USA",
    UNITED_STATES: "USA",
    UNITEDSTATES: "USA",

    GB: "UK",
    UK: "UK",
    UNITED_KINGDOM: "UK",
    UNITEDKINGDOM: "UK",

    EU: "EUROPE",
    EUROPE: "EUROPE",

    ME: "MIDDLE_EAST",
    MIDDLEEAST: "MIDDLE_EAST",
    "MIDDLE EAST": "MIDDLE_EAST",
    MIDDLE_EAST: "MIDDLE_EAST",

    ALL: "ALL"
  };

  return aliases[region] || region;
}

function normalizeRequestedVideos(value) {
  if (
    value === undefined ||
    value === null ||
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
    Math.min(
      50,
      Math.floor(number)
    )
  );
}

/*
|--------------------------------------------------------------------------
| Storage
|--------------------------------------------------------------------------
*/

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

  const logEntry = {
    ...entry,

    loggedAt:
      new Date().toISOString()
  };

  await fs.appendFile(
    LOG_FILE,
    `${JSON.stringify(logEntry)}\n`,
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
        ? "Daily target reached. Automation may continue when additional strong, original, safe and eligible topics remain."
        : `${remainingToTarget} more video(s) needed to reach the daily target.`
  };
}

/*
|--------------------------------------------------------------------------
| Stage runner
|--------------------------------------------------------------------------
*/

async function runStage(
  stageName,
  handler,
  {
    maxRetries = MAX_STAGE_RETRIES
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
          stage: stageName,
          attempts: attempt,
          error: lastError,
          result
        };
      }

      return {
        success: true,
        stage: stageName,
        attempts: attempt,
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
        stage: stageName,
        attempts: attempt,
        error: lastError
      };
    }
  }

  return {
    success: false,
    stage: stageName,
    attempts: maxRetries,
    error:
      lastError ||
      `${stageName} failed.`
  };
}

/*
|--------------------------------------------------------------------------
| Trend extraction
|--------------------------------------------------------------------------
|
| TrendRadar can expose selected topics through different property names.
| Accept all supported forms.
|--------------------------------------------------------------------------
*/

function extractTrendList(result) {
  if (
    Array.isArray(result)
  ) {
    return result;
  }

  const possibleLists = [
    result?.selectedTopics,
    result?.topics,
    result?.selected,
    result?.trends,
    result?.items,
    result?.results
  ];

  for (
    const list of possibleLists
  ) {
    if (
      Array.isArray(list)
    ) {
      return list;
    }
  }

  return [];
}

function normalizeTrend(
  trend,
  index,
  region
) {
  if (
    typeof trend === "string"
  ) {
    const topic =
      cleanText(trend);

    return {
      topic,
      title: topic,
      rank: index + 1,
      category: "general",
      region,
      source: "trend-radar",
      fallback: false
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

  const topic =
    cleanText(
      trend?.topic ||
      title
    );

  return {
    ...trend,

    title,

    topic,

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
        region
      ),

    source:
      cleanText(
        trend?.source ||
        "trend-radar"
      ),

    fallback:
      Boolean(
        trend?.fallback
      )
  };
}

function normalizeTrends(
  result,
  region
) {
  const trends =
    extractTrendList(result);

  const seen =
    new Set();

  return trends
    .map(
      (trend, index) =>
        normalizeTrend(
          trend,
          index,
          region
        )
    )
    .filter(
      (trend) =>
        Boolean(
          cleanText(
            trend.topic
          )
        )
    )
    .filter(
      (trend) => {
        const key =
          cleanText(
            trend.topic
          ).toLowerCase();

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

function selectTrends(
  result,
  requestedVideos,
  region
) {
  const requested =
    normalizeRequestedVideos(
      requestedVideos
    );

  const normalized =
    normalizeTrends(
      result,
      region
    );

  /*
   * This limit applies only to this individual
   * automation cycle.
   *
   * It is NOT a daily hard maximum.
   */

  return normalized.slice(
    0,
    requested
  );
}

/*
|--------------------------------------------------------------------------
| Research helpers
|--------------------------------------------------------------------------
*/

function getResearchResult(
  result
) {
  if (
    result?.result
  ) {
    return result.result;
  }

  return result || null;
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

/*
|--------------------------------------------------------------------------
| Script helpers
|--------------------------------------------------------------------------
*/

function getScriptText(
  result
) {
  if (
    typeof result === "string"
  ) {
    return cleanText(result);
  }

  return cleanText(
    result?.script ||
    result?.content ||
    result?.text ||
    result?.generatedScript ||
    ""
  );
}

/*
|--------------------------------------------------------------------------
| Risk
|--------------------------------------------------------------------------
*/

function normalizeRisk(value) {
  const risk =
    String(
      value || ""
    ).toUpperCase();

  if (
    ["LOW", "MEDIUM", "HIGH"]
      .includes(risk)
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
    risks.push("MEDIUM");
  }

  if (researchRisk) {
    risks.push(researchRisk);
  }

  if (safetyRisk) {
    risks.push(safetyRisk);
  }

  const copyrightStatus =
    String(
      copyright?.status || ""
    ).toUpperCase();

  if (
    copyrightStatus === "REVIEW"
  ) {
    risks.push("MEDIUM");
  }

  if (
    copyrightStatus === "BLOCK"
  ) {
    risks.push("HIGH");
  }

  if (copyrightRisk) {
    risks.push(copyrightRisk);
  }

  if (
    duplicate?.isDuplicate === true ||
    duplicate?.duplicate === true ||
    duplicate?.blocked === true
  ) {
    risks.push("HIGH");
  }

  if (
    String(
      duplicate?.status || ""
    ).toUpperCase() === "REVIEW"
  ) {
    risks.push("MEDIUM");
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
    riskLevel !== "LOW"
  );
}

/*
|--------------------------------------------------------------------------
| Existing content
|--------------------------------------------------------------------------
*/

async function loadExistingContent() {
  const files = [
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
    const file of files
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
      // Continue to next history file.
    }
  }

  return [];
}

/*
|--------------------------------------------------------------------------
| Manifest
|--------------------------------------------------------------------------
*/

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
    id: runId,

    metadata: {
      topic:
        cleanText(topic),

      title:
        cleanText(
          title || topic
        ),

      description:
        cleanText(description),

      language:
        cleanText(language),

      region:
        normalizeRegion(region),

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

/*
|--------------------------------------------------------------------------
| CEO review
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Preview mode
|--------------------------------------------------------------------------
|
| Preview ONLY discovers topics.
|
| It does NOT:
| - research
| - generate script
| - generate voice
| - generate visuals
| - run FFmpeg
| - run QA
| - upload to YouTube
|--------------------------------------------------------------------------
*/

async function previewSingleTrend({
  trend,
  runId,
  language,
  region,
  state
}) {
  const topic =
    cleanText(
      trend?.topic
    );

  if (!topic) {
    return {
      success: false,
      status: "INVALID_TOPIC",
      runId,
      region
    };
  }

  return {
    success: true,

    status:
      "DRY_RUN_READY",

    runId,

    topic,

    title:
      cleanText(
        trend?.title ||
        topic
      ),

    language,

    region,

    source:
      trend?.source ||
      "trend-radar",

    fallback:
      Boolean(
        trend?.fallback
      ),

    fallbackReason:
      trend?.fallbackReason ||
      null,

    dailyLimit:
      getDailyLimitStatus(
        state
      ),

    nextStage:
      "PREVIEW_ONLY",

    productionStarted:
      false,

    youtubeUploadStarted:
      false,

    createdAt:
      new Date().toISOString()
  };
}

/*
|--------------------------------------------------------------------------
| Process one real trend
|--------------------------------------------------------------------------
*/

async function processSingleTrend({
  trend,
  runId,
  language,
  voiceId,
  dryRun,
  region,
  state
}) {
  const topic =
    cleanText(
      trend?.topic
    );

  if (!topic) {
    return {
      success: false,
      status: "INVALID_TOPIC",
      runId,
      region
    };
  }

  /*
   * Absolute dry-run protection.
   */

  if (dryRun) {
    return previewSingleTrend({
      trend,
      runId,
      language,
      region,
      state
    });
  }

  /*
  |--------------------------------------------------------------------------
  | RESEARCH
  |--------------------------------------------------------------------------
  */

  const researchStage =
    await runStage(
      "RESEARCH",
      async () =>
        researchTopic({
          ...trend,
          topic,
          title: topic,
          language,
          region
        })
    );

  if (
    !researchStage.success
  ) {
    return {
      success: false,
      status: "RESEARCH_FAILED",
      runId,
      topic,
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
      topic,
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
    researchText.length < 50
  ) {
    return {
      success: false,
      status:
        "RESEARCH_INSUFFICIENT",
      runId,
      topic,
      region,
      research:
        researchEnvelope
    };
  }

  /*
  |--------------------------------------------------------------------------
  | SCRIPT
  |--------------------------------------------------------------------------
  */

  const scriptStage =
    await runStage(
      "SCRIPT",
      async () =>
        generateScript({
          ...trend,
          topic,
          title: topic,
          language,
          region,
          research:
            researchText,
          researchResult:
            research
        })
    );

  if (
    !scriptStage.success
  ) {
    return {
      success: false,
      status:
        "SCRIPT_STAGE_FAILED",
      runId,
      topic,
      region,
      script:
        scriptStage
    };
  }

  const scriptResult =
    scriptStage.result;

  const script =
    getScriptText(
      scriptResult
    );

  if (
    script.length < 100
  ) {
    return {
      success: false,
      status:
        "SCRIPT_TOO_SHORT",
      runId,
      topic,
      region,
      script
    };
  }

  const title =
    cleanText(
      scriptResult?.title ||
      trend?.title ||
      topic
    );

  const description =
    cleanText(
      scriptResult?.description ||
      ""
    );

  /*
  |--------------------------------------------------------------------------
  | SAFETY
  |--------------------------------------------------------------------------
  */

  const safetyStage =
    await runStage(
      "SAFETY",
      async () =>
        analyzeSafety({
          title,
          script,
          description,
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
      topic,
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
    ) || "MEDIUM";

  if (
    safetyLevel === "HIGH"
  ) {
    return {
      success: false,
      status:
        "SAFETY_BLOCKED",
      runId,
      topic,
      region,
      safety
    };
  }

  /*
  |--------------------------------------------------------------------------
  | COPYRIGHT
  |--------------------------------------------------------------------------
  */

  const sources =
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
          title,
          script,
          sources,
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
      topic,
      region,
      copyright:
        copyrightStage
    };
  }

  const copyright =
    copyrightStage.result;

  const copyrightStatus =
    String(
      copyright?.status || ""
    ).toUpperCase();

  if (
    copyrightStatus === "BLOCK"
  ) {
    return {
      success: false,
      status:
        "COPYRIGHT_BLOCKED",
      runId,
      topic,
      region,
      copyright
    };
  }

  if (
    copyrightStatus !== "PASS"
  ) {
    return {
      success: true,
      status:
        "COPYRIGHT_REVIEW_REQUIRED",
      runId,
      topic,
      region,
      copyright,
      nextStage:
        "CEO_APPROVAL"
    };
  }

  /*
  |--------------------------------------------------------------------------
  | DUPLICATE
  |--------------------------------------------------------------------------
  */

  const existingContent =
    await loadExistingContent();

  const duplicateStage =
    await runStage(
      "DUPLICATE",
      async () =>
        checkDuplicateContent({
          title,
          script,
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
      topic,
      region,
      duplicate:
        duplicateStage
    };
  }

  const duplicate =
    duplicateStage.result;

  const duplicateStatus =
    String(
      duplicate?.status || ""
    ).toUpperCase();

  if (
    duplicateStatus === "BLOCK" ||
    duplicate?.isDuplicate === true ||
    duplicate?.duplicate === true ||
    duplicate?.blocked === true
  ) {
    return {
      success: false,
      status:
        "DUPLICATE_BLOCKED",
      runId,
      topic,
      region,
      duplicate
    };
  }

  if (
    duplicateStatus === "REVIEW"
  ) {
    return {
      success: true,
      status:
        "DUPLICATE_REVIEW_REQUIRED",
      runId,
      topic,
      region,
      duplicate,
      nextStage:
        "CEO_APPROVAL"
    };
  }

  /*
  |--------------------------------------------------------------------------
  | RISK
  |--------------------------------------------------------------------------
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
  |--------------------------------------------------------------------------
  | SUPPORTING CONTENT
  |--------------------------------------------------------------------------
  */

  let supportingContent = null;

  try {
    supportingContent =
      await prepareSupportingContent({
        topic,
        script,
        riskLevel
      });
  } catch (error) {
    supportingContent = {
      success: false,
      status:
        "SUPPORTING_CONTENT_FAILED",
      error:
        error?.message ||
        String(error)
    };
  }

  /*
  |--------------------------------------------------------------------------
  | FINAL SHORT PRODUCTION
  |--------------------------------------------------------------------------
  */

  const productionStage =
    await runStage(
      "FINAL_SHORT_PRODUCTION",
      async () =>
        produceFinalShort({
          topic,
          title,
          script,
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
      topic,
      region,
      riskLevel,
      production:
        productionStage,
      supportingContent
    };
  }

  const production =
    productionStage.result;

  /*
  |--------------------------------------------------------------------------
  | MANIFEST
  |--------------------------------------------------------------------------
  */

  const manifest =
    createManifest({
      runId,
      topic,
      title,
      script,
      description,
      language,
      region,
      production,
      riskLevel
    });

  /*
  |--------------------------------------------------------------------------
  | FINAL VIDEO
  |--------------------------------------------------------------------------
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
      topic,
      region,
      riskLevel,
      manifest,
      production
    };
  }

  /*
  |--------------------------------------------------------------------------
  | QUALITY ASSURANCE
  |--------------------------------------------------------------------------
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
      status: "QA_FAILED",
      runId,
      topic,
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
      topic,
      region,
      riskLevel,
      manifest,
      production,
      qa
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CEO REVIEW FOR MEDIUM / HIGH
  |--------------------------------------------------------------------------
  */

  if (
    requiresCEOApproval
  ) {
    const approval =
      await createCEOReview({
        runId,
        topic,
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

      topic,

      title,

      description,

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

      supportingContent,

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
  |--------------------------------------------------------------------------
  | LOW-RISK AUTO-PUBLISH READY
  |--------------------------------------------------------------------------
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

    topic,

    title,

    description,

    language,

    region,

    riskLevel,

    requiresCEOApproval:
      false,

    manifest,

    production,

    finalVideoFile,

    qa,

    supportingContent,

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

/*
|--------------------------------------------------------------------------
| MAIN AUTOMATION
|--------------------------------------------------------------------------
*/

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
    normalizeRegion(region);

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

  let systemStatus = null;

  try {
    systemStatus =
      getSystemStatus();
  } catch (error) {
    systemStatus = {
      status: "UNKNOWN",
      error:
        error?.message ||
        String(error)
    };
  }

  let automationAllowed =
    false;

  try {
    automationAllowed =
      canRunAutomation() === true;
  } catch {
    automationAllowed = false;
  }

  if (
    !automationAllowed
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
        getDailyLimitStatus(
          state
        )
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
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true
  });

  let selectedTrends = [];

  /*
  |--------------------------------------------------------------------------
  | IMPORTANT FIX
  |--------------------------------------------------------------------------
  |
  | trendStage is declared OUTSIDE the conditional block.
  |
  | This prevents:
  | "trendStage is not defined"
  |
  | when selectedTrends is empty.
  |--------------------------------------------------------------------------
  */

  let trendStage = null;

  if (explicitTopic) {
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
          normalizedRegion,

        fallback:
          false
      }
    ];
  } else {
    trendStage =
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
          "TREND_STAGE_FAILED",

        error:
          trendStage.error
      });

      return {
        success: false,

        status:
          "TREND_STAGE_FAILED",

        runId:
          automationRunId,

        region:
          normalizedRegion,

        requestedVideos:
          requestedCount,

        error:
          trendStage.error
      };
    }

    /*
     * Accept the actual selected/fallback
     * list returned by TrendRadar.
     */

    selectedTrends =
      selectTrends(
        trendStage.result,
        requestedCount,
        normalizedRegion
      );
  }

  /*
  |--------------------------------------------------------------------------
  | NO VALID TRENDS
  |--------------------------------------------------------------------------
  */

  if (
    selectedTrends.length === 0
  ) {
    const trendRadarStatus =
      String(
        trendStage?.result?.status ||
        ""
      ).toUpperCase();

    const sourceStatus =
      String(
        trendStage?.result?.sourceStatus ||
        ""
      ).toUpperCase();

    const trendTopicCount =
      Number(
        trendStage?.result?.topicCount ||
        0
      );

    const selectedTopicCount =
      Number(
        trendStage?.result
          ?.selectedTopicCount ||
        0
      );

    await appendLog({
      runId:
        automationRunId,

      status:
        "NO_VALID_TRENDS",

      region:
        normalizedRegion,

      trendRadarStatus,

      sourceStatus,

      trendTopicCount,

      selectedTopicCount
    });

    return {
      success: false,

      status:
        "NO_VALID_TRENDS",

      runId:
        automationRunId,

      region:
        normalizedRegion,

      requestedVideos:
        requestedCount,

      trends: [],

      trendRadarStatus,

      sourceStatus,

      trendTopicCount,

      selectedTopicCount
    };
  }

  /*
  |--------------------------------------------------------------------------
  | PREVIEW MODE
  |--------------------------------------------------------------------------
  |
  | Discover topics only.
  |
  | No:
  | research
  | script
  | TTS
  | visuals
  | FFmpeg
  | QA
  | YouTube upload
  |--------------------------------------------------------------------------
  */

  if (dryRun) {
    const previewResults = [];

    for (
      let index = 0;
      index < selectedTrends.length;
      index += 1
    ) {
      const trend =
        selectedTrends[index];

      const itemRunId =
        `${automationRunId}_${index + 1}`;

      const result =
        await processSingleTrend({
          trend,

          runId:
            itemRunId,

          language,

          voiceId,

          dryRun:
            true,

          region:
            normalizedRegion,

          state
        });

      previewResults.push(
        result
      );

      await appendLog({
        parentRunId:
          automationRunId,

        runId:
          itemRunId,

        status:
          result.status,

        topic:
          result.topic ||
          trend.topic ||
          null,

        region:
          normalizedRegion,

        index:
          index + 1,

        dryRun:
          true
      });
    }

    const previewReadyCount =
      previewResults.filter(
        (item) =>
          item.status ===
          "DRY_RUN_READY"
      ).length;

    const previewReviewCount =
      previewResults.filter(
        (item) =>
          item.status !==
          "DRY_RUN_READY"
      ).length;

    await appendLog({
      runId:
        automationRunId,

      status:
        "DRY_RUN_COMPLETED",

      region:
        normalizedRegion,

      requestedVideos:
        requestedCount,

      selectedTopics:
        selectedTrends.length,

      previewTopics:
        previewReadyCount,

      reviewTopics:
        previewReviewCount,

      producedVideos:
        0,

      dailyCount:
        state.dailyCount,

      dailyTarget:
        DAILY_TARGET_VIDEOS,

      hardDailyMaximum:
        false
    });

    return {
      success: true,

      status:
        "DRY_RUN_COMPLETED",

      runId:
        automationRunId,

      region:
        normalizedRegion,

      requestedVideos:
        requestedCount,

      selectedTopics:
        selectedTrends.length,

      producedVideos:
        0,

      readyVideos:
        0,

      reviewVideos:
        previewReviewCount,

      blockedVideos:
        0,

      failedVideos:
        previewResults.filter(
          (item) =>
            item.success === false
        ).length,

      trends:
        selectedTrends,

      results:
        previewResults,

      dailyLimit:
        getDailyLimitStatus(
          state
        ),

      systemStatus,

      createdAt:
        new Date().toISOString()
    };
  }

  /*
  |--------------------------------------------------------------------------
  | REAL AUTOMATION
  |--------------------------------------------------------------------------
  */

  const results = [];

  for (
    let index = 0;
    index < selectedTrends.length;
    index += 1
  ) {
    const trend =
      selectedTrends[index];

    const itemRunId =
      `${automationRunId}_${index + 1}`;

    const result =
      await processSingleTrend({
        trend,

        runId:
          itemRunId,

        language,

        voiceId,

        dryRun:
          false,

        region:
          normalizedRegion,

        state
      });

    results.push(
      result
    );

    await appendLog({
      parentRunId:
        automationRunId,

      runId:
        itemRunId,

      status:
        result.status,

      topic:
        result.topic ||
        trend.topic ||
        null,

      region:
        normalizedRegion,

      index:
        index + 1
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Production counters
  |--------------------------------------------------------------------------
  |
  | Only actual produced Shorts count.
  |--------------------------------------------------------------------------
  */

  const producedCount =
    results.filter(
      (item) =>
        item.status ===
          "READY_FOR_YOUTUBE" ||
        item.status ===
          "CEO_REVIEW_REQUIRED"
    ).length;

  const readyCount =
    results.filter(
      (item) =>
        item.status ===
        "READY_FOR_YOUTUBE"
    ).length;

  const reviewCount =
    results.filter(
      (item) =>
        item.status ===
          "CEO_REVIEW_REQUIRED" ||
        item.status ===
          "RESEARCH_REVIEW_REQUIRED" ||
        item.status ===
          "COPYRIGHT_REVIEW_REQUIRED" ||
        item.status ===
          "DUPLICATE_REVIEW_REQUIRED"
    ).length;

  const blockedCount =
    results.filter(
      (item) =>
        item.status ===
          "SAFETY_BLOCKED" ||
        item.status ===
          "COPYRIGHT_BLOCKED" ||
        item.status ===
          "DUPLICATE_BLOCKED"
    ).length;

  const failedCount =
    results.filter(
      (item) =>
        item.success === false
    ).length;

  /*
  |--------------------------------------------------------------------------
  | Daily target is NOT a hard maximum.
  |--------------------------------------------------------------------------
  */

  const newDailyCount =
    Number(
      state.dailyCount || 0
    ) + producedCount;

  state =
    await writeState({
      ...state,

      dailyCount:
        newDailyCount,

      lastRun:
        new Date().toISOString(),

      lastStatus:
        "AUTOMATION_COMPLETED",

      lastRunId:
        automationRunId,

      lastRegion:
        normalizedRegion,

      lastRequestedVideos:
        requestedCount
    });

  const dailyLimit =
    getDailyLimitStatus(
      state
    );

  /*
  |--------------------------------------------------------------------------
  | Overall status
  |--------------------------------------------------------------------------
  */

  const status =
    failedCount ===
    results.length
      ? "AUTOMATION_FAILED"
      : "AUTOMATION_COMPLETED";

  await appendLog({
    runId:
      automationRunId,

    status,

    region:
      normalizedRegion,

    requestedVideos:
      requestedCount,

    selectedTopics:
      selectedTrends.length,

    producedVideos:
      producedCount,

    readyVideos:
      readyCount,

    reviewVideos:
      reviewCount,

    blockedVideos:
      blockedCount,

    failedVideos:
      failedCount,

    dailyCount:
      state.dailyCount,

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true
  });

  return {
    success:
      status ===
      "AUTOMATION_COMPLETED",

    status,

    runId:
      automationRunId,

    region:
      normalizedRegion,

    requestedVideos:
      requestedCount,

    selectedTopics:
      selectedTrends.length,

    producedVideos:
      producedCount,

    readyVideos:
      readyCount,

    reviewVideos:
      reviewCount,

    blockedVideos:
      blockedCount,

    failedVideos:
      failedCount,

    results,

    dailyLimit,

    systemStatus,

    targetIsHardMaximum:
      false,

    maxDailyVideos:
      null,

    canContinueBeyondTarget:
      true,

    qualityOverQuantity:
      true,

    createdAt:
      new Date().toISOString()
  };
}

/*
|--------------------------------------------------------------------------
| Automation cycle
|--------------------------------------------------------------------------
*/

export async function runAutomationCycle(
  options = {}
) {
  return runAutomation(
    options
  );
}

/*
|--------------------------------------------------------------------------
| Preview
|--------------------------------------------------------------------------
*/

export async function previewAutomation(
  options = {}
) {
  return runAutomation({
    ...options,

    dryRun:
      true
  });
}

/*
|--------------------------------------------------------------------------
| Automation status
|--------------------------------------------------------------------------
*/

export async function getAutomationStatus() {
  const state =
    resetDailyStateIfNeeded(
      await readState()
    );

  let systemStatus = null;

  try {
    systemStatus =
      getSystemStatus();
  } catch (error) {
    systemStatus = {
      status: "UNKNOWN",

      error:
        error?.message ||
        String(error)
    };
  }

  let automationAllowed =
    false;

  try {
    automationAllowed =
      canRunAutomation() === true;
  } catch {
    automationAllowed = false;
  }

  return {
    status:
      automationAllowed
        ? "READY"
        : "BLOCKED",

    automationAllowed,

    dailyTargetVideos:
      DAILY_TARGET_VIDEOS,

    target:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false,

    maxDailyVideos:
      null,

    canContinueBeyondTarget:
      true,

    dailyLimit:
      getDailyLimitStatus(
        state
      ),

    state,

    systemStatus,

    updatedAt:
      new Date().toISOString()
  };
}

/*
|--------------------------------------------------------------------------
| Automation log
|--------------------------------------------------------------------------
*/

export async function getAutomationLog({
  limit = 50
} = {}) {
  await ensureAutomationStorage();

  const safeLimit =
    Math.max(
      1,
      Math.min(
        500,
        Number(limit) || 50
      )
    );

  try {
    const raw =
      await fs.readFile(
        LOG_FILE,
        "utf8"
      );

    const lines =
      raw
        .split("\n")
        .map(
          (line) =>
            line.trim()
        )
        .filter(Boolean);

    const entries = [];

    for (
      const line of lines
    ) {
      try {
        entries.push(
          JSON.parse(line)
        );
      } catch {
        // Ignore malformed log line.
      }
    }

    return {
      success: true,

      status:
        "AUTOMATION_LOG_READY",

      count:
        Math.min(
          entries.length,
          safeLimit
        ),

      entries:
        entries.slice(
          -safeLimit
        )
    };
  } catch (error) {
    return {
      success: false,

      status:
        "AUTOMATION_LOG_READ_FAILED",

      count: 0,

      entries: [],

      error:
        error?.message ||
        String(error)
    };
  }
}

export default {
  runAutomation,
  runAutomationCycle,
  previewAutomation,
  getAutomationStatus,
  getAutomationLog
};