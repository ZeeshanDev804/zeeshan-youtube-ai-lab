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

  const voice = await generateProductionVoice({
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

  // --------------------------------------------------
  // 2. VISUALS
  // --------------------------------------------------

  const visuals = await generateProductionVisuals({
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

  // --------------------------------------------------
  // 3. VISUAL VIDEO
  // --------------------------------------------------

  const visualVideo = await createVisualVideo({
    scenes: visuals.scenes,
    outputDir: videoDir,
    durationPerScene,
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

  // --------------------------------------------------
  // 4. FINAL AUDIO + VIDEO MERGE
  // --------------------------------------------------

  const finalVideo = await buildFinalShort({
    videoFile: visualVideo.outputFile,
    audioFile: voice.outputFile,
    title: cleanTopic,
    outputDir: finalDir
  });

  if (!finalVideo.success) {
    return {
      success: false,
      status: "FINAL_RENDER_FAILED",
      stage: "FINAL_RENDER",
      voice,
      visuals,
      visualVideo,
      finalVideo
    };
  }

  // --------------------------------------------------
  // 5. CAPTION GENERATION
  // --------------------------------------------------

  const estimatedDuration =
    Math.max(
      1,
      Number(visualVideo.sceneCount || visuals.sceneCount || 1) *
        Number(durationPerScene || 5)
    );

  const captionTimeline = createCaptionTimeline({
    text: cleanScript,
    durationSeconds: estimatedDuration,
    maxWordsPerCaption: 7
  });

  if (!captionTimeline.success) {
    return {
      success: false,
      status: "CAPTION_STAGE_FAILED",
      stage: "CAPTIONS",
      voice,
      visuals,
      visualVideo,
      finalVideo,
      captions: captionTimeline
    };
  }

  // --------------------------------------------------
  // 6. SAVE SRT CAPTION FILE
  // --------------------------------------------------

  const captionFile = await saveSRT(
    captionTimeline.captions,
    captionDir,
    `${finalVideo.id || `caption_${Date.now()}`}.srt`
  );

  if (!captionFile.success) {
    return {
      success: false,
      status: "CAPTION_SAVE_FAILED",
      stage: "CAPTIONS",
      voice,
      visuals,
      visualVideo,
      finalVideo,
      captions: captionTimeline,
      captionFile
    };
  }

  // --------------------------------------------------
  // 7. FINAL PRODUCTION RESULT
  // --------------------------------------------------

  return {
    success: true,
    status: "FINAL_SHORT_READY",
    topic: cleanTopic,

    voice: {
      outputFile: voice.outputFile,
      provider: voice.provider
    },

    visuals: {
      sceneCount: visuals.sceneCount,
      provider: visuals.provider
    },

    visualVideo: {
      outputFile: visualVideo.outputFile,
      sceneCount: visualVideo.sceneCount
    },

    finalVideo: {
      outputFile: finalVideo.outputFile,
      sizeBytes: finalVideo.sizeBytes
    },

    captions: {
      status: "READY",
      format: "SRT",
      outputFile: captionFile.outputFile,
      sizeBytes: captionFile.sizeBytes,
      segmentCount: captionTimeline.captions.length,
      durationSeconds: captionTimeline.durationSeconds
    },

    nextStage: "QUALITY_ASSURANCE",

    createdAt: new Date().toISOString()
  };
}

export function getFinalShortProductionStatus() {
  return {
    configured: true,
    status: "READY",

    stages: [
      "VOICE",
      "VISUALS",
      "VISUAL_VIDEO",
      "FINAL_AUDIO_VIDEO_MERGE",
      "CAPTIONS"
    ],

    outputFormat: "MP4",
    captionFormat: "SRT",
    resolution: "1080x1920",

    message:
      "Voice, visual assets, final MP4 and SRT captions can be generated for a YouTube Short."
  };
}