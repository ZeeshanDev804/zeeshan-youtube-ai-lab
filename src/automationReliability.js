import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";

const STATE_FILE =
  process.env.AUTOMATION_RELIABILITY_STATE_FILE ||
  "./storage/automation/reliability-state.json";

const LOG_FILE =
  process.env.AUTOMATION_RELIABILITY_LOG_FILE ||
  "./storage/automation/reliability-log.jsonl";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1000;
const MAX_LOG_ENTRIES = 5000;

function now() {
  return new Date().toISOString();
}

function createId(prefix = "job") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
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

function defaultState() {
  return {
    version: 1,
    updatedAt: now(),
    jobs: {},
    locks: {}
  };
}

async function readState() {
  await ensureStorage();

  try {
    const raw =
      await fs.readFile(
        STATE_FILE,
        "utf8"
      );

    const state =
      JSON.parse(raw);

    if (
      !state ||
      typeof state !== "object"
    ) {
      return defaultState();
    }

    return {
      ...defaultState(),
      ...state,
      jobs:
        state.jobs || {},
      locks:
        state.locks || {}
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultState();
    }

    throw error;
  }
}

async function writeState(state) {
  await ensureStorage();

  const temporaryFile =
    `${STATE_FILE}.tmp`;

  const nextState = {
    ...state,
    updatedAt: now()
  };

  await fs.writeFile(
    temporaryFile,
    JSON.stringify(
      nextState,
      null,
      2
    ),
    "utf8"
  );

  await fs.rename(
    temporaryFile,
    STATE_FILE
  );
}

async function appendLog(entry = {}) {
  await ensureStorage();

  const record = {
    id:
      createId("log"),
    timestamp:
      now(),
    ...entry
  };

  await fs.appendFile(
    LOG_FILE,
    JSON.stringify(record) + "\n",
    "utf8"
  );

  return record;
}

function calculateDelay(
  attempt,
  baseDelayMs
) {
  const safeAttempt =
    Math.max(
      1,
      Number(attempt) || 1
    );

  const safeBase =
    Math.max(
      100,
      Number(baseDelayMs) ||
        DEFAULT_BASE_DELAY_MS
    );

  return Math.min(
    safeBase *
      2 ** (safeAttempt - 1),
    30000
  );
}

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function isRetryableError(error) {
  if (!error) {
    return true;
  }

  const code =
    cleanText(
      error.code
    ).toUpperCase();

  const message =
    cleanText(
      error.message
    ).toLowerCase();

  const permanentCodes = [
    "INVALID_ARGUMENT",
    "AUTHENTICATION_FAILED",
    "AUTHORIZATION_FAILED",
    "PERMISSION_DENIED",
    "NOT_FOUND",
    "INVALID_REQUEST",
    "VALIDATION_ERROR"
  ];

  if (
    permanentCodes.includes(code)
  ) {
    return false;
  }

  const permanentMessages = [
    "invalid argument",
    "invalid request",
    "permission denied",
    "unauthorized",
    "authentication failed",
    "not found",
    "validation failed"
  ];

  if (
    permanentMessages.some(
      (item) =>
        message.includes(item)
    )
  ) {
    return false;
  }

  return true;
}

function normalizeError(error) {
  return {
    name:
      error?.name ||
      "Error",

    message:
      error?.message ||
      String(error),

    code:
      error?.code ||
      null,

    stack:
      error?.stack ||
      null
  };
}

/*
 * ---------------------------------------------------------
 * JOB STATE
 * ---------------------------------------------------------
 */

export async function createReliabilityJob({
  runId = createId("run"),
  topic = "",
  stage = "START"
} = {}) {
  const state =
    await readState();

  if (state.jobs[runId]) {
    return {
      success: true,
      status: "EXISTS",
      job:
        state.jobs[runId]
    };
  }

  const job = {
    runId,

    topic:
      cleanText(topic),

    status:
      "RUNNING",

    currentStage:
      cleanText(stage) ||
      "START",

    attempts: {},

    startedAt:
      now(),

    updatedAt:
      now(),

    completedAt:
      null,

    failedAt:
      null,

    lastError:
      null
  };

  state.jobs[runId] =
    job;

  await writeState(
    state
  );

  await appendLog({
    type:
      "JOB_CREATED",
    runId,
    stage:
      job.currentStage,
    topic:
      job.topic
  });

  return {
    success: true,
    status:
      "CREATED",
    job
  };
}

export async function updateReliabilityJob({
  runId,
  status,
  stage,
  error = null,
  metadata = {}
} = {}) {
  if (!runId) {
    return {
      success: false,
      status:
        "INVALID_RUN_ID"
    };
  }

  const state =
    await readState();

  const job =
    state.jobs[runId];

  if (!job) {
    return {
      success: false,
      status:
        "JOB_NOT_FOUND"
    };
  }

  if (status) {
    job.status =
      cleanText(status);
  }

  if (stage) {
    job.currentStage =
      cleanText(stage);
  }

  if (error) {
    job.lastError =
      normalizeError(error);
  }

  job.metadata = {
    ...(job.metadata || {}),
    ...metadata
  };

  job.updatedAt =
    now();

  if (
    job.status ===
    "COMPLETED"
  ) {
    job.completedAt =
      now();
  }

  if (
    job.status ===
      "FAILED" ||
    job.status ===
      "BLOCKED"
  ) {
    job.failedAt =
      now();
  }

  state.jobs[runId] =
    job;

  await writeState(
    state
  );

  await appendLog({
    type:
      "JOB_UPDATED",
    runId,
    status:
      job.status,
    stage:
      job.currentStage,
    error:
      job.lastError,
    metadata
  });

  return {
    success: true,
    status:
      "UPDATED",
    job
  };
}

/*
 * ---------------------------------------------------------
 * STAGE RETRY ENGINE
 * ---------------------------------------------------------
 */

export async function runReliableStage({
  runId,
  stage,
  operation,
  maxRetries =
    DEFAULT_MAX_RETRIES,
  baseDelayMs =
    DEFAULT_BASE_DELAY_MS,
  retryOn
} = {}) {
  if (
    typeof operation !==
    "function"
  ) {
    throw new TypeError(
      "operation must be a function."
    );
  }

  const safeRetries =
    Math.max(
      0,
      Math.min(
        5,
        Number(maxRetries) ||
          0
      )
    );

  const state =
    await readState();

  const job =
    runId
      ? state.jobs[runId]
      : null;

  if (
    runId &&
    !job
  ) {
    return {
      success: false,
      status:
        "JOB_NOT_FOUND",
      runId,
      stage
    };
  }

  if (job) {
    job.currentStage =
      stage;
    job.updatedAt =
      now();

    state.jobs[runId] =
      job;

    await writeState(
      state
    );
  }

  for (
    let attempt = 1;
    attempt <= safeRetries + 1;
    attempt += 1
  ) {
    if (job) {
      job.attempts[stage] =
        attempt;

      job.updatedAt =
        now();

      state.jobs[runId] =
        job;

      await writeState(
        state
      );
    }

    await appendLog({
      type:
        "STAGE_ATTEMPT",
      runId,
      stage,
      attempt,
      maxAttempts:
        safeRetries + 1
    });

    try {
      const result =
        await operation({
          attempt,
          runId,
          stage
        });

      await appendLog({
        type:
          "STAGE_SUCCESS",
        runId,
        stage,
        attempt
      });

      if (job) {
        job.updatedAt =
          now();

        job.lastError =
          null;

        state.jobs[runId] =
          job;

        await writeState(
          state
        );
      }

      return {
        success: true,
        status:
          "STAGE_COMPLETED",
        runId,
        stage,
        attempt,
        result
      };
    } catch (error) {
      const normalized =
        normalizeError(
          error
        );

      const retryAllowed =
        typeof retryOn ===
        "function"
          ? Boolean(
              retryOn({
                error,
                attempt,
                runId,
                stage
              })
            )
          : isRetryableError(
              error
            );

      await appendLog({
        type:
          "STAGE_FAILURE",
        runId,
        stage,
        attempt,
        retryAllowed,
        error:
          normalized
      });

      if (job) {
        job.lastError =
          normalized;

        job.updatedAt =
          now();

        state.jobs[runId] =
          job;

        await writeState(
          state
        );
      }

      if (
        !retryAllowed ||
        attempt >
          safeRetries
      ) {
        if (job) {
          job.status =
            "FAILED";

          job.failedAt =
            now();

          job.updatedAt =
            now();

          state.jobs[runId] =
            job;

          await writeState(
            state
          );
        }

        await appendLog({
          type:
            "STAGE_FINAL_FAILURE",
          runId,
          stage,
          attempt,
          error:
            normalized
        });

        return {
          success: false,
          status:
            "STAGE_FAILED",
          runId,
          stage,
          attempt,
          error:
            normalized,
          retryAllowed:
            false
        };
      }

      const delay =
        calculateDelay(
          attempt,
          baseDelayMs
        );

      await appendLog({
        type:
          "STAGE_BACKOFF",
        runId,
        stage,
        attempt,
        delayMs:
          delay
      });

      await sleep(
        delay
      );
    }
  }

  return {
    success: false,
    status:
      "STAGE_FAILED",
    runId,
    stage
  };
}

/*
 * ---------------------------------------------------------
 * IDEMPOTENCY / DUPLICATE JOB LOCK
 * ---------------------------------------------------------
 */

export async function acquireJobLock({
  lockKey
} = {}) {
  const key =
    cleanText(lockKey);

  if (!key) {
    return {
      success: false,
      status:
        "INVALID_LOCK_KEY"
    };
  }

  const state =
    await readState();

  const existing =
    state.locks[key];

  if (
    existing &&
    existing.status ===
      "ACTIVE"
  ) {
    return {
      success: false,
      status:
        "LOCKED",
      lock:
        existing
    };
  }

  const lock = {
    key,

    status:
      "ACTIVE",

    acquiredAt:
      now(),

    owner:
      createId("worker")
  };

  state.locks[key] =
    lock;

  await writeState(
    state
  );

  await appendLog({
    type:
      "LOCK_ACQUIRED",
    lockKey:
      key,
    owner:
      lock.owner
  });

  return {
    success: true,
    status:
      "LOCK_ACQUIRED",
    lock
  };
}

export async function releaseJobLock({
  lockKey
} = {}) {
  const key =
    cleanText(lockKey);

  if (!key) {
    return {
      success: false,
      status:
        "INVALID_LOCK_KEY"
    };
  }

  const state =
    await readState();

  const lock =
    state.locks[key];

  if (!lock) {
    return {
      success: true,
      status:
        "NOT_LOCKED"
    };
  }

  lock.status =
    "RELEASED";

  lock.releasedAt =
    now();

  state.locks[key] =
    lock;

  await writeState(
    state
  );

  await appendLog({
    type:
      "LOCK_RELEASED",
    lockKey:
      key,
    owner:
      lock.owner
  });

  return {
    success: true,
    status:
      "LOCK_RELEASED",
    lock
  };
}

/*
 * ---------------------------------------------------------
 * JOB FINALIZATION
 * ---------------------------------------------------------
 */

export async function completeReliabilityJob({
  runId,
  metadata = {}
} = {}) {
  return updateReliabilityJob({
    runId,
    status:
      "COMPLETED",
    stage:
      "COMPLETE",
    metadata
  });
}

export async function failReliabilityJob({
  runId,
  error,
  stage = "UNKNOWN",
  metadata = {}
} = {}) {
  return updateReliabilityJob({
    runId,
    status:
      "FAILED",
    stage,
    error,
    metadata
  });
}

/*
 * ---------------------------------------------------------
 * RECOVERY
 * ---------------------------------------------------------
 */

export async function getRecoverableJobs() {
  const state =
    await readState();

  const jobs =
    Object.values(
      state.jobs
    );

  return jobs.filter(
    (job) =>
      job &&
      (
        job.status ===
          "RUNNING" ||
        job.status ===
          "RETRYING"
      )
  );
}

export async function recoverInterruptedJobs() {
  const jobs =
    await getRecoverableJobs();

  if (
    jobs.length === 0
  ) {
    return {
      success: true,
      status:
        "NO_INTERRUPTED_JOBS",
      recovered: 0,
      jobs: []
    };
  }

  const state =
    await readState();

  const recovered = [];

  for (const job of jobs) {
    job.status =
      "RECOVERY_REQUIRED";

    job.updatedAt =
      now();

    state.jobs[job.runId] =
      job;

    recovered.push({
      runId:
        job.runId,

      stage:
        job.currentStage,

      status:
        job.status
    });

    await appendLog({
      type:
        "JOB_RECOVERY_REQUIRED",
      runId:
        job.runId,
      stage:
        job.currentStage
    });
  }

  await writeState(
    state
  );

  return {
    success: true,
    status:
      "RECOVERY_MARKED",
    recovered:
      recovered.length,
    jobs:
      recovered
  };
}

/*
 * ---------------------------------------------------------
 * LOG / STATE STATUS
 * ---------------------------------------------------------
 */

export async function getReliabilityStatus() {
  const state =
    await readState();

  const jobs =
    Object.values(
      state.jobs
    );

  const active =
    jobs.filter(
      (job) =>
        job.status ===
        "RUNNING"
    );

  const failed =
    jobs.filter(
      (job) =>
        job.status ===
        "FAILED"
    );

  const completed =
    jobs.filter(
      (job) =>
        job.status ===
        "COMPLETED"
    );

  const recovery =
    jobs.filter(
      (job) =>
        job.status ===
        "RECOVERY_REQUIRED"
    );

  return {
    configured: true,

    status:
      "READY",

    stateVersion:
      state.version,

    jobs: {
      total:
        jobs.length,

      active:
        active.length,

      failed:
        failed.length,

      completed:
        completed.length,
