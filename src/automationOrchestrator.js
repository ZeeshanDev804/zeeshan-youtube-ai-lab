import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

import config from "./config.js";

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

const STATE_FILE =
  process.env.AUTOMATION_STATE_FILE ||
  "./storage/automation/automation-state.json";

const LOG_FILE =
  process.env.AUTOMATION_LOG_FILE ||
  "./storage/automation/automation-log.jsonl";

const DEFAULT_MAX_RETRIES = 2;

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createRunId() {
  return `automation_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function todayKey() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

async function ensureStorage() {
  await fs.mkdir(
    path.dirname(STATE_FILE),
    {
      recursive: true
    }
  );

  await fs.mkdir(
    path.dirname(LOG_FILE),
    {
      recursive: true
    }
  );
}

async function readState() {
  await ensureStorage();

  try {
    const raw =
      await fs.readFile(
        STATE_FILE,
        "utf8"
      );

    const parsed =
      JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error(
        "Invalid automation state."
      );
    }

    return parsed;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    return {
      date: todayKey(),
      createdToday: 0,
      completedToday: 0,
      failedToday: 0,
      reviewToday: 0,
      lastRunAt: null,
      lastStatus: null,
      lastRunId: null
    };
  }
}

async function writeState(state) {
  await ensureStorage();

  await fs.writeFile(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    ),
    "utf8"
  );
}

async function getDailyState() {
  const state =
    await readState();

  const today =
    todayKey();

  if (state.date !== today) {
    return {
      date: today,
      createdToday: 0,
      completedToday: 0,
      failedToday: 0,
      reviewToday: 0,
      lastRunAt: null,
      lastStatus: null,
      lastRunId: null
    };
  }

  return state;
}

async function updateDailyState(patch = {}) {
  const state =
    await getDailyState();

  const next = {
    ...state,
    ...patch
  };

  await writeState(next);

  return next;
}

async function appendLog(entry = {}) {
  await ensureStorage();

  const line =
    JSON.stringify({
      timestamp:
        new Date().toISOString(),
      ...entry
    }) + "\n";

  await fs.appendFile(
    LOG_FILE,
    line,
    "utf8"
  );
}

function blockedResult({
  runId,
  stage,
  reason,
  details = null,
  nextAction = null
} = {}) {
  return {
    success: false,
    status: "BLOCKED",
    runId,
    stage,
    reason,
    details,
    nextAction,
    createdAt:
      new Date().toISOString()
  };
}

function reviewResult({
  runId,
  stage,
  reason,
  details = null,
  approvalRequest = null
} = {}) {
  return {
    success: true,
    status: "CEO_REVIEW_REQUIRED",
    runId,
    stage,
    reason,
    details,
    approvalRequest,
    createdAt:
      new Date().toISOString()
  };
}

function getResearchStatus(
  researchResult
) {
  return (
    researchResult?.result?.status ||
    researchResult?.status ||
    "UNKNOWN"
  );
}

function getResearchSources(
  researchResult
) {
  if (
    Array.isArray(
      researchResult?.result?.sources
    )
  ) {
    return researchResult.result.sources;
  }

  if (
    Array.isArray(
      researchResult?.sources
    )
  ) {
    return researchResult.sources;
  }

  return [];
}

function getResearchConfidence(
  researchResult
) {
  return safeNumber(
    researchResult?.result?.confidence ??
      researchResult?.confidence,
    0
  );
}

function getRiskLevel(
  safety,
  copyright,
  duplicate
) {
  if (
    safety?.level === "HIGH"
  ) {
    return "HIGH";
  }

  if (
    copyright?.status === "BLOCK" ||
    duplicate?.status === "BLOCK"
  ) {
    return "HIGH";
  }

  if (
    safety?.level === "MEDIUM" ||
    copyright?.status === "REVIEW" ||
    duplicate?.status === "REVIEW"
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildManifest({
  runId,
  topic,
  script,
  description,
  language,
  voice,
  visuals,
  visualVideo,
  finalVideo
} = {}) {
  return {
    id:
      `production_${runId}`,

    metadata: {
      topic:
        cleanText(topic),

      title:
        cleanText(topic),

      description:
        cleanText(description),

      language,

      estimatedDurationSeconds:
        null,

      targetDurationSeconds:
        null
    },

    voice: {
      id:
        voice?.outputFile ||
        `voice_${runId}`,

      status:
        voice?.success
          ? "READY"
          : "FAILED",

      provider:
        voice?.provider ||
        "unknown",

      outputFile:
        voice?.outputFile ||
        null
    },

    visuals: {
      provider:
        visuals?.provider ||
        "unknown",

      sceneCount:
        visuals?.sceneCount ||
        0,

      jobs:
        visuals?.scenes ||
        [],

      timeline: []
    },

    video: {
      id:
        `video_${runId}`,

      status:
        visualVideo?.success
          ? "READY"
          : "FAILED",

      width:
        1080,

      height:
        1920,

      fps:
        30,

      durationSeconds:
        null,

      outputFile:
        finalVideo?.outputFile ||
        visualVideo?.outputFile ||
        null
    },

    productionOrder: [
      "SCRIPT",
      "VOICE",
      "VISUALS",
      "VIDEO_RENDER",
      "FINAL_AUDIO_VIDEO_MERGE",
      "QUALITY_CHECK",
      "CEO_GATE",
      "PUBLISH"
    ],

    createdAt:
      new Date().toISOString()
  };
}

async function retryStage(
  stage,
  operation,
  maxRetries = DEFAULT_MAX_RETRIES
) {
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= maxRetries + 1;
    attempt += 1
  ) {
    try {
      const result =
        await operation(attempt);

      return {
        success: true,
        stage,
        attempt,
        result
      };
    } catch (error) {
      lastError = error;

      await appendLog({
        type: "STAGE_RETRY",
        stage,
        attempt,
        error:
          error?.message ||
          String(error)
      });

      if (
        attempt <= maxRetries
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              750 * attempt
            )
        );
      }
    }
  }

  return {
    success: false,
    stage,
    attempts:
      maxRetries + 1,
    error:
      lastError?.message ||
      "Stage failed."
  };
}

async function selectTopic({
  topic
} = {}) {
  if (
    topic &&
    typeof topic === "object" &&
    cleanText(topic.title)
  ) {
    return {
      success: true,
      source: "INPUT",
      topic: {
        ...topic,
        title:
          cleanText(topic.title)
      }
    };
  }

  const trendResult =
    await collectTrends();

  if (
    !trendResult ||
    !Array.isArray(
      trendResult.topics
    ) ||
    trendResult.topics.length === 0
  ) {
    return {
      success: false,
      status: "NO_TRENDS",
      trendResult
    };
  }

  const selected =
    trendResult.topics[0];

  return {
    success: true,
    source: "TREND_RADAR",
    topic: selected,
    trendResult
  };
}

export async function runAutomationCycle({
  topic = null,
  script = "",
  existingContent = [],
  language =
    config.audience.language === "en"
      ? "en-US"
      : config.audience.language,
  voiceId,
  maxRetries =
    DEFAULT_MAX_RETRIES
} = {}) {
  const runId =
    createRunId();

  await appendLog({
    type: "AUTOMATION_START",
    runId
  });

  /*
   * ---------------------------------------------------------
   * 0. CEO SYSTEM GATE
   * ---------------------------------------------------------
   */

  if (!canRunAutomation()) {
    const result =
      blockedResult({
        runId,
        stage: "CEO_CONTROL",
        reason:
          "Automation is stopped by CEO control.",
        nextAction:
          "Set system mode to AUTO or REVIEW and disable Emergency STOP when safe."
      });

    await appendLog({
      type: "AUTOMATION_BLOCKED",
      runId,
      result
    });

    return result;
  }

  /*
   * ---------------------------------------------------------
   * 1. DAILY LIMIT
   * ---------------------------------------------------------
   */

  const daily =
    await getDailyState();

  const maxDaily =
    Math.min(
      5,
      Math.max(
        1,
        safeNumber(
          config.system.maxDailyVideos,
          5
        )
      )
    );

  if (
    daily.createdToday >=
    maxDaily
  ) {
    const result =
      blockedResult({
        runId,
        stage: "DAILY_LIMIT",
        reason:
          `Daily production limit reached: ${maxDaily}.`,
        nextAction:
          "Wait for the next UTC day before starting another production cycle."
      });

    await appendLog({
      type: "DAILY_LIMIT_BLOCK",
      runId,
      result
    });

    return result;
  }

  /*
   * Reserve the production slot.
   * This prevents multiple runs from
   * silently exceeding the daily limit.
   */

  await updateDailyState({
    createdToday:
      daily.createdToday + 1,
    lastRunAt:
      new Date().toISOString(),
    lastRunId:
      runId,
    lastStatus:
      "RUNNING"
  });

  /*
   * ---------------------------------------------------------
   * 2. TOPIC / TREND
   * ---------------------------------------------------------
   */

  const topicSelection =
    await retryStage(
      "TOPIC",
      () =>
        selectTopic({
          topic
        }),
      maxRetries
    );

  if (!topicSelection.success) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "TOPIC_FAILED"
    });

    return blockedResult({
      runId,
      stage: "TOPIC",
      reason:
        topicSelection.error,
      details:
        topicSelection
    });
  }

  const selectedTopic =
    topicSelection.result.topic;

  /*
   * ---------------------------------------------------------
   * 3. RESEARCH
   * ---------------------------------------------------------
   */

  const researchRun =
    await retryStage(
      "RESEARCH",
      () =>
        researchTopic(
          selectedTopic
        ),
      maxRetries
    );

  if (!researchRun.success) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "RESEARCH_FAILED"
    });

    return blockedResult({
      runId,
      stage: "RESEARCH",
      reason:
        "Research stage failed.",
      details:
        researchRun
    });
  }

  const research =
    researchRun.result;

  const researchStatus =
    getResearchStatus(
      research
    );

  const researchSources =
    getResearchSources(
      research
    );

  const researchConfidence =
    getResearchConfidence(
      research
    );

  /*
   * Never allow unverified factual
   * content to enter production.
   */

  if (
    researchStatus ===
      "INSUFFICIENT_RESEARCH" ||
    researchStatus ===
      "READY_FOR_RESEARCH_PROVIDER"
  ) {
    const result =
      reviewResult({
        runId,
        stage: "RESEARCH",
        reason:
          "Verified live research is not available.",
        details: {
          status:
            researchStatus,
          confidence:
            researchConfidence,
          sourceCount:
            researchSources.length
        }
      });

    await updateDailyState({
      reviewToday:
        daily.reviewToday + 1,
      lastStatus:
        "RESEARCH_REVIEW"
    });

    await appendLog({
      type: "RESEARCH_REVIEW",
      runId,
      result
    });

    return result;
  }

  /*
   * ---------------------------------------------------------
   * 4. SCRIPT
   * ---------------------------------------------------------
   */

  let finalScript =
    cleanText(script);

  let generatedScript =
    null;

  if (!finalScript) {
    const scriptRun =
      await retryStage(
        "SCRIPT",
        () =>
          generateScript({
            ...selectedTopic,
            research
          }),
        maxRetries
      );

    if (!scriptRun.success) {
      await updateDailyState({
        failedToday:
          daily.failedToday + 1,
        lastStatus:
          "SCRIPT_FAILED"
      });

      return blockedResult({
        runId,
        stage: "SCRIPT",
        reason:
          "Script generation failed.",
        details:
          scriptRun
      });
    }

    generatedScript =
      scriptRun.result;

    finalScript =
      cleanText(
        generatedScript.script
      );
  }

  if (
    finalScript.length < 100
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "SCRIPT_INVALID"
    });

    return blockedResult({
      runId,
      stage: "SCRIPT",
      reason:
        "Generated script is too short.",
      nextAction:
        "Generate a complete original script before production."
    });
  }

  const title =
    cleanText(
      generatedScript?.title ||
      selectedTopic.title
    );

  const description =
    cleanText(
      generatedScript?.description ||
      selectedTopic.description ||
      ""
    );

  /*
   * ---------------------------------------------------------
   * 5. SAFETY
   * ---------------------------------------------------------
   */

  const safety =
    analyzeSafety({
      title,
      script:
        finalScript,
      description,
      research
    });

  if (
    safety?.level === "HIGH" ||
    safety?.action === "BLOCK"
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "SAFETY_BLOCKED"
    });

    return blockedResult({
      runId,
      stage: "SAFETY",
      reason:
        "Safety guard blocked this content.",
      details:
        safety
    });
  }

  /*
   * ---------------------------------------------------------
   * 6. COPYRIGHT
   * ---------------------------------------------------------
   */

  let copyright;

  try {
    copyright =
      checkCopyrightSafety({
        title,
        script:
          finalScript,
        sources:
          researchSources,
        metadata: {
          category:
            selectedTopic.category ||
            "general",

          region:
            selectedTopic.region ||
            null
        }
      });
  } catch (error) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "COPYRIGHT_FAILED"
    });

    return blockedResult({
      runId,
      stage: "COPYRIGHT",
      reason:
        "Copyright safety check failed.",
      details:
        error.message
    });
  }

  if (
    copyright?.status ===
    "BLOCK"
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "COPYRIGHT_BLOCKED"
    });

    return blockedResult({
      runId,
      stage: "COPYRIGHT",
      reason:
        copyright.reason ||
        "Copyright guard blocked this content.",
      details:
        copyright
    });
  }

  /*
   * ---------------------------------------------------------
   * 7. DUPLICATE / SIMILARITY
   * ---------------------------------------------------------
   */

  let duplicate;

  try {
    duplicate =
      checkDuplicateContent({
        title,
        script:
          finalScript,
        existingContent
      });
  } catch (error) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "DUPLICATE_CHECK_FAILED"
    });

    return blockedResult({
      runId,
      stage: "DUPLICATE",
      reason:
        "Duplicate check failed.",
      details:
        error.message
    });
  }

  if (
    duplicate?.status ===
    "BLOCK"
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "DUPLICATE_BLOCKED"
    });

    return blockedResult({
      runId,
      stage: "DUPLICATE",
      reason:
        duplicate.reason ||
        "Duplicate content detected.",
      details:
        duplicate
    });
  }

  /*
   * ---------------------------------------------------------
   * 8. RISK / CEO REVIEW DECISION
   * ---------------------------------------------------------
   */

  const riskLevel =
    getRiskLevel(
      safety,
      copyright,
      duplicate
    );

  const reviewReasons = [];

  if (
    safety?.level ===
      "MEDIUM"
  ) {
    reviewReasons.push(
      "Safety review required."
    );
  }

  if (
    copyright?.status ===
      "REVIEW"
  ) {
    reviewReasons.push(
      "Copyright review required."
    );
  }

  if (
    duplicate?.status ===
      "REVIEW"
  ) {
    reviewReasons.push(
      "Similarity review required."
    );
  }

  if (
    researchConfidence < 70
  ) {
    reviewReasons.push(
      "Research confidence is below the production threshold."
    );
  }

  if (
    config.system.ceoApprovalRequired
  ) {
    reviewReasons.push(
      "CEO approval is enabled."
    );
  }

  /*
   * ---------------------------------------------------------
   * 9. REAL PRODUCTION
   * ---------------------------------------------------------
   */

  const productionRun =
    await retryStage(
      "FINAL_PRODUCTION",
      () =>
        produceFinalShort({
          topic: title,
          script:
            finalScript,
          language,
          voiceId,
          durationPerScene: 5,
          fps:
            config.video.fps
        }),
      maxRetries
    );

  if (!productionRun.success) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "PRODUCTION_FAILED"
    });

    return blockedResult({
      runId,
      stage: "FINAL_PRODUCTION",
      reason:
        "Final Short production failed.",
      details:
        productionRun
    });
  }

  const production =
    productionRun.result;

  if (
    production?.success !== true
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "PRODUCTION_FAILED"
    });

    return blockedResult({
      runId,
      stage: "FINAL_PRODUCTION",
      reason:
        "Final Short production returned a failure.",
      details:
        production
    });
  }

  /*
   * ---------------------------------------------------------
   * 10. FINAL QA
   * ---------------------------------------------------------
   */

  const manifest =
    buildManifest({
      runId,
      topic: title,
      script:
        finalScript,
      description,
      language,
      voice:
        production.voice,
      visuals:
        production.visuals,
      visualVideo:
        production.visualVideo,
      finalVideo:
        production.finalVideo
    });

  const qaRun =
    await retryStage(
      "QUALITY_ASSURANCE",
      () =>
        checkFinalShortQuality({
          manifest,
          finalVideoFile:
            production.finalVideo
              .outputFile
        }),
      maxRetries
    );

  if (!qaRun.success) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "QA_FAILED"
    });

    return blockedResult({
      runId,
      stage: "QUALITY_ASSURANCE",
      reason:
        "Final video QA failed.",
      details:
        qaRun
    });
  }

  const qa =
    qaRun.result;

  if (
    qa?.passed !== true
  ) {
    await updateDailyState({
      failedToday:
        daily.failedToday + 1,
      lastStatus:
        "QA_BLOCKED"
    });

    return blockedResult({
      runId,
      stage: "QUALITY_ASSURANCE",
      reason:
        "Final video did not pass quality assurance.",
      details:
        qa
    });
  }

  /*
   * ---------------------------------------------------------
   * 11. CEO GATE
   * ---------------------------------------------------------
   */

  let approvalRequest =
    null;

  if (
    reviewReasons.length > 0 ||
    riskLevel !== "LOW"
  ) {
    approvalRequest =
      createCEOApprovalRequest({
        runId,
        title,
        riskLevel,
        reasons:
          reviewReasons.length > 0
            ? reviewReasons
            : [
                "Content requires CEO authorization before publishing."
              ],

        topic:
          selectedTopic,

        research: {
          status:
            researchStatus,
          confidence:
            researchConfidence,
          sourceCount:
            researchSources.length
        },

        safety,

        copyright,

        duplicate,

        production: {
          outputFile:
            production.finalVideo
              .outputFile,

          sizeBytes:
            production.finalVideo
              .sizeBytes
        },

        qa
      });

    const result =
      reviewResult({
        runId,
        stage: "CEO_GATE",
        reason:
          "Final Short passed production QA but requires CEO authorization.",
        details: {
          riskLevel,
          qaStatus:
            qa.status,
          outputFile:
            production.finalVideo
              .outputFile
        },
        approvalRequest
      });

    await updateDailyState({
      reviewToday:
        daily.reviewToday + 1,
      completedToday:
        daily.completedToday + 1,
      lastStatus:
        "CEO_REVIEW_REQUIRED"
    });

    await appendLog({
      type: "CEO_REVIEW_REQUIRED",
      runId,
      result
    });

    return result;
  }

  /*
   * ---------------------------------------------------------
   * 12. READY FOR YOUTUBE
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * This stage does NOT upload.
   * Google Cloud / YouTube OAuth comes later.
   */

  await updateDailyState({
    completedToday:
      daily.completedToday + 1,
    lastStatus:
      "READY_FOR_YOUTUBE"
  });

  const finalResult = {
    success: true,
    status:
      "READY_FOR_YOUTUBE",
    runId,

    topic: {
      title,
      region:
        selectedTopic.region ||
        null,
      category:
        selectedTopic.category ||
        "general"
    },

    research: {
      status:
        researchStatus,
      confidence:
        researchConfidence,
      sourceCount:
        researchSources.length
    },

    script: {
      title,
      description,
      characters:
        finalScript.length,
      words:
        finalScript.split(/\s+/).length
    },

    safety,

    copyright,

    duplicate,

    riskLevel,

    production,

    qa,

    manifest,

    nextStage:
      "YOUTUBE_UPLOAD_GUARD",

    youtubeUpload:
      "NOT_STARTED",

    createdAt:
      new Date().toISOString()
  };

  await appendLog({
    type: "AUTOMATION_READY",
    runId,
    result: {
      status:
        finalResult.status,
      riskLevel,
      videoFile:
        production.finalVideo
          .outputFile
    }
  });

  return finalResult;
}

export async function getAutomationStatus() {
  const daily =
    await getDailyState();

  const system =
    getSystemStatus();

  const maxDaily =
    Math.min(
      5,
      Math.max(
        1,
        safeNumber(
          config.system.maxDailyVideos,
          5
        )
      )
    );

  return {
    configured: true,

    status:
      system.emergencyStop
        ? "EMERGENCY_STOP"
        : system.mode === "STOP"
          ? "STOPPED"
          : "READY",

    mode:
      system.mode,

    emergencyStop:
      system.emergencyStop,

    maxDailyVideos:
      maxDaily,

    daily: {
      date:
        daily.date,

      created:
        daily.createdToday,

      completed:
        daily.completedToday,

      failed:
        daily.failedToday,

      review:
        daily.reviewToday,

      remaining:
        Math.max(
          0,
          maxDaily -
            daily.createdToday
        )
    },

    pipeline: [
      "CEO_CONTROL",
      "DAILY_LIMIT",
      "TREND_TOPIC",
      "RESEARCH",
      "SCRIPT",
      "SAFETY",
      "COPYRIGHT",
      "DUPLICATE",
      "REAL_VOICE",
      "REAL_VISUALS",
      "VIDEO_RENDER",
      "FINAL_MERGE",
      "QUALITY_ASSURANCE",
      "CEO_GATE",
      "YOUTUBE_UPLOAD_GUARD"
    ],

    youtubeUpload:
      "NOT_CONNECTED",

    message:
      "Automation core is ready. YouTube OAuth/upload remains intentionally disabled until the internal production pipeline is fully verified."
  };
}

export async function resetAutomationDailyState() {
  const freshState = {
    date:
      todayKey(),

    createdToday: 0,
    completedToday: 0,
    failedToday: 0,
    reviewToday: 0,

    lastRunAt: null,
    lastStatus: null,
    lastRunId: null
  };

  await writeState(
    freshState
  );

  await appendLog({
    type:
      "DAILY_STATE_RESET",
    state:
      freshState
  });

  return {
    success: true,
    status:
      "DAILY_STATE_RESET",
    state:
      freshState
  };
}

export function getAutomationOrchestratorStatus() {
  return {
    configured: true,

    status:
      "READY",

    maxDailyVideos:
      Math.min(
        5,
        Math.max(
          1,
          safeNumber(
            config.system.maxDailyVideos,
            5
          )
        )
      ),

    supports: [
      "TREND_SELECTION",
      "RESEARCH_GATE",
      "AI_SCRIPT",
      "SAFETY_GATE",
      "COPYRIGHT_GATE",
      "DUPLICATE_GATE",
      "REAL_VOICE",
      "REAL_VISUALS",
      "REAL_VIDEO",
      "FINAL_QA",
      "CEO_REVIEW",
      "EMERGENCY_STOP",
      "DAILY_LIMIT",
      "RETRY",
      "FAILURE_LOG",
      "YOUTUBE_READY_HANDOFF"
    ],

    youtubeUpload:
      "DISABLED_UNTIL_OAUTH",

    message:
      "Central automation orchestrator is configured for the internal YouTube Short production pipeline."
  };
}
