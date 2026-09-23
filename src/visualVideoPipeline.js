import fs from "node:fs/promises";
import path from "node:path";

import {
  renderImageSequenceToVideo
} from "./imageVideoRenderer.js";

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

async function validateVisualFiles(scenes = []) {
  const errors = [];

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return {
      valid: false,
      errors: [
        "At least one visual scene is required."
      ]
    };
  }

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];

    const imageFile =
      cleanText(
        scene?.imageFile ||
        scene?.outputFile ||
        scene?.filePath ||
        ""
      );

    if (!imageFile) {
      errors.push(
        `Scene ${index + 1} has no image file.`
      );
      continue;
    }

    try {
      const stats =
        await fs.stat(imageFile);

      if (!stats.isFile()) {
        errors.push(
          `Scene ${index + 1} image is not a file.`
        );
      } else if (stats.size === 0) {
        errors.push(
          `Scene ${index + 1} image is empty.`
        );
      }
    } catch {
      errors.push(
        `Scene ${index + 1} image does not exist.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function createVisualVideo({
  scenes = [],
  outputDir = "./storage/videos",
  durationPerScene = 5,
  fps = 30
} = {}) {
  const validation =
    await validateVisualFiles(
      scenes
    );

  if (!validation.valid) {
    return {
      success: false,
      status: "VISUAL_FILES_INVALID",
      errors:
        validation.errors
    };
  }

  const imageFiles =
    scenes.map(
      (scene) =>
        scene.imageFile ||
        scene.outputFile ||
        scene.filePath
    );

  const numericDuration =
    Number(durationPerScene);

  const numericFps =
    Number(fps);

  if (
    !Number.isFinite(
      numericDuration
    ) ||
    numericDuration <= 0
  ) {
    return {
      success: false,
      status: "INVALID_DURATION",
      error:
        "durationPerScene must be greater than zero."
    };
  }

  if (
    !Number.isFinite(numericFps) ||
    numericFps < 24 ||
    numericFps > 60
  ) {
    return {
      success: false,
      status: "INVALID_FPS",
      error:
        "FPS must be between 24 and 60."
    };
  }

  await fs.mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const result =
    await renderImageSequenceToVideo({
      imageFiles,
      outputDir,
      durationPerImage:
        numericDuration,
      fps:
        numericFps
    });

  if (!result.success) {
    return {
      success: false,
      status: "VIDEO_RENDER_FAILED",
      rendererResult:
        result
    };
  }

  return {
    success: true,
    status: "VISUAL_VIDEO_READY",
    outputFile:
      result.outputFile,
    sceneCount:
      imageFiles.length,
    durationPerScene:
      numericDuration,
    fps:
      numericFps,
    format:
      path.extname(
        result.outputFile
      ).toLowerCase(),
    createdAt:
      new Date().toISOString()
  };
}

export function getVisualVideoPipelineStatus() {
  return {
    configured: true,
    status: "READY",
    resolution:
      "1080x1920",
    format:
      "MP4",
    fps:
      "24-60",
    message:
      "Visual scenes can be rendered into a vertical YouTube Short."
  };
}
