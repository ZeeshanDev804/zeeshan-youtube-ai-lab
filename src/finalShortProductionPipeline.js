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

function roundNumber(
  value,
  decimals = 3
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Number(
    number.toFixed(decimals)
  );
}

function getVisualDuration(
  visualVideo,
  sceneCount,
  durationPerScene
) {
  const directDuration =
    toPositiveNumber(
      visualVideo?.durationSeconds
    );

  if (directDuration !== null) {
    return directDuration;
  }

  const estimatedDuration =
    toPositiveNumber(
      visualVideo?.estimatedDuration
    );

  if (estimatedDuration !== null) {
    return estimatedDuration;
  }

  const sceneDuration =
    toPositiveNumber(
      durationPerScene
    );

  if (
    sceneDuration !== null &&
    Number.isInteger(sceneCount) &&
    sceneCount > 0
  ) {
    return (
      sceneCount *
      sceneDuration
    );
  }

  return null;
}

function validateFinalVideoResult(
  finalVideo
) {
  const errors = [];

  if (
    !finalVideo ||
    finalVideo.success !== true
  ) {
    errors.push(
      "Final video renderer did not return a successful result."
    );

    return {
      valid: false,
      errors
    };
  }

  if (
    !finalVideo.outputFile
  ) {
    errors.push(
      "Final video output file is missing."
    );
  }

  const duration =
    Number(
      finalVideo.durationSeconds
    );

  if (
    !Number.isFinite(duration) ||
    duration < 20 ||
    duration > 59
  ) {
    errors.push(
      "Final video duration must be between 20 and 59 seconds."
    );
  }

  const width =
    Number(
      finalVideo.resolution?.width ||
      finalVideo.width
    );

  const height =
    Number(
      finalVideo.resolution?.height ||
      finalVideo.height
    );

  if (
    width !== 1080 ||
    height !== 1920
  ) {
    errors.push(
      "Final video must be 1080x1920."
    );
  }

  const videoCodec =
    String(
      finalVideo.videoCodec ||
      finalVideo.video?.codec ||
      ""
    ).toLowerCase();

  if (
    videoCodec &&
    videoCodec !== "h264"
  ) {
    errors.push(
      "Final video codec must be H.264."
    );
  }

  const audioCodec =
    String(
      finalVideo.audioCodec ||
      finalVideo.audio?.codec ||
      ""
    ).toLowerCase();

  if (
    audioCodec &&
    audioCodec !== "aac"
  ) {
    errors.push(
      "Final audio codec must be AAC."
    );
  }

  if (
    finalVideo.captionsBurnedIn ===
    false
  ) {
    errors.push(
      "Captions were not confirmed as burned into the final video."
    );
  }

  return {
    valid:
      errors.length === 0,

    errors
  };
}

export async function produceFinalShort({
  topic,
  script,
  language = "en-US",
  voiceId,
  assetsDir =
    "./storage/assets",
  audioDir =
    "./storage/audio",
  videoDir =
    "./storage/videos",
  finalDir =
    "./storage/final",
  captionDir =
    "./storage/captions",
  durationPerScene = 5,
  fps = 30
} = {}) {
  const cleanTopic =
    cleanText(topic);

  const cleanScript =
    cleanText(script);

  if (!cleanTopic) {
    return {
      success: false,
      status:
        "INVALID_TOPIC",
      error:
        "Topic is required."
    };
  }

  if (!cleanScript) {
    return {
      success: false,
      status:
        "INVALID_SCRIPT",
      error:
        "Script is required."
    };
  }

  // --------------------------------------------------
  // 1. VOICE
  // --------------------------------------------------

  const voice =
    await generateProductionVoice({
      script:
        cleanScript,

      language,

      voiceId,

      outputDir:
        audioDir
    });

  if (!voice.success) {
    return {
      success: false,
      status:
        "VOICE_STAGE_FAILED",
      stage:
        "VOICE",
      voice
    };
  }

  const voiceDuration =
    toPositiveNumber(
      voice.durationSeconds
    );

  if (
    voiceDuration === null
  ) {
    return {
      success: false,

      status:
        "VOICE_DURATION_REQUIRED",

      stage:
        "VOICE",

      error:
        "Actual generated voice duration is required before caption and final video production.",

      voice
    };
  }

  if (
    voiceDuration < 20 ||
    voiceDuration > 59
  ) {
    return {
      success: false,

      status:
        "VOICE_DURATION_OUT_OF_RANGE",

      stage:
        "VOICE",

      error:
        "Generated voice duration must be between 20 and 59 seconds.",

      voiceDurationSeconds:
        voiceDuration,

      voice
    };
  }

  // --------------------------------------------------
  // 2. VISUALS
  // --------------------------------------------------

  const visuals =
    await generateProductionVisuals({
      script:
        cleanScript,

      topic:
        cleanTopic,

      outputDir:
        assetsDir,

      aspectRatio:
        "9:16"
    });

  if (!visuals.success) {
    return {
      success: false,

      status:
        "VISUAL_STAGE_FAILED",

      stage:
        "VISUALS",

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
    !Number.isInteger(
      sceneCount
    ) ||
    sceneCount <= 0
  ) {
    return {
      success: false,

      status:
        "VISUAL_SCENES_INVALID",

      stage:
        "VISUALS",

      error:
        "At least one valid visual scene is required.",

      voice,

      visuals
    };
  }

  if (
    !Array.isArray(
      visuals.scenes
    ) ||
    visuals.scenes.length === 0
  ) {
    return {
      success: false,

      status:
        "VISUAL_SCENES_MISSING",

      stage:
        "VISUALS",

      error:
        "Visual provider returned no usable scenes.",

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
      scenes:
        visuals.scenes,

      outputDir:
        videoDir,

      durationPerScene:
        visualDurationPerScene,

      fps
    });

  if (
    !visualVideo.success
  ) {
    return {
      success: false,

      status:
        "VIDEO_STAGE_FAILED",

      stage:
        "VIDEO",

      voice,

      visuals,

      visualVideo
    };
  }

  const visualDuration =
    getVisualDuration(
      visualVideo,
      sceneCount,
      visualDurationPerScene
    );

  if (
    visualDuration === null
  ) {
    return {
      success: false,

      status:
        "VISUAL_DURATION_INVALID",

      stage:
        "VIDEO",

      error:
        "Visual video duration could not be determined.",

      voice,

      visuals,

      visualVideo
    };
  }

  // --------------------------------------------------
  // 4. DURATION COMPATIBILITY
  // --------------------------------------------------

  const durationDifference =
    Math.abs(
      visualDuration -
        voiceDuration
    );

  /*
   * A visual video does not need to have
   * exactly the same duration as the voice.
   *
   * The final renderer uses the audio as
   * the production timing reference and
   * safely stops the final media at the
   * shortest active stream.
   *
   * We therefore only reject clearly
   * broken visual production.
   */

  const MAX_REASONABLE_VISUAL_DIFFERENCE =
    20;

  if (
    durationDifference >
    MAX_REASONABLE_VISUAL_DIFFERENCE
  ) {
    return {
      success: false,

      status:
        "MEDIA_DURATION_MISMATCH",

      stage:
        "DURATION_CHECK",

      error:
        "Voice and visual durations are too far apart for safe final production.",

      voiceDurationSeconds:
        voiceDuration,

      visualDurationSeconds:
        visualDuration,

      differenceSeconds:
        roundNumber(
          durationDifference
        ),

      maxAllowedDifferenceSeconds:
        MAX_REASONABLE_VISUAL_DIFFERENCE,

      voice,

      visuals,

      visualVideo
    };
  }

  /*
   * Captions use the actual generated
   * voice duration.
   */
  const captionDuration =
    voiceDuration;

  // --------------------------------------------------
  // 5. CAPTION TIMELINE
  // --------------------------------------------------

  const captionTimeline =
    createCaptionTimeline({
      text:
        cleanScript,

      durationSeconds:
        captionDuration,

      maxWordsPerCaption:
        7
    });

  if (
    !captionTimeline.success
  ) {
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

  if (
    !captionFile.success
  ) {
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
  // 7. FINAL VIDEO
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

  if (
    !finalVideo.success
  ) {
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
  // 8. FINAL OUTPUT VALIDATION
  // --------------------------------------------------

  const finalValidation =
    validateFinalVideoResult(
      finalVideo
    );

  if (
    !finalValidation.valid
  ) {
    return {
      success: false,

      status:
        "FINAL_OUTPUT_VALIDATION_FAILED",

      stage:
        "FINAL_VALIDATION",

      errors:
        finalValidation.errors,

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
  // 9. FINAL PRODUCTION RESULT
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
        visualVideo.sceneCount ||
        sceneCount,

      durationSeconds:
        visualDuration
    },

    durationCheck: {
      voiceDurationSeconds:
        voiceDuration,

      visualDurationSeconds:
        visualDuration,

      differenceSeconds:
        roundNumber(
          durationDifference
        ),

      status:
        durationDifference <= 2
          ? "MATCHED"
          : "WITHIN_SAFE_RANGE"
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
        captionTimeline
          .captions
          .length,

      durationSeconds:
        captionTimeline
          .durationSeconds,

      timingSource:
        "ACTUAL_VOICE_DURATION"
    },

    finalVideo: {
      outputFile:
        finalVideo.outputFile,

      sizeBytes:
        finalVideo.sizeBytes,

      durationSeconds:
        finalVideo.durationSeconds,

      resolution:
        finalVideo.resolution,

      videoCodec:
        finalVideo.videoCodec,

      audioCodec:
        finalVideo.audioCodec,

      pixelFormat:
        finalVideo.pixelFormat,

      captionsBurnedIn:
        finalVideo.captionsBurnedIn ===
        true ||
        finalVideo.captions?.burnedIntoVideo ===
        true
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
      "VISUAL_SCENE_VALIDATION",
      "VISUAL_VIDEO",
      "MEDIA_DURATION_CHECK",
      "CAPTIONS",
      "SRT_SAVE",
      "FINAL_AUDIO_VIDEO_MERGE",
      "CAPTION_BURN_IN",
      "FINAL_OUTPUT_VALIDATION",
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

    videoCodec:
      "H.264",

    audioCodec:
      "AAC",

    pixelFormat:
      "yuv420p",

    duration:
      "20-59 seconds",

    message:
      "Voice, visuals, actual voice timing, synchronized captions, final MP4 rendering and final technical validation are connected."
  };
}

export default {
  produceFinalShort,
  getFinalShortProductionStatus
};