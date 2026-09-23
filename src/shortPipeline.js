import { createScriptPlaceholder } from "./scriptEngine.js";
import { researchTopic } from "./researchEngine.js";
import {
  checkCopyrightSafety as checkCopyright
} from "./copyrightGuard.js";
import { checkDuplicateContent } from "./duplicateGuard.js";
import {
  analyzeSafety as evaluateSafety
} from "./safetyGuard.js";
import { createTTSJob } from "./ttsProvider.js";
import { createVisualJob } from "./visualProvider.js";
import { createVideoJob } from "./videoEngine.js";
import { createCEOApprovalRequest } from "./ceoControl.js";

function createPipelineId() {
  return `pipeline_${Date.now()}`;
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function validateTopic(topic) {
  const cleanTopic = cleanText(topic);

  if (!cleanTopic) {
    return {
      valid: false,
      error: "Topic is required."
    };
  }

  if (cleanTopic.length > 300) {
    return {
      valid: false,
      error: "Topic is too long."
    };
  }

  return {
    valid: true,
    topic: cleanTopic
  };
}

function createPipelineResult({
  id,
  status,
  stage,
  topic,
  steps = [],
  errors = [],
  warnings = []
}) {
  return {
    success: status === "READY",
    id,
    status,
    stage,
    topic,
    steps,
    errors,
    warnings,
    createdAt: new Date().toISOString()
  };
}

export async function buildShortPipeline({
  topic,
  language = "en-US",
  voice = "default",
  visualProvider = "not_configured",
  durationSeconds = 30,
  research = {},
  sourceText = "",
  sourceUrl = "",
  media = {},
  existingContent = []
} = {}) {
  const pipelineId = createPipelineId();

  const topicCheck = validateTopic(topic);

  if (!topicCheck.valid) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "INPUT_VALIDATION",
      topic: topic || "",
      errors: [topicCheck.error]
    });
  }

  const cleanTopicValue = topicCheck.topic;

  const steps = [];
  const warnings = [];
  const errors = [];

  // ========================================
  // STAGE 1 — RESEARCH
  // ========================================

  let researchResult;

  try {
    researchResult = await researchTopic({
      topic: cleanTopicValue,
      ...research
    });
  } catch (error) {
    researchResult = {
      status: "FAILED",
      error:
        error?.message ||
        "Research failed."
    };
  }

  steps.push({
    stage: "RESEARCH",
    status:
      researchResult?.status ||
      "UNKNOWN"
  });

  if (
    researchResult?.status ===
    "FAILED"
  ) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "RESEARCH",
      topic: cleanTopicValue,
      steps,
      errors: [
        "Research stage failed."
      ]
    });
  }

  if (
    researchResult?.status !==
    "READY"
  ) {
    warnings.push(
      "Live research provider is not connected yet."
    );
  }

  // ========================================
  // STAGE 2 — SCRIPT
  // ========================================

  let scriptResult;

  try {
    scriptResult =
      createScriptPlaceholder({
        topic: cleanTopicValue,
        language
      });
  } catch (error) {
    scriptResult = {
      status: "FAILED",
      error:
        error?.message ||
        "Script preparation failed."
    };
  }

  steps.push({
    stage: "SCRIPT",
    status:
      scriptResult?.status ||
      "UNKNOWN"
  });

  if (
    scriptResult?.status ===
    "FAILED"
  ) {
    errors.push(
      "Script preparation failed."
    );
  }

  const scriptText =
    cleanText(
      scriptResult?.script ||
      ""
    );

  // ========================================
  // STAGE 3 — SAFETY
  // ========================================

  let safetyResult;

  try {
    safetyResult =
      evaluateSafety({
        topic: cleanTopicValue,
        script: scriptText,
        research: researchResult
      });
  } catch (error) {
    safetyResult = {
      status: "BLOCK",
      reason:
        error?.message ||
        "Safety check failed."
    };
  }

  steps.push({
    stage: "SAFETY",
    status:
      safetyResult?.status ||
      "UNKNOWN"
  });

  if (
    safetyResult?.status ===
    "BLOCK"
  ) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "SAFETY",
      topic: cleanTopicValue,
      steps,
      errors: [
        safetyResult.reason ||
        "Safety system blocked this topic."
      ]
    });
  }

  if (
    safetyResult?.status ===
    "RE