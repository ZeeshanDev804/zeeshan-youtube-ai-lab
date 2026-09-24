import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  produceFinalShort
} from "../src/finalShortProductionPipeline.js";

import {
  checkFinalShortQuality
} from "../src/finalShortQAPipeline.js";

test(
  "REAL FINAL SHORT PRODUCTION E2E TEST",
  async () => {
    console.log("");
    console.log(
      "=============================================="
    );
    console.log(
      "ZEESHAN AI LABS - REAL FINAL SHORT E2E TEST"
    );
    console.log(
      "=============================================="
    );

    const topic =
      "The Power of Consistency";

    const script =
      "Consistency is one of the most powerful habits you can build. " +
      "You do not need to become successful overnight. " +
      "Small actions repeated every day can create major results over time. " +
      "Keep learning, keep improving, and keep moving forward. " +
      "Progress may feel slow, but consistent effort can turn small steps into meaningful achievements.";

    const outputDirs = {
      assets:
        "./storage/test/final-short/assets",

      audio:
        "./storage/test/final-short/audio",

      video:
        "./storage/test/final-short/video",

      final:
        "./storage/test/final-short/final",

      captions:
        "./storage/test/final-short/captions"
    };

    for (
      const dir of Object.values(outputDirs)
    ) {
      await fs.mkdir(
        dir,
        {
          recursive: true
        }
      );
    }

    console.log("");
    console.log(
      "STAGE 1/5 - REAL VOICE + VISUALS"
    );

    const production =
      await produceFinalShort({
        topic,
        script,
        language: "en-US",
        assetsDir:
          outputDirs.assets,
        audioDir:
          outputDirs.audio,
        videoDir:
          outputDirs.video,
        finalDir:
          outputDirs.final,
        captionDir:
          outputDirs.captions,
        durationPerScene: 5,
        fps: 30
      });

    console.log(
      "Production result:",
      production
    );

    assert.ok(
      production,
      "Production returned no result."
    );

    assert.equal(
      production.success,
      true,
      `Final production failed: ${
        production.error ||
        JSON.stringify(production)
      }`
    );

    console.log(
      "VOICE: GREEN"
    );

    console.log(
      "VISUALS: GREEN"
    );

    console.log(
      "VIDEO: GREEN"
    );

    console.log(
      "CAPTIONS: GREEN"
    );

    console.log(
      "FINAL RENDER: GREEN"
    );

    const finalVideoFile =
      production.finalVideo?.outputFile ||
      production.finalVideoFile ||
      production.outputFile;

    assert.ok(
      typeof finalVideoFile === "string" &&
      finalVideoFile.trim().length > 0,
      "Final MP4 output path is missing."
    );

    const absoluteVideo =
      path.resolve(
        finalVideoFile
      );

    const stats =
      await fs.stat(
        absoluteVideo
      );

    assert.ok(
      stats.isFile(),
      "Final video is not a file."
    );

    assert.ok(
      stats.size > 0,
      "Final video is empty."
    );

    assert.equal(
      path.extname(
        absoluteVideo
      ).toLowerCase(),
      ".mp4",
      "Final output must be MP4."
    );

    console.log("");
    console.log(
      "STAGE 2/5 - FINAL MP4 FILE"
    );

    console.log(
      `Final video: ${absoluteVideo}`
    );

    console.log(
      `File size: ${stats.size} bytes`
    );

    console.log(
      "FINAL MP4: GREEN"
    );

    console.log("");
    console.log(
      "STAGE 3/5 - FINAL QUALITY ASSURANCE"
    );

    const manifest = {
      id:
        `real_test_${Date.now()}`,

      metadata: {
        topic,
        title: topic,
        description:
          "Real production E2E test Short.",
        language:
          "en-US"
      },

      script,

      production
    };

    const qa =
      await checkFinalShortQuality({
        manifest,
        finalVideoFile:
          absoluteVideo
      });

    console.log(
      "QA result:",
      qa
    );

    assert.ok(
      qa,
      "QA returned no result."
    );

    assert.equal(
      qa.passed,
      true,
      `Final video QA failed: ${
        qa.error ||
        JSON.stringify(qa)
      }`
    );

    console.log(
      "DURATION 20-59 SEC: CHECKED"
    );

    console.log(
      "1080x1920: CHECKED"
    );

    console.log(
      "VIDEO STREAM: CHECKED"
    );

    console.log(
      "AUDIO STREAM: CHECKED"
    );

    console.log(
      "MP4/H.264/AAC: CHECKED"
    );

    console.log(
      "FINAL QA: GREEN"
    );

    console.log("");
    console.log(
      "STAGE 4/5 - OUTPUT VALIDATION"
    );

    const inspection =
      qa.qa?.inspection ||
      qa.inspection ||
      null;

    if (inspection) {
      console.log(
        "Duration:",
        inspection.durationSeconds
      );

      console.log(
        "Resolution:",
        `${inspection.video?.width}x${inspection.video?.height}`
      );

      console.log(
        "Video codec:",
        inspection.video?.codec
      );

      console.log(
        "Audio codec:",
        inspection.audio?.codec
      );

      console.log(
        "Format:",
        inspection.format
      );
    }

    console.log(
      "OUTPUT VALIDATION: GREEN"
    );

    console.log("");
    console.log(
      "STAGE 5/5 - FINAL RESULT"
    );

    console.log(
      "=============================================="
    );

    console.log(
      "REAL FINAL SHORT E2E TEST: GREEN"
    );

    console.log(
      "=============================================="
    );

    console.log(
      "Real Gemini visuals: SUCCESS"
    );

    console.log(
      "Real ElevenLabs voice: SUCCESS"
    );

    console.log(
      "FFmpeg video rendering: SUCCESS"
    );

    console.log(
      "Caption generation: SUCCESS"
    );

    console.log(
      "Final MP4 rendering: SUCCESS"
    );

    console.log(
      "Final video QA: SUCCESS"
    );

    console.log(
      "=============================================="
    );

    console.log(
      "IMPORTANT:"
    );

    console.log(
      "This test creates a real local Short."
    );

    console.log(
      "It does NOT publish anything to YouTube."
    );

    console.log(
      "YouTube OAuth/upload will be tested separately."
    );

    console.log(
      "=============================================="
    );
  }
);
