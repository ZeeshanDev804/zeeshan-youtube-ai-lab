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
      status: "INVALID_TOPIC",
      error:
        "Topic is required."
    };
  }

  if (!cleanScript) {
    return {
      success: false,
      status: "INVALID_SCRIPT",
      error:
        "Script is required."
    };
  }

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

  const visualVideo =
    await createVisualVideo({
      scenes:
        visuals.scenes,
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

  const finalVideo =
    await buildFinalShort({
      videoFile:
        visualVideo.outputFile,
      audioFile:
        voice.outputFile,
      title:
        cleanTopic,
      outputDir:
        finalDir
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

  return {
    success: true,
    status: "FINAL_SHORT_READY",
    topic:
      cleanTopic,
    voice: {
      outputFile:
        voice.outputFile,
      provider:
        voice.provider
    },
    visuals: {
      sceneCount:
        visuals.sceneCount,
      provider:
        visuals.provider
    },
    visualVideo: {
      outputFile:
        visualVideo.outputFile,
      sceneCount:
        visualVideo.sceneCount
    },
    finalVideo: {
      outputFile:
        finalVideo.outputFile,
      sizeBytes:
        finalVideo.sizeBytes
    },
    nextStage:
      "QUALITY_ASSURANCE",
    createdAt:
      new Date().toISOString()
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
      "FINAL_AUDIO_VIDEO_MERGE"
    ],

    outputFormat:
      "MP4",

    resolution:
      "1080x1920",

    message:
      "Voice and visual assets can be combined into a final YouTube Short."
  };
}
