import {
  generateProductionVoice
} from "./voiceProductionPipeline.js";

import {
  generateProductionVisuals
} from "./visualProductionPipeline.js";

import {
  createVisualVideo
} from "./visualVideoPipeline.js";

import {
  buildFinalShort
} from "./shortProductionController.js";

import {
  createCaptionTimeline,
  saveSRT
} from "./captionEngine.js";

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

export async function produceFinalShort({
  topic,
  script,
  language = "en-US",
  voiceId,
  assetsDir = "./storage/assets",
  audioDir = "./storage/audio",
  videoDir = "./storage/videos",
  finalDir = "./storage/final",
  captionDir = "./storage/captions",
  durationPerScene = 5,
  fps = 30
} = {}) {
  const cleanTopic = cleanText(topic);
  const cleanScript = cleanText(script);

  if (!cleanTopic) {
    return {
      success: false,
      status: "INVALID_TOPIC",
      error: "Topic is required."
    };
  }

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID_SCRIPT",
      error: "Script is required."
    };
  }

  // --------------------------------------------------
  // 1. VOICE
  // --------------------------------------------------

  const voice =
    await generateProductionVoice({
      script: cleanScript,
      language,
      voiceId,
      outputDir: audioDir
    });

  if (!voice.success) {
    return {
      success: false,
      status: "VOICE_STAGE_FAILED",
      stage: "VOICE",
      voice
    };
  }

  const voiceDuration =
    toPositiveNumber(
      voice.durationSeconds
    );

  if (voiceDuration === null) {
    return {
      success: false,
      status: "VOICE_DURATION_REQUIRED",
      stage: "VOICE",
      error:
        "Actual generated voice duration is required before caption and final video production.",
      voice
    };
  }

  // --------------------------------------------------
  // 2. VISUALS
  // --------------------------------------------------

  const visuals =
    await generateProductionVisuals({
      script: cleanScript,
      topic: cleanTopic,
      outputDir: assetsDir,
      aspectRatio: "9:16"
    });

  if (!visuals.success) {
    return {
      success: false,
      status: "VISUAL_STAGE_FAILED",
      stage: "VISUALS",
      voice,
      visuals
    };
  }

  const sceneCount =
    Number(
      visuals.sceneCount ||
      visuals.scenes?.length ||
      0
    );

  if (
    !Number.isInteger(sceneCount) ||
    sceneCount <= 0
  ) {
    return {
      success: false,
      status: "VISUAL_SCENES_INVALID",
      stage: "VISUALS",
      error:
        "At least one valid visual scene is required.",
      voice,
      visuals
    };
  }

  // --------------------------------------------------
  // 3. VISUAL VIDEO
  // --------------------------------------------------

  const visualDurationPerScene =
    toPositiveNumber(
      durationPerScene
    ) || 5;

  const visualVideo =
    await createVisualVideo({
      scenes: visuals.scenes,
      outputDir: videoDir,
      durationPerScene:
        visualDurationPerScene,
      fps
    });

  if (!visualVideo.success) {
    return {
      success: false,
      status: "VIDEO_STAGE_FAILED",
      stage: "VIDEO",
      voice,
      visuals,
      visualVideo
    };
  }

  const visualDuration =
    toPositiveNumber(
      visualVideo.estimatedDuration
    ) ||
    sceneCount *
      visualDurationPerScene;

  if (visualDuration === null) {
    return {
      success: false,
      status: "VISUAL_DURATION_INVALID",
      stage: "VIDEO",
      error:
        "Visual video duration could not be determined.",
      voice,
      visuals,
      visualVideo
    };
  }

  // --------------------------------------------------
  // 4. DURATION COMPATIBILITY CHECK
  // --------------------------------------------------

  const durationDifference =
    Math.abs(
      visualDuration -
      voiceDuration
    );

  /*
   * A small difference is acceptable because
   * FFmpeg can handle minor timing differences.
   *
   * A large mismatch should stop production
   * rather than silently producing bad sync.
   */
  const maxAllowedDifference =
    2;

  if (
    durationDifference >
    maxAllowedDifference
  ) {
    return {
      success: false,
      status:
        "MEDIA_DURATION_MISMATCH",
      stage:
        "DURATION_CHECK",
      error:
        "Voice and visual video durations are too far apart.",
      voiceDurationSeconds:
        voiceDuration,
      visualDurationSeconds:
        visualDuration,
      differenceSeconds:
        Number(
          durationDifference.toFixed(3)
        ),
      maxAllowedDifferenceSeconds:
        maxAllowedDifference,
      voice,
      visuals,
      visualVideo
    };
  }

  /*
   * Captions follow the actual voice duration.
   * This is the important fix.
   */
  const captionDuration =
    voiceDuration;

  // --------------------------------------------------
  // 5. CAPTION TIMELINE
  // --------------------------------------------------

  const captionTimeline =
    createCaptionTimeline({
      text: cleanScript,
      durationSeconds:
        captionDuration,
      maxWordsPerCaption: 7
    });

  if (!captionTimeline.success) {
    return {
      success: false,
      status:
        "CAPTION_STAGE_FAILED",
      stage:
        "CAPTIONS",
      voice,
      visuals,
      visualVideo,
      captions:
        captionTimeline
    };
  }

  // --------------------------------------------------
  // 6. SAVE SRT
  // --------------------------------------------------

  const captionFile =
    await saveSRT(
      captionTimeline.captions,
      captionDir,
      `caption_${Date.now()}.srt`
    );

  if (!captionFile.success) {
    return {
      success: false,
      status:
        "CAPTION_SAVE_FAILED",
      stage:
        "CAPTIONS",
      voice,
      visuals,
      visualVideo,
      captions:
        captionTimeline,
      captionFile
    };
  }

  // --------------------------------------------------
  // 7. FINAL VIDEO + AUDIO + BURNED-IN CAPTIONS
  // --------------------------------------------------

  const finalVideo =
    await buildFinalShort({
      videoFile:
        visualVideo.outputFile,

      audioFile:
        voice.outputFile,

      captionFile:
        captionFile.outputFile,

      title:
        cleanTopic,

      outputDir:
        finalDir
    });

  if (!finalVideo.success) {
    return {
      success: false,
      status:
        "FINAL_RENDER_FAILED",
      stage:
        "FINAL_RENDER",
      voice,
      visuals,
      visualVideo,
      captions:
        captionTimeline,
      captionFile,
      finalVideo
    };
  }

  // --------------------------------------------------
  // 8. FINAL PRODUCTION RESULT
  // --------------------------------------------------

  return {
    success: true,
    status:
      "FINAL_SHORT_READY",

    topic:
      cleanTopic,

    voice: {
      outputFile:
        voice.outputFile,

      provider:
        voice.provider,

      durationSeconds:
        voiceDuration,

      sizeBytes:
        voice.sizeBytes,

      format:
        voice.format
    },

    visuals: {
      sceneCount:
        sceneCount,

      provider:
        visuals.provider
    },

    visualVideo: {
      outputFile:
        visualVideo.outputFile,

      sceneCount:
        visualVideo.sceneCount,

      durationSeconds:
        visualDuration
    },

    durationCheck: {
      voiceDurationSeconds:
        voiceDuration,

      visualDurationSeconds:
        visualDuration,

      differenceSeconds:
        Number(
          durationDifference.toFixed(3)
        ),

      status:
        "WITHIN_ALLOWED_RANGE"
    },

    captions: {
      status:
        "BURNED_IN",

      format:
        "SRT",

      outputFile:
        captionFile.outputFile,

      sizeBytes:
        captionFile.sizeBytes,

      segmentCount:
        captionTimeline.captions.length,

      durationSeconds:
        captionTimeline.durationSeconds,

      timingSource:
        "ACTUAL_VOICE_DURATION"
    },

    finalVideo: {
      outputFile:
        finalVideo.outputFile,

      sizeBytes:
        finalVideo.sizeBytes,

      captionsBurnedIn:
        finalVideo.captions?.burnedIntoVideo === true
    },

    nextStage:
      "QUALITY_ASSURANCE",

    createdAt:
      new Date().toISOString()
  };
}

export function getFinalShortProductionStatus() {
  return {
    configured:
      true,

    status:
      "READY",

    stages: [
      "VOICE",
      "VOICE_DURATION_VALIDATION",
      "VISUALS",
      "VISUAL_VIDEO",
      "MEDIA_DURATION_CHECK",
      "CAPTIONS",
      "SRT_SAVE",
      "FINAL_AUDIO_VIDEO_MERGE",
      "CAPTION_BURN_IN",
      "QUALITY_ASSURANCE"
    ],

    outputFormat:
      "MP4",

    captionFormat:
      "SRT",

    captionMode:
      "BURNED_IN",

    captionTiming:
      "ACTUAL_VOICE_DURATION",

    resolution:
      "1080x1920",

    message:
      "Voice, visuals, actual audio timing, synchronized SRT captions and burned-in final YouTube Short MP4 are connected."
  };
}

export default {
  produceFinalShort,
  getFinalShortProductionStatus
};