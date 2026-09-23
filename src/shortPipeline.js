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

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function createPipelineId() {
  return `short_pipeline_${Date.now()}`;
}

function getResearchSources(researchResult) {
  if (
    Array.isArray(researchResult?.result?.sources)
  ) {
    return researchResult.result.sources;
  }

  if (
    Array.isArray(researchResult?.sources)
  ) {
    return researchResult.sources;
  }

  return [];
}

function getResearchStatus(researchResult) {
  return (
    researchResult?.result?.status ||
    researchResult?.status ||
    "UNKNOWN"
  );
}

function getResearchConfidence(researchResult) {
  return Number(
    researchResult?.result?.confidence || 0
  );
}

function buildVisualPrompt({
  title,
  script,
  category
} = {}) {
  return [
    "Create original vertical YouTube Shorts visuals.",
    `Topic: ${cleanText(title)}`,
    `Category: ${cleanText(category || "general")}`,
    "Use original or properly licensed visual assets.",
    "Do not copy another creator's video style frame-for-frame.",
    "Do not use copyrighted footage without permission.",
    "Visual direction:",
    cleanText(script).slice(0, 900)
  ].join("\n");
}

function buildPipelineFailure({
  pipelineId,
  stage,
  reason,
  details = null
}) {
  return {
    success: false,
    status: "BLOCKED",
    pipelineId,
    stage,
    reason,
    details,
    createdAt: new Date().toISOString()
  };
}

export async function buildShortPipeline({
  topic,
  existingContent = [],
  language = "en-US",
  voice = "default",
  visualProvider = "not_configured",
  durationSeconds = 35,
  requireCEOApproval = true
} = {}) {
  const pipelineId = createPipelineId();

  /*
   * ---------------------------------------------------------
   * 1. INPUT VALIDATION
   * ---------------------------------------------------------
   */

  if (!topic || typeof topic !== "object") {
    return buildPipelineFailure({
      pipelineId,
      stage: "INPUT",
      reason: "A topic object is required."
    });
  }

  const title = cleanText(topic.title);

  if (title.length < 5) {
    return buildPipelineFailure({
      pipelineId,
      stage: "INPUT",
      reason: "Topic title must contain at least 5 characters."
    });
  }

  /*
   * ---------------------------------------------------------
   * 2. RESEARCH
   * ---------------------------------------------------------
   */

  let researchResult;

  try {
    researchResult = await researchTopic(topic);
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "RESEARCH",
      reason: "Research stage failed.",
      details: error.message
    });
  }

  const researchStatus =
    getResearchStatus(researchResult);

  const researchSources =
    getResearchSources(researchResult);

  const researchConfidence =
    getResearchConfidence(researchResult);

  /*
   * Never pretend that missing research is verified.
   */

  if (
    researchStatus ===
      "INSUFFICIENT_RESEARCH" ||
    researchStatus ===
      "READY_FOR_RESEARCH_PROVIDER"
  ) {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      pipelineId,
      stage: "RESEARCH",
      reason:
        "Live research verification is not available yet.",
      research: researchResult,
      researchConfidence,
      sourceCount: researchSources.length,
      nextAction:
        "Connect a real research/search provider before factual auto-publishing.",
      createdAt: new Date().toISOString()
    };
  }

  /*
   * ---------------------------------------------------------
   * 3. SCRIPT PLACEHOLDER
   * ---------------------------------------------------------
   *
   * The production script engine can generate the real
   * Gemini script separately. This legacy pipeline keeps
   * a safe placeholder contract instead of inventing text.
   */

  let scriptJob;

  try {
    scriptJob = createScriptPlaceholder(topic);
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "SCRIPT",
      reason: "Script request could not be created.",
      details: error.message
    });
  }

  if (!scriptJob?.request) {
    return buildPipelineFailure({
      pipelineId,
      stage: "SCRIPT",
      reason: "Script request is invalid."
    });
  }

  /*
   * If an actual script is supplied by an upstream production
   * controller, use it. Otherwise this legacy pipeline stops
   * safely instead of creating fake narration.
   */

  const suppliedScript =
    cleanText(
      topic.script ||
      topic.generatedScript ||
      ""
    );

  if (!suppliedScript) {
    return {
      success: false,
      status: "REVIEW_REQUIRED",
      pipelineId,
      stage: "SCRIPT",
      reason:
        "No generated script was supplied to this legacy pipeline.",
      scriptJob,
      nextAction:
        "Use the production script engine to generate and validate the real script.",
      createdAt: new Date().toISOString()
    };
  }

  const scriptTitle =
    cleanText(
      topic.generatedTitle ||
      topic.title
    );

  const description =
    cleanText(
      topic.description || ""
    );

  /*
   * ---------------------------------------------------------
   * 4. SAFETY
   * ---------------------------------------------------------
   */

  let safetyResult;

  try {
    safetyResult = evaluateSafety({
      title: scriptTitle,
      script: suppliedScript,
      description,
      research: researchResult
    });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "SAFETY",
      reason: "Safety evaluation failed.",
      details: error.message
    });
  }

  if (
    safetyResult?.action === "BLOCK" ||
    safetyResult?.level === "HIGH"
  ) {
    return buildPipelineFailure({
      pipelineId,
      stage: "SAFETY",
      reason:
        safetyResult?.reason ||
        "Safety guard blocked this content.",
      details: safetyResult
    });
  }

  /*
   * ---------------------------------------------------------
   * 5. COPYRIGHT
   * ---------------------------------------------------------
   */

  let copyrightResult;

  try {
    copyrightResult = checkCopyright({
      title: scriptTitle,
      script: suppliedScript,
      sources: researchSources,
      metadata: {
        category:
          topic.category || "general",
        region:
          topic.region || null
      }
    });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "COPYRIGHT",
      reason: "Copyright safety check failed.",
      details: error.message
    });
  }

  if (
    copyrightResult?.status === "BLOCK"
  ) {
    return buildPipelineFailure({
      pipelineId,
      stage: "COPYRIGHT",
      reason:
        copyrightResult?.reason ||
        "Copyright guard blocked the content.",
      details: copyrightResult
    });
  }

  /*
   * REVIEW is not treated as PASS.
   */

  const copyrightNeedsReview =
    copyrightResult?.status === "REVIEW";

  /*
   * ---------------------------------------------------------
   * 6. DUPLICATE CHECK
   * ---------------------------------------------------------
   */

  let duplicateResult;

  try {
    duplicateResult =
      checkDuplicateContent({
        title: scriptTitle,
        script: suppliedScript,
        existingContent
      });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "DUPLICATE",
      reason: "Duplicate check failed.",
      details: error.message
    });
  }

  if (
    duplicateResult?.status === "BLOCK"
  ) {
    return buildPipelineFailure({
      pipelineId,
      stage: "DUPLICATE",
      reason:
        duplicateResult?.reason ||
        "Duplicate content detected.",
      details: duplicateResult
    });
  }

  const duplicateNeedsReview =
    duplicateResult?.status === "REVIEW";

  /*
   * ---------------------------------------------------------
   * 7. VOICE JOB
   * ---------------------------------------------------------
   */

  let voiceJob;

  try {
    voiceJob = createTTSJob({
      text: suppliedScript,
      language,
      voice
    });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VOICE",
      reason: "Voice job creation failed.",
      details: error.message
    });
  }

  if (!voiceJob?.success) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VOICE",
      reason:
        voiceJob?.errors?.join(" ") ||
        "Voice job is invalid.",
      details: voiceJob
    });
  }

  /*
   * ---------------------------------------------------------
   * 8. VISUAL JOB
   * ---------------------------------------------------------
   */

  let visualJob;

  try {
    visualJob = createVisualJob({
      prompt: buildVisualPrompt({
        title: scriptTitle,
        script: suppliedScript,
        category:
          topic.category || "general"
      }),
      provider: visualProvider
    });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VISUAL",
      reason: "Visual job creation failed.",
      details: error.message
    });
  }

  if (!visualJob?.success) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VISUAL",
      reason:
        visualJob?.errors?.join(" ") ||
        "Visual job is invalid.",
      details: visualJob
    });
  }

  /*
   * ---------------------------------------------------------
   * 9. VIDEO JOB
   * ---------------------------------------------------------
   */

  let videoJob;

  try {
    videoJob = createVideoJob({
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds,
      format: ".mp4"
    });
  } catch (error) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VIDEO",
      reason: "Video job creation failed.",
      details: error.message
    });
  }

  if (!videoJob?.success) {
    return buildPipelineFailure({
      pipelineId,
      stage: "VIDEO",
      reason:
        videoJob?.errors?.join(" ") ||
        "Video job is invalid.",
      details: videoJob
    });
  }

  /*
   * ---------------------------------------------------------
   * 10. CEO APPROVAL
   * ---------------------------------------------------------
   */

  const reviewReasons = [];

  if (
    safetyResult?.action === "REVIEW" ||
    safetyResult?.level === "MEDIUM"
  ) {
    reviewReasons.push(
      "Safety review required."
    );
  }

  if (copyrightNeedsReview) {
    reviewReasons.push(
      "Copyright review required."
    );
  }

  if (duplicateNeedsReview) {
    reviewReasons.push(
      "Duplicate-content review required."
    );
  }

  if (researchConfidence < 70) {
    reviewReasons.push(
      "Research confidence is below the production threshold."
    );
  }

  if (requireCEOApproval) {
    reviewReasons.push(
      "CEO approval is required by pipeline configuration."
    );
  }

  let approvalRequest = null;

  if (reviewReasons.length > 0) {
    approvalRequest =
      createCEOApprovalRequest({
        pipelineId,
        title: scriptTitle,
        reasons: reviewReasons,
        safety: safetyResult,
        copyright: copyrightResult,
        duplicate: duplicateResult,
        research: researchResult,
        voiceJob,
        visualJob,
        videoJob
      });
  }

  /*
   * ---------------------------------------------------------
   * 11. FINAL PIPELINE RESULT
   * ---------------------------------------------------------
   */

  const status =
    approvalRequest
      ? "CEO_REVIEW_REQUIRED"
      : "READY_FOR_NEXT_STAGE";

  return {
    success: true,
    status,
    pipelineId,

    topic: {
      title: scriptTitle,
      category:
        topic.category || "general",
      region:
        topic.region || null
    },

    research: {
      status: researchStatus,
      confidence: researchConfidence,
      sourceCount: researchSources.length
    },

    script: {
      title: scriptTitle,
      text: suppliedScript,
      description
    },

    safety: safetyResult,

    copyright: copyrightResult,

    duplicate: duplicateResult,

    jobs: {
      voice: voiceJob,
      visual: visualJob,
      video: videoJob
    },

    approvalRequest,

    nextStage:
      approvalRequest
        ? "CEO_APPROVAL"
        : "PRODUCTION_QA",

    createdAt: new Date().toISOString()
  };
}

export function getShortPipelineStatus() {
  return {
    configured: true,
    status: "READY",
    pipeline:
      "TOPIC → RESEARCH → SCRIPT → SAFETY → COPYRIGHT → DUPLICATE → VOICE → VISUAL → VIDEO → CEO",
    safetyFirst: true,
    fakeOutputGeneration: false,
    requiresRealResearchForVerifiedPublishing: true,
    requiresRealProvidersForProduction: true
  };
}