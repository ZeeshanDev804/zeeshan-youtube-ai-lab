import {
  createShortVisualPlan
} from "./shortVisualPlanner.js";

import {
  generateVisualScenes
} from "./visualGenerationPipeline.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateProductionVisuals({
  script,
  topic,
  outputDir = "./storage/assets",
  aspectRatio = "9:16"
} = {}) {
  const cleanScript =
    cleanText(script);

  const cleanTopic =
    cleanText(topic);

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID_SCRIPT",
      error: "Script is required."
    };
  }

  if (!cleanTopic) {
    return {
      success: false,
      status: "INVALID_TOPIC",
      error: "Topic is required."
    };
  }

  const plan =
    createShortVisualPlan({
      script: cleanScript,
      topic: cleanTopic
    });

  if (!plan.success) {
    return {
      success: false,
      status: "VISUAL_PLAN_FAILED",
      errors:
        plan.errors || [
          "Visual plan could not be created."
        ]
    };
  }

  if (
    !Array.isArray(plan.scenes) ||
    plan.scenes.length === 0
  ) {
    return {
      success: false,
      status: "NO_VISUAL_SCENES",
      error:
        "No visual scenes were created."
    };
  }

  const generation =
    await generateVisualScenes({
      scenes: plan.scenes,
      outputDir,
      aspectRatio
    });

  if (!generation.success) {
    return {
      success: false,
      status: "VISUAL_GENERATION_FAILED",
      plan,
      generation
    };
  }

  return {
    success: true,
    status: "VISUALS_READY",
    topic: cleanTopic,
    sceneCount:
      generation.scenes?.length ||
      plan.scenes.length,
    scenes:
      generation.scenes || [],
    timeline:
      plan.timeline || [],
    provider:
      "Google Gemini",
    createdAt:
      new Date().toISOString()
  };
}

export function getVisualProductionStatus() {
  return {
    configured:
      Boolean(
        process.env.AI_API_KEY
      ),
    provider:
      "Google Gemini",
    model:
      process.env.IMAGE_MODEL ||
      "gemini-3.1-flash-image",
    aspectRatio:
      "9:16",
    status:
      process.env.AI_API_KEY
        ? "CONFIGURED"
        : "NOT_CONFIGURED",
    message:
      "Visual production pipeline is ready for Gemini image generation."
  };
}
