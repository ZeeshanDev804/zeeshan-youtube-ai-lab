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

function toPositiveNumber(value) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  return number;
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

  if (
    cleanScript.length < 40
  ) {
    errors.push(
      "Script is too short for a production Short."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    topic:
      cleanTopic,

    script:
      cleanScript
  };
}

function createProductionId() {
  return [
    "production",
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2, 8)
  ].join("_");
}

function normalizeLanguage(
  language = "en-US"
) {
  const value =
    cleanText(language);

  return value || "en-US";
}

function normalizeProvider(
  provider = "not_configured"
) {
  const value =
    cleanText(provider);

  return (
    value ||
    "not_configured"
  );
}

function calculateTargetDuration(
  estimatedDuration
) {
  const duration =
    toPositiveNumber(
      estimatedDuration
    );

  if (
    duration === null
  ) {
    return null;
  }

  return Math.max(
    20,
    Math.min(
      59,
      Math.ceil(
        duration
      )
    )
  );
}

function validateVideoConfiguration({
  width,
  height,
  fps,
  durationSeconds
}) {
  const errors = [];

  if (
    width !== 1080
  ) {
    errors.push(
      "Video width must be 1080."
    );
  }

  if (
    height !== 1920
  ) {
    errors.push(
      "Video height must be 1920."
    );
  }

  if (
    !Number.isFinite(
      Number(fps)
    ) ||
    Number(fps) < 24 ||
    Number(fps) > 60
  ) {
    errors.push(
      "Video FPS must be between 24 and 60."
    );
  }

  if (
    !Number.isFinite(
      Number(durationSeconds)
    ) ||
    Number(durationSeconds) < 20 ||
    Number(durationSeconds) > 59
  ) {
    errors.push(
      "Target video duration must be between 20 and 59 seconds."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

export function createShortProductionManifest({
  topic,
  script,
  title = "",
  description = "",
  language = "en-US",
  voice = "default",
  visualProvider =
    "not_configured",
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

  if (
    !validation.valid
  ) {
    return {
      success: false,

      status:
        "INVALID",

      errors:
        validation.errors
    };
  }

  const estimatedDuration =
    toPositiveNumber(
      estimateSpeechDuration(
        validation.script,
        150
      )
    );

  if (
    estimatedDuration === null
  ) {
    return {
      success: false,

      status:
        "DURATION_ESTIMATION_FAILED",

      errors: [
        "Speech duration could not be estimated."
      ]
    };
  }

  const targetDuration =
    calculateTargetDuration(
      estimatedDuration
    );

  if (
    targetDuration === null
  ) {
    return {
      success: false,

      status:
        "TARGET_DURATION_INVALID",

      errors: [
        "Target production duration could not be determined."
      ]
    };
  }

  const videoValidation =
    validateVideoConfiguration({
      width,
      height,
      fps,
      durationSeconds:
        targetDuration
    });

  if (
    !videoValidation.valid
  ) {
    return {
      success: false,

      status:
        "VIDEO_CONFIGURATION_INVALID",

      errors:
        videoValidation.errors
    };
  }

  // --------------------------------------------------
  // VOICE JOB
  // --------------------------------------------------

  const voiceJob =
    createTTSJob({
      text:
        validation.script,

      language:
        normalizeLanguage(
          language
        ),

      voice
    });

  if (
    !voiceJob ||
    voiceJob.success !== true
  ) {
    return {
      success: false,

      status:
        "VOICE_INVALID",

      errors:
        voiceJob?.errors || [
          "Voice job could not be created."
        ]
    };
  }

  // --------------------------------------------------
  // VISUAL PLAN
  // --------------------------------------------------

  const visualPlan =
    createShortVisualPlan({
      topic:
        validation.topic,

      script:
        validation.script,

      totalDurationSeconds:
        targetDuration,

      provider:
        normalizeProvider(
          visualProvider
        ),

      maxScenes
    });

  if (
    !visualPlan ||
    visualPlan.success !== true
  ) {
    return {
      success: false,

      status:
        "VISUAL_PLAN_INVALID",

      errors:
        visualPlan?.errors || [
          "Visual plan could not be created."
        ]
    };
  }

  const sceneCount =
    Number(
      visualPlan.sceneCount ||
      visualPlan.visualJobs?.length ||
      0
    );

  if (
    !Number.isInteger(
      sceneCount
    ) ||
    sceneCount <= 0
  ) {
    return {
      success: false,

      status:
        "VISUAL_SCENE_COUNT_INVALID",

      errors: [
        "Visual plan must contain at least one scene."
      ]
    };
  }

  if (
    sceneCount > Number(maxScenes)
  ) {
    return {
      success: false,

      status:
        "VISUAL_SCENE_LIMIT_EXCEEDED",

      errors: [
        `Visual scene count cannot exceed ${maxScenes}.`
      ]
    };
  }

  // --------------------------------------------------
  // VIDEO JOB
  // --------------------------------------------------

  const videoJob =
    createVideoJob({
      width,

      height,

      fps,

      durationSeconds:
        targetDuration
    });

  if (
    !videoJob ||
    videoJob.success !== true
  ) {
    return {
      success: false,

      status:
        "VIDEO_INVALID",

      errors:
        videoJob?.errors || [
          "Video job could not be created."
        ]
    };
  }

  // --------------------------------------------------
  // PRODUCTION ID
  // --------------------------------------------------

  const productionId =
    createProductionId();

  return {
    success: true,

    status:
      "READY_FOR_PRODUCTION",

    id:
      productionId,

    manifestVersion:
      "2.0",

    metadata: {
      topic:
        validation.topic,

      title:
        cleanText(title),

      description:
        cleanText(description),

      language:
        normalizeLanguage(
          language
        ),

      estimatedDurationSeconds:
        estimatedDuration,

      targetDurationSeconds:
        targetDuration,

      durationSource:
        "ESTIMATED_SCRIPT_DURATION",

      actualVoiceDurationSeconds:
        null,

      actualVisualDurationSeconds:
        null,

      finalVideoDurationSeconds:
        null
    },

    voice: {
      id:
        voiceJob.id,

      status:
        voiceJob.status,

      provider:
        voiceJob.provider,

      outputFile:
        voiceJob.outputFile || null,

      actualDurationSeconds:
        null,

      productionStatus:
        "PLANNED"
    },

    visuals: {
      provider:
        visualPlan.provider,

      sceneCount:
        sceneCount,

      jobs:
        visualPlan.visualJobs || [],

      timeline:
        visualPlan.timeline || [],

      actualDurationSeconds:
        null,

      productionStatus:
        "PLANNED"
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
        videoJob.outputFile || null,

      productionStatus:
        "PLANNED"
    },

    productionOrder: [
      "SCRIPT",
      "VOICE",
      "VOICE_DURATION_VALIDATION",
      "VISUALS",
      "VISUAL_VIDEO",
      "MEDIA_DURATION_CHECK",
      "CAPTIONS",
      "FINAL_RENDER",
      "FINAL_OUTPUT_VALIDATION",
      "QUALITY_ASSURANCE",
      "UPLOAD_GUARD",
      "CEO_PUBLISH_GATE",
      "YOUTUBE"
    ],

    safetyPolicy: {
      actualMediaRequired:
        true,

      actualVoiceDurationRequired:
        true,

      actualFinalVideoValidationRequired:
        true,

      qaRequired:
        true,

      uploadGuardRequired:
        true,

      publishGateRequired:
        true
    },

    createdAt:
      new Date().toISOString()
  };
}

export function validateProductionManifest(
  manifest
) {
  if (
    !manifest ||
    typeof manifest !==
      "object"
  ) {
    return {
      valid: false,

      errors: [
        "Production manifest is required."
      ]
    };
  }

  const errors = [];

  if (
    !cleanText(
      manifest.id
    )
  ) {
    errors.push(
      "Production ID is missing."
    );
  }

  if (
    !cleanText(
      manifest.metadata?.topic
    )
  ) {
    errors.push(
      "Production topic is missing."
    );
  }

  if (
    !manifest.voice ||
    typeof manifest.voice !==
      "object"
  ) {
    errors.push(
      "Voice section is missing."
    );
  }

  if (
    !manifest.visuals ||
    typeof manifest.visuals !==
      "object"
  ) {
    errors.push(
      "Visual section is missing."
    );
  }

  if (
    !manifest.video ||
    typeof manifest.video !==
      "object"
  ) {
    errors.push(
      "Video section is missing."
    );
  }

  if (
    !Array.isArray(
      manifest.productionOrder
    ) ||
    manifest.productionOrder
      .length === 0
  ) {
    errors.push(
      "Production order is missing."
    );
  }

  const width =
    Number(
      manifest.video?.width
    );

  const height =
    Number(
      manifest.video?.height
    );

  if (
    Number.isFinite(width) &&
    width !== 1080
  ) {
    errors.push(
      "Manifest video width must be 1080."
    );
  }

  if (
    Number.isFinite(height) &&
    height !== 1920
  ) {
    errors.push(
      "Manifest video height must be 1920."
    );
  }

  const duration =
    Number(
      manifest.video?.durationSeconds
    );

  if (
    Number.isFinite(duration) &&
    (
      duration < 20 ||
      duration > 59
    )
  ) {
    errors.push(
      "Manifest video duration must be between 20 and 59 seconds."
    );
  }

  if (
    !Array.isArray(
      manifest.visuals?.jobs
    )
  ) {
    errors.push(
      "Visual jobs are missing."
    );
  }

  if (
    manifest.safetyPolicy
      ?.qaRequired !== true
  ) {
    errors.push(
      "QA requirement is missing."
    );
  }

  if (
    manifest.safetyPolicy
      ?.uploadGuardRequired !== true
  ) {
    errors.push(
      "Upload Guard requirement is missing."
    );
  }

  if (
    manifest.safetyPolicy
      ?.publishGateRequired !== true
  ) {
    errors.push(
      "Publish Gate requirement is missing."
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

    status:
      "READY",

    manifestVersion:
      "2.0",

    pipeline: [
      "SCRIPT",
      "VOICE",
      "VOICE_DURATION_VALIDATION",
      "VISUALS",
      "VISUAL_VIDEO",
      "MEDIA_DURATION_CHECK",
      "CAPTIONS",
      "FINAL_RENDER",
      "FINAL_OUTPUT_VALIDATION",
      "QUALITY_ASSURANCE",
      "UPLOAD_GUARD",
      "CEO_PUBLISH_GATE",
      "YOUTUBE"
    ],

    planningVsProduction:
      "Manifest estimates duration for planning; actual generated media duration is authoritative.",

    validation: [
      "production ID",
      "topic",
      "script",
      "voice job",
      "visual plan",
      "scene count",
      "video configuration",
      "1080x1920 resolution",
      "24-60 FPS",
      "20-59 second target duration",
      "QA requirement",
      "Upload Guard requirement",
      "Publish Gate requirement"
    ],

    message:
      "Short Production Manifest creates a validated production plan while keeping actual generated media duration authoritative."
  };
}

export default {
  createShortProductionManifest,

  validateProductionManifest,

  getShortProductionStatus
};