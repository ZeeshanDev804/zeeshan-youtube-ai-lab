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

// 5 is a TARGET, not a hard maximum.
const DAILY_TARGET_VIDEOS = 5;
const MAX_STAGE_RETRIES = 2;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRunId() {
  return (
    `auto_${Date.now()}_` +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

async function ensureAutomationStorage() {
  await fs.mkdir(AUTOMATION_DIR, {
    recursive: true
  });
}

async function readState() {
  await ensureAutomationStorage();

  try {
    const raw = await fs.readFile(
      STATE_FILE,
      "utf8"
    );

    const state = JSON.parse(raw);

    return {
      dailyCount: Number(
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

  if (state.date !== today) {
    return {
      ...state,
      date: today,
      dailyCount: 0
    };
  }

  return state;
}

function getDailyLimitStatus(state) {
  const used = Number(
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
        ? "Daily target reached. Automation may continue if strong, safe and eligible topics remain."
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

function extractTrendList(trendsResult) {
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
  index
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
        "US"
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
        "US"
      )
  };
}

function selectTrend(trends) {
  const normalized =
    extractTrendList(
      trends
    )
      .map(
        normalizeTrend
      )
      .filter(
        (item) =>
          cleanText(
            item.topic
          )
      );

  if (
    normalized.length === 0
  ) {
    return null;
  }

  return normalized[0];
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

function getResearchText(research) {
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

function getScriptText(scriptResult) {
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
    risks.push("MEDIUM");
  }

  if (researchRisk) {
    risks.push(researchRisk);
  }

  if (safetyRisk) {
    risks.push(safetyRisk);
  }

  if (
    String(
      copyright?.status || ""
    ).toUpperCase() ===
    "REVIEW"
  ) {
    risks.push("MEDIUM");
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
          title ||
          topic
        ),

      description:
        cleanText(description),

      language:
        cleanText(language),

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

export async function runAutomation({
  topic = "",
  title = "",
  description = "",
  language = "en-US",
  voiceId,
  dryRun = false
} = {}) {
  const runId =
    createRunId();

  let state =
    resetDailyStateIfNeeded(
      await readState()
    );

  state =
    await writeState(
      state
    );

  /*
   * IMPORTANT:
   * DAILY_TARGET_VIDEOS is informational only.
   * There is NO hard daily maximum.
   *
   * The automation can continue beyond 5
   * when additional topics are strong,
   * original, safe, researched and eligible.
   */

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
      runId,

      status:
        "AUTOMATION_BLOCKED"
    });

    return {
      success: false,

      status:
        "AUTOMATION_BLOCKED",

      runId,

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
    runId,

    status:
      "AUTOMATION_STARTED",

    topic:
      explicitTopic || null,

    dryRun:
      Boolean(dryRun),

    dailyTarget:
      DAILY_TARGET_VIDEOS,

    hardDailyMaximum:
      false
  });

  /*
   * =========================================================
   * 1. TREND DISCOVERY
   * =========================================================
   */

  let selectedTrend = null;

  if (
    explicitTopic
  ) {
    selectedTrend = {
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
        "US"
    };
  } else {
    const trendStage =
      await runStage(
        "TREND_RADAR",
        async () =>
          collectTrends()
      );

    if (
      !trendStage.success
    ) {
      await appendLog({
        runId,

        status:
          "TREND_STAGE_FAILED",

        error:
          trendStage.error
      });

      return {
        success: false,

        status:
          "TREND_STAGE_FAILED",

        runId,

        error:
          trendStage.error
      };
    }

    selectedTrend =
      selectTrend(
        trendStage.result
      );

    if (
      !selectedTrend
    ) {
      await appendLog({
        runId,

        status:
          "NO_VALID_TREND"
      });

      return {
        success: false,

        status:
          "NO_VALID_TREND",

        runId,

        trends:
          trendStage.result
      };
    }
  }

  const selectedTopic =
    cleanText(
      selectedTrend.topic
    );

  if (
    !selectedTopic
  ) {
    await appendLog({
      runId,

      status:
        "INVALID_TOPIC"
    });

    return {
      success: false,

      status:
        "INVALID_TOPIC",

      runId
    };
  }

  /*
   * =========================================================
   * 2. RESEARCH
   * =========================================================
   */

  const researchTopicInput = {
    ...selectedTrend,

    title:
      selectedTopic,

    topic:
      selectedTopic,

    language
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
    await appendLog({
      runId,

      status:
        "RESEARCH_FAILED",

      error:
        researchStage.error
    });

    return {
      success: false,

      status:
        "RESEARCH_FAILED",

      runId,

      topic:
        selectedTopic,

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
    await appendLog({
      runId,

      status:
        "RESEARCH_REVIEW_REQUIRED",

      researchStatus
    });

    return {
      success: true,

      status:
        "RESEARCH_REVIEW_REQUIRED",

      runId,

      topic:
        selectedTopic,

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
    await appendLog({
      runId,

      status:
        "RESEARCH_INSUFFICIENT"
    });

    return {
      success: false,

      status:
        "RESEARCH_INSUFFICIENT",

      runId,

      topic:
        selectedTopic,

      research:
        researchEnvelope
    };
  }

  /*
   * =========================================================
   * 3. SCRIPT GENERATION
   * =========================================================
   */

  const scriptInput = {
    ...selectedTrend,

    title:
      selectedTopic,

    topic:
      selectedTopic,

    category:
      selectedTrend.category ||
      "general",

    region:
      selectedTrend.region ||
      "US",

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
    await appendLog({
      runId,

      status:
        "SCRIPT_STAGE_FAILED",

      error:
        scriptStage.error
    });

    return {
      success: false,

      status:
        "SCRIPT_STAGE_FAILED",

      runId,

      topic:
        selectedTopic,

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
    await appendLog({
      runId,

      status:
        "SCRIPT_TOO_SHORT"
    });

    return {
      success: false,

      status:
        "SCRIPT_TOO_SHORT",

      runId,

      topic:
        selectedTopic,

      script:
        finalScript
    };
  }

  const finalTitle =
    cleanText(
      scriptResult?.title ||
      title ||
      selectedTopic
    );

  const finalDescription =
    cleanText(
      description ||
      scriptResult?.description ||
      ""
    );

  /*
   * =========================================================
   * 4. SAFETY
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
    await appendLog({
      runId,

      status:
        "SAFETY_STAGE_FAILED",

      error:
        safetyStage.error
    });

    return {
      success: false,

      status:
        "SAFETY_STAGE_FAILED",

      runId,

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
    await appendLog({
      runId,

      status:
        "SAFETY_BLOCKED",

      safetyLevel
    });

    return {
      success: false,

      status:
        "SAFETY_BLOCKED",

      runId,

      topic:
        selectedTopic,

      safety
    };
  }

  /*
   * =========================================================
   * 5. COPYRIGHT
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
              selectedTrend.category ||
              "general",

            region:
              selectedTrend.region ||
              "US"
          }
        })
    );

  if (
    !copyrightStage.success
  ) {
    await appendLog({
      runId,

      status:
        "COPYRIGHT_STAGE_FAILED",

      error:
        copyrightStage.error
    });

    return {
      success: false,

      status:
        "COPYRIGHT_STAGE_FAILED",

      runId,

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
    await appendLog({
      runId,

      status:
        "COPYRIGHT_REVIEW_REQUIRED",

      copyrightStatus
    });

    return {
      success: true,

      status:
        "COPYRIGHT_REVIEW_REQUIRED",

      runId,

      topic:
        selectedTopic,

      copyright,

      nextStage:
        "CEO_APPROVAL"
    };
  }

  /*
   * =========================================================
   * 6. DUPLICATE CHECK
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
    await appendLog({
      runId,

      status:
        "DUPLICATE_STAGE_FAILED",

      error:
        duplicateStage.error
    });

    return {
      success: false,

      status:
        "DUPLICATE_STAGE_FAILED",

      runId,

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
    await appendLog({
      runId,

      status:
        "DUPLICATE_BLOCKED"
    });

    return {
      success: false,

      status:
        "DUPLICATE_BLOCKED",

      runId,

      topic:
        selectedTopic,

      duplicate
    };
  }

  /*
   * =========================================================
   * 7. RISK ENGINE
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
   * 8. SUPPORTING CONTENT
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
   * 9. FINAL SHORT PRODUCTION
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

          voiceId
        })
    );

  if (
    !productionStage.success
  ) {
    await appendLog({
      runId,

      status:
        "PRODUCTION_FAILED",

      error:
        productionStage.error
    });

    return {
      success: false,

      status:
        "PRODUCTION_FAILED",

      runId,

      topic:
        selectedTopic,

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
   * 10. PRODUCTION MANIFEST
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

      production,

      riskLevel
    });

  /*
   * =========================================================
   * 11. FINAL VIDEO
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
    await appendLog({
      runId,

      status:
        "FINAL_VIDEO_MISSING"
    });

    return {
      success: false,

      status:
        "FINAL_VIDEO_MISSING",

      runId,

      topic:
        selectedTopic,

      riskLevel,

      manifest,

      production
    };
  }

  /*
   * =========================================================
   * 12. FINAL VIDEO QA
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
    await appendLog({
      runId,

      status:
        "QA_FAILED",

      error:
        qaStage.error
    });

    return {
      success: false,

      status:
        "QA_FAILED",

      runId,

      topic:
        selectedTopic,

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
    await appendLog({
      runId,

      status:
        "QA_BLOCKED"
    });

    return {
      success: false,

      status:
        "QA_BLOCKED",

      runId,

      topic:
        selectedTopic,

      riskLevel,

      manifest,

      production,

      qa
    };
  }

  /*
   * =========================================================
   * 13. CEO APPROVAL GATE
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

    await appendLog({
      runId,

      status:
        "CEO_REVIEW_REQUIRED",

      riskLevel,

      finalVideoFile
    });

    state =
      await writeState({
        ...state,

        lastRun:
          new Date().toISOString(),

        lastStatus:
          "CEO_REVIEW_REQUIRED",

        lastRunId:
          runId
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
   * 14. DRY RUN
   * =========================================================
   */

  if (
    dryRun
  ) {
    await appendLog({
      runId,

      status:
        "DRY_RUN_READY",

      finalVideoFile
    });

    state =
      await writeState({
        ...state,

        lastRun:
          new Date().toISOString(),

        lastStatus:
          "DRY_RUN_READY",

        lastRunId:
          runId
      });

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
   * 15. READY FOR YOUTUBE PIPELINE
   * =========================================================
   */

  let learningReport = null;

  try {
    learningReport =
      await getContentLearningReport();
  } catch {
    learningReport = null;
  }

  state =
    await writeState({
      ...state,

      dailyCount:
        Number(
          state.dailyCount || 0
        ) + 1,

      lastRun:
        new Date().toISOString(),

      lastStatus:
        "READY_FOR_YOUTUBE",

      lastRunId:
        runId
    });

  await appendLog({
    runId,

    status:
      "READY_FOR_YOUTUBE",

    riskLevel,

    finalVideoFile,

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
      "READY_FOR_YOUTUBE",

    runId,

    topic:
      selectedTopic,

    title:
      finalTitle,

    description:
      finalDescription,

    language,

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

export async function runAutomationCycle(
  options = {}
) {
  return runAutomation(
    options
  );
}

export async function getAutomationStatus() {
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
      status:
        "UNKNOWN",

      error:
        error?.message ||
        String(error)
    };
  }

  let canRun = false;

  try {
    canRun =
      canRunAutomation() ===
      true;
  } catch {
    canRun = false;
  }

  let learningReport = null;

  try {
    learningReport =
      await getContentLearningReport();
  } catch {
    learningReport = null;
  }

  const dailyLimit =
    getDailyLimitStatus(
      state
    );

  return {
    configured: true,

    status:
      "READY",

    automation: {
      canRun,

      dailyTargetVideos:
        DAILY_TARGET_VIDEOS,

      maxDailyVideos:
        null,

      hardDailyMaximum:
        false,

      canContinueBeyondTarget:
        true,

      retriesPerStage:
        MAX_STAGE_RETRIES
    },

    dailyLimit,

    state,

    system:
      systemStatus,

    learning:
      learningReport,

    pipeline: [
      "TREND_RADAR",
      "RESEARCH",
      "SCRIPT",
      "SAFETY",
      "COPYRIGHT",
      "DUPLICATE",
      "RISK_ENGINE",
      "SUPPORTING_CONTENT",
      "VOICE",
      "VISUALS",
      "VIDEO",
      "CAPTIONS",
      "FINAL_RENDER",
      "QUALITY_ASSURANCE",
      "CEO_APPROVAL",
      "YOUTUBE_UPLOAD"
    ],

    publishing:
      "SEPARATE_YOUTUBE_PIPELINE",

    message:
      "Automation orchestrator is ready. Five Shorts per day is the target, not a hard maximum. Additional strong, original and safe topics may continue beyond the target. Final video must pass QA and remains behind dedicated YouTube upload and CEO safety gates."
  };
}

export async function previewAutomation(
  options = {}
) {
  return runAutomation({
    ...options,

    dryRun: true
  });
}

export async function resetAutomationDailyCounter() {
  const state =
    await readState();

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const nextState =
    await writeState({
      ...state,

      date:
        today,

      dailyCount:
        0,

      lastStatus:
        "DAILY_COUNTER_RESET"
    });

  await appendLog({
    status:
      "DAILY_COUNTER_RESET"
  });

  return {
    success: true,

    status:
      "DAILY_COUNTER_RESET",

    state:
      nextState
  };
}

export async function getAutomationLog({
  limit = 50
} = {}) {
  await ensureAutomationStorage();

  try {
    const raw =
      await fs.readFile(
        LOG_FILE,
        "utf8"
      );

    const lines =
      raw
        .split("\n")
        .filter(Boolean);

    const safeLimit =
      Math.max(
        1,
        Number(
          limit || 50
        )
      );

    return {
      success: true,

      items:
        lines
          .slice(
            -safeLimit
          )
          .map(
            (line) => {
              try {
                return JSON.parse(
                  line
                );
              } catch {
                return {
                  raw: line
                };
              }
            }
          )
    };
  } catch {
    return {
      success: true,

      items: []
    };
  }
}

export default {
  runAutomation,
  runAutomationCycle,
  getAutomationStatus,
  previewAutomation,
  resetAutomationDailyCounter,
  getAutomationLog
};