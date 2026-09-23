import { createScriptPlaceholder } from "./scriptEngine.js";
import { researchTopic } from "./researchEngine.js";
import { checkCopyright } from "./copyrightGuard.js";
import { checkDuplicateContent } from "./duplicateGuard.js";
import { evaluateSafety } from "./safetyGuard.js";
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

  const cleanTopicValue =
    topicCheck.topic;

  const steps = [];
  const warnings = [];
  const errors = [];

  /*
   * STAGE 1
   * Research
   */
  let researchResult;

  try {
    researchResult =
      await researchTopic({
        topic: cleanTopicValue,
        ...research
      });
  } catch (error) {
    researchResult = {
      status: "FAILED",
      error: error?.message ||
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

  /*
   * STAGE 2
   * Script preparation
   */
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
      error: error?.message ||
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

  /*
   * Use available script text.
   * Real AI script generation will be
   * connected later in production.
   */
  const scriptText =
    cleanText(
      scriptResult?.script ||
      ""
    );

  /*
   * STAGE 3
   * Safety
   */
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
      "REVIEW"
  ) {
    warnings.push(
      "Safety review is required."
    );
  }

  /*
   * STAGE 4
   * Duplicate protection
   */
  let duplicateResult;

  try {
    duplicateResult =
      checkDuplicateContent({
        text: scriptText ||
          cleanTopicValue,
        existingContent
      });
  } catch (error) {
    duplicateResult = {
      status: "REVIEW",
      reason:
        error?.message ||
        "Duplicate check failed."
    };
  }

  steps.push({
    stage: "DUPLICATE",
    status:
      duplicateResult?.status ||
      "UNKNOWN"
  });

  if (
    duplicateResult?.status ===
      "BLOCK"
  ) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "DUPLICATE",
      topic: cleanTopicValue,
      steps,
      errors: [
        "Duplicate-content protection blocked this item."
      ]
    });
  }

  /*
   * STAGE 5
   * Copyright / originality
   */
  let copyrightResult;

  try {
    copyrightResult =
      checkCopyright({
        text: scriptText,
        sourceText,
        sourceUrl,
        media
      });
  } catch (error) {
    copyrightResult = {
      status: "REVIEW",
      reason:
        error?.message ||
        "Copyright check failed."
    };
  }

  steps.push({
    stage: "COPYRIGHT",
    status:
      copyrightResult?.status ||
      "UNKNOWN"
  });

  if (
    copyrightResult?.status ===
      "BLOCK"
  ) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "COPYRIGHT",
      topic: cleanTopicValue,
      steps,
      errors: [
        "Copyright protection blocked this item."
      ]
    });
  }

  if (
    copyrightResult?.status ===
      "REVIEW"
  ) {
    warnings.push(
      "Copyright/originality review is required."
    );
  }

  /*
   * STAGE 6
   * Text-to-speech preparation
   */
  const ttsResult =
    createTTSJob({
      text:
        scriptText ||
        cleanTopicValue,
      language,
      voice
    });

  steps.push({
    stage: "TTS",
    status:
      ttsResult?.status ||
      "UNKNOWN"
  });

  /*
   * STAGE 7
   * Visual preparation
   */
  const visualResult =
    createVisualJob({
      prompt:
        `Create original vertical visuals for: ${cleanTopicValue}`,
      provider: visualProvider
    });

  steps.push({
    stage: "VISUAL",
    status:
      visualResult?.status ||
      "UNKNOWN"
  });

  /*
   * STAGE 8
   * Video job preparation
   */
  const videoResult =
    createVideoJob({
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds
    });

  steps.push({
    stage: "VIDEO",
    status:
      videoResult?.status ||
      "UNKNOWN"
  });

  if (!videoResult?.success) {
    errors.push(
      "Video job could not be prepared."
    );
  }

  /*
   * Final decision
   */
  if (errors.length > 0) {
    return createPipelineResult({
      id: pipelineId,
      status: "BLOCKED",
      stage: "FINAL_VALIDATION",
      topic: cleanTopicValue,
      steps,
      errors,
      warnings
    });
  }

  const needsReview =
    safetyResult?.status ===
      "REVIEW" ||
    duplicateResult?.status ===
      "REVIEW" ||
    copyrightResult?.status ===
      "REVIEW" ||
    ttsResult?.status ===
      "PROVIDER_REQUIRED" ||
    visualResult?.status ===
      "READY_FOR_PROVIDER";

  if (needsReview) {
    const approval =
      createCEOApprovalRequest({
        action: "CREATE_YOUTUBE_SHORT",
        reason:
          "Production pipeline requires provider connection or CEO review.",
        payload: {
          pipelineId,
          topic: cleanTopicValue
        }
      });

    return {
      ...createPipelineResult({
        id: pipelineId,
        status: "REVIEW",
        stage: "CEO_APPROVAL",
        topic: cleanTopicValue,
        steps,
        warnings
      }),
      approval
    };
  }

  return createPipelineResult({
    id: pipelineId,
    status: "READY",
    stage: "FINAL_VALIDATION",
    topic: cleanTopicValue,
    steps,
    warnings
  });
}

export function getPipelineStatus() {
  return {
    status: "READY",
    stages: [
      "RESEARCH",
      "SCRIPT",
      "SAFETY",
      "DUPLICATE",
      "COPYRIGHT",
      "TTS",
      "VISUAL",
      "VIDEO",
      "CEO_APPROVAL"
    ],
    message:
      "Short production pipeline is connected and ready for provider integration."
  };
  }
