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
        Number(state.dailyCount || 0),

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

function resetDailyStateIfNeeded(
  state
) {
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

function getDailyLimitStatus(
  state
) {
  return {
    limit:
      MAX_DAILY_VIDEOS,

    used:
      Number(state.dailyCount || 0),

    remaining:
      Math.max(
        0,
        MAX_DAILY_VIDEOS -
          Number(state.dailyCount || 0)
      ),

    reached:
      Number(state.dailyCount || 0) >=
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