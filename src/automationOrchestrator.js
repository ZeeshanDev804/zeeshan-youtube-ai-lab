import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import {
  config
} from "./config.js";

import {
  collectTrends
} from "./trendRadar.js";

import {
  researchTopic
} from "./researchEngine.js";

import {
  generateScript
} from "./scriptEngine.js";

import {
  analyzeSafety
} from "./safetyGuard.js";

import {
  checkCopyrightSafety
} from "./copyrightGuard.js";

import {
  checkDuplicateContent
} from "./duplicateGuard.js";

import {
  produceFinalShort
} from "./finalShortProductionPipeline.js";

import {
  checkFinalShortQuality
} from "./finalShortQAPipeline.js";

import {
  canRunAutomation,
  createCEOApprovalRequest,
  getSystemStatus
} from "./ceoControl.js";

import {
  prepareSupportingContent,
  getContentLearningReport
} from "./contentLearningIntegration.js";

const AUTOMATION_DIR =
  "./storage/automation";

const STATE_FILE =
  path.join(
    AUTOMATION_DIR,
    "automation-state.json"
  );

const LOG_FILE =
  path.join(
    AUTOMATION_DIR,
    "automation-log.jsonl"
  );

const MAX_DAILY_VIDEOS = 5;

const MAX_STAGE_RETRIES = 2;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getConfigValue(
  key,
  fallback = undefined
) {
  return (
    config?.[key] ??
    process.env[key] ??
    fallback
  );
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
    })}\n`
  );
}

function resetDailyStateIfNeeded(
  state
) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    state.date !== today
  ) {
    return {
      ...state,

      date:
        today,

      dailyCount:
        0
    };
  }

  return state;
}

function getDailyLimitStatus(
  state
) {
  const used =
    Number(
      state.dailyCount || 0
    );

  return {
    limit:
      MAX_DAILY_VIDEOS,

    used,

    remaining:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
          used
      ),

    reached:
      used >=
      MAX_DAILY_VIDEOS
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
          attempt <
          maxRetries
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
        attempt <
        maxRetries
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
        index + 1
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
      )
  };
}

function selectTrend(
  trends
) {
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

function getResearchText(
  research
) {
  return cleanText(
    research?.summary ||
    research?.researchSummary ||
    research?.content ||
    research?.text ||
    research?.findings ||
    ""
  );
}

function getScriptText(
  scriptResult
) {
  return cleanText(
    scriptResult?.script ||
    scriptResult?.content ||
    scriptResult?.text ||
    scriptResult?.generatedScript ||
    ""
  );
}

function calculateRiskLevel({
  research,
  safety,
  copyright,
  duplicate
}) {
  const risks = [];

  if (
    research?.success === false
  ) {
    risks.push(
      "MEDIUM"
    );
  }

  if (
    research?.verified === false
  ) {
    risks.push(
      "MEDIUM"
    );
  }

  if (
    research?.riskLevel
  ) {
    risks.push(
      String(
        research.riskLevel
      ).toUpperCase()
    );
  }

  if (
    safety?.riskLevel
  ) {
    risks.push(
      String(
        safety.riskLevel
      ).toUpperCase()
    );
  }

  if (
    copyright?.riskLevel
  ) {
    risks.push(
      String(
        copyright.riskLevel
      ).toUpperCase()
    );
  }

  if (
    duplicate?.isDuplicate === true ||
    duplicate?.duplicate === true
  ) {
    risks.push(
      "HIGH"
    );
  }

  if (
    risks.includes(
      "HIGH"
    )
  ) {
    return "HIGH";
  }

  if (
    risks.includes(
      "MEDIUM"
    )
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
      // Continue to the next history file.
    }
  }

  return [];
}

function createManifest({
  runId,
  topic,
  script,
  description,
  language,
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
        cleanText(topic),

      description:
        cleanText(description),

      language:
        cleanText(language),

      riskLevel
    },

    script:
      cleanText(script),

    production,

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

  const limit =
    getDailyLimitStatus(
      state
    );

  if (
    limit.reached
  ) {
    await appendLog({
      runId,

      status:
        "DAILY_LIMIT_REACHED"
    });

    return {
      success: false,

      status:
        "DAILY_LIMIT_REACHED",

      runId,

      dailyLimit:
        limit
    };
  }

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

  let automationAllowed;

  try {
    automationAllowed =
      canRunAutomation();
  } catch {
    automationAllowed =
      false;
  }

  if (
    automationAllowed !== true
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

      systemStatus
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
      Boolean(dryRun)
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

      rank:
        1,

      source:
        "manual"
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

  const researchStage =
    await runStage(
      "RESEARCH",
      async () =>
        researchTopic(
          selectedTopic
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

  const research =
    researchStage.result;

  const researchText =
    getResearchText(
      research
    );

  if (
    research?.success === false ||
    researchText.length < 50
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

      research
    };
  }

  /*
   * =========================================================
   * 3. SCRIPT GENERATION
   * =========================================================
   */

  const scriptStage =
    await runStage(
      "SCRIPT",
      async () =>
        generateScript({
          topic:
            selectedTopic,

          research:
            researchText,

          language
        })
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

  const finalScript =
    getScriptText(
      scriptStage.result
    );

  if (
    finalScript.length < 100
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
          topic:
            selectedTopic,

          script:
            finalScript,

          research:
            researchText
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

  const safetyRisk =
    String(
      safety?.riskLevel ||
      ""
    ).toUpperCase();

  const safetyBlocked =
    safety?.blocked === true ||
    safety?.allowed === false ||
    (
      safety?.safe === false &&
      safetyRisk === "HIGH"
    );

  if (
    safetyBlocked
  ) {
    await appendLog({
      runId,

      status:
        "SAFETY_BLOCKED"
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

  const copyrightStage =
    await runStage(
      "COPYRIGHT",
      async () =>
        checkCopyrightSafety({
          topic:
            selectedTopic,

          script:
            finalScript
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

  const copyrightRisk =
    String(
      copyright?.riskLevel ||
      ""
    ).toUpperCase();

  const copyrightBlocked =
    copyright?.blocked === true ||
    copyright?.allowed === false ||
    copyrightRisk ===
      "HIGH";

  if (
    copyrightBlocked
  ) {
    await appendLog({
      runId,

      status:
        "COPYRIGHT_BLOCKED"
    });

    return {
      success: false,

      status:
        "COPYRIGHT_BLOCKED",

      runId,

      topic:
        selectedTopic,

      copyright
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
            selectedTopic,

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

      script:
        finalScript,

      description:
        cleanText(
          description
        ),

      language,

      production,

      riskLevel
    });

  /*
   * =========================================================
   * 11. FINAL VIDEO QA
   * =========================================================
   */

  const finalVideoFile =
    production?.finalVideo
      ?.outputFile ||
    production?.finalVideoFile ||
    production?.outputFile;

  if (
    !cleanText(
      finalVideoFile
    )
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
   * 12. CEO APPROVAL GATE
   * =========================================================
   */

  let approval = null;

  if (
    requiresCEOApproval
  ) {
    try {
      approval =
        await createCEOApprovalRequest({
          type:
            "YOUTUBE_SHORT_PUBLISH",

          runId,

          topic:
            selectedTopic,

          riskLevel,

          reason:
            `Automation produced a ${riskLevel} risk Short that requires CEO approval.`,

          manifest,

          qa
        });
    } catch (error) {
      approval = {
        success: false,

        status:
          "APPROVAL_REQUEST_FAILED",

        error:
          error?.message ||
          String(error)
      };
    }

    await appendLog({
      runId,

      status:
        "CEO_REVIEW_REQUIRED",

      riskLevel
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

      riskLevel,

      requiresCEOApproval:
        true,

      manifest,

      production,

      qa,

      supportingContent:
        supportingStage,

      approval,

      dailyLimit:
        getDailyLimitStatus(
          state
        ),

      nextStage:
        "CEO_APPROVAL"
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
    await appendLog({
      runId,

      status:
        "DRY_RUN_READY"
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

      riskLevel,

      requiresCEOApproval:
        false,

      manifest,

      production,

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
   *
   * This orchestrator does NOT directly upload to YouTube.
   *
   * YouTube OAuth/upload remains behind the dedicated
   * YouTube production pipeline and publishing guards.
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

    dailyCount:
      state.dailyCount
  });

  return {
    success: true,

    status:
      "READY_FOR_YOUTUBE",

    runId,

    topic:
      selectedTopic,

    title:
      cleanText(
        title ||
        selectedTopic
      ),

    description:
      cleanText(
        description
      ),

    language,

    riskLevel,

    requiresCEOApproval:
      false,

    manifest,

    production,

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

      maxDailyVideos:
        MAX_DAILY_VIDEOS,

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
      "Automation orchestrator is ready. Maximum five Shorts per day. Final YouTube publishing remains behind dedicated upload and CEO safety gates."
  };
}

export async function previewAutomation(
  options = {}
) {
  return runAutomation({
    ...options,

    dryRun:
      true
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