import {
  createTTSJob,
  estimateSpeechDuration
} from "./ttsProvider.js";

import {
  createShortVisualPlan
} from "./shortVisualPlanner.js";

import {
  createVideoJob
} from "./videoEngine.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function validateInput({
  topic,
  script
} = {}) {
  const errors = [];

  const cleanTopic =
    cleanText(topic);

  const cleanScript =
    cleanText(script);

  if (!cleanTopic) {
    errors.push(
      "Topic is required."
    );
  }

  if (!cleanScript) {
    errors.push(
      "Script is required."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    topic: cleanTopic,
    script: cleanScript
  };
}

function createProductionId() {
  return `production_${Date.now()}`;
}

export function createShortProductionManifest({
  topic,
  script,
  title = "",
  description = "",
  language = "en-US",
  voice = "default",
  visualProvider = "not_configured",
  width = 1080,
  height = 1920,
  fps = 30,
  maxScenes = 6
} = {}) {
  const validation =
    validateInput({
      topic,
      script
    });

  if (!validation.valid) {
    return {
      success: false,
      status: "INVALID",
      errors: validation.errors
    };
  }

  const estimatedDuration =
    estimateSpeechDuration(
      validation.script,
      150
    );

  const durationSeconds =
    Math.max(
      20,
      Math.min(
        59,
        Math.ceil(
          estimatedDuration
        )
      )
    );

  const voiceJob =
    createTTSJob({
      text:
        validation.script,
      language,
      voice
    });

  if (!voiceJob.success) {
    return {
      success: false,
      status: "VOICE_INVALID",
      errors:
        voiceJob.errors || [
          "Voice job could not be created."
        ]
    };
  }

  const visualPlan =
    createShortVisualPlan({
      topic:
        validation.topic,
      script:
        validation.script,
      totalDurationSeconds:
        durationSeconds,
      provider:
        visualProvider,
      maxScenes
    });

  if (!visualPlan.success) {
    return {
      success: false,
      status: "VISUAL_PLAN_INVALID",
      errors:
        visualPlan.errors || [
          "Visual plan could not be created."
        ]
    };
  }

  const videoJob =
    createVideoJob({
      width,
      height,
      fps,
      durationSeconds
    });

  if (!videoJob.success) {
    return {
      success: false,
      status: "VIDEO_INVALID",
      errors:
        videoJob.errors || [
          "Video job could not be created."
        ]
    };
  }

  const productionId =
    createProductionId();

  return {
    success: true,
    status: "READY_FOR_PRODUCTION",
    id: productionId,

    metadata: {
      topic:
        validation.topic,
      title:
        cleanText(title),
      description:
        cleanText(description),
      language,
      estimatedDurationSeconds:
        estimatedDuration,
      targetDurationSeconds:
        durationSeconds
    },

    voice: {
      id:
        voiceJob.id,
      status:
        voiceJob.status,
      provider:
        voiceJob.provider,
      outputFile:
        voiceJob.outputFile
    },

    visuals: {
      provider:
        visualPlan.provider,
      sceneCount:
        visualPlan.sceneCount,
      jobs:
        visualPlan.visualJobs,
      timeline:
        visualPlan.timeline
    },

    video: {
      id:
        videoJob.id,
      status:
        videoJob.status,
      width:
        videoJob.width,
      height:
        videoJob.height,
      fps:
        videoJob.fps,
      durationSeconds:
        videoJob.durationSeconds,
      outputFile:
        videoJob.outputFile
    },

    productionOrder: [
      "SCRIPT",
      "VOICE",
      "VISUALS",
      "VIDEO_RENDER",
      "QUALITY_CHECK",
      "PUBLISH"
    ],

    createdAt:
      new Date().toISOString()
  };
}

export function validateProductionManifest(
  manifest
) {
  if (
    !manifest ||
    typeof manifest !== "object"
  ) {
    return {
      valid: false,
      errors: [
        "Production manifest is required."
      ]
    };
  }

  const errors = [];

  if (!manifest.id) {
    errors.push(
      "Production ID is missing."
    );
  }

  if (
    !manifest.metadata?.topic
  ) {
    errors.push(
      "Production topic is missing."
    );
  }

  if (
    !manifest.voice
  ) {
    errors.push(
      "Voice section is missing."
    );
  }

  if (
    !manifest.visuals
  ) {
    errors.push(
      "Visual section is missing."
    );
  }

  if (
    !manifest.video
  ) {
    errors.push(
      "Video section is missing."
    );
  }

  if (
    !Array.isArray(
      manifest.productionOrder
    )
  ) {
    errors.push(
      "Production order is missing."
    );
  }

  return {
    valid:
      errors.length === 0,
    errors
  };
}

export function getShortProductionStatus() {
  return {
    configured: true,
    status: "READY",
    pipeline: [
      "SCRIPT",
      "VOICE",
      "VISUALS",
      "VIDEO_RENDER",
      "QUALITY_CHECK",
      "PUBLISH"
    ],
    message:
      "Short production manifest is ready to coordinate the production pipeline."
  };
}
