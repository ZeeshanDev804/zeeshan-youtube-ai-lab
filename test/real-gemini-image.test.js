import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  generateGeminiImage
} from "../src/geminiImageProvider.js";

test(
  "REAL GEMINI IMAGE PRODUCTION TEST",
  async () => {
    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "REAL GEMINI IMAGE TEST"
    );
    console.log(
      "========================================"
    );

    const apiKey =
      process.env.AI_API_KEY ||
      process.env.GEMINI_API_KEY;

    assert.ok(
      typeof apiKey === "string" &&
      apiKey.trim().length > 0,
      "AI_API_KEY or GEMINI_API_KEY is missing from .env."
    );

    const outputDir =
      "./storage/test/gemini-images";

    await fs.mkdir(
      outputDir,
      {
        recursive: true
      }
    );

    const prompt =
      "Create an original cinematic vertical 9:16 image for a motivational YouTube Short. A person standing on a mountain at sunrise, looking toward a bright horizon, realistic photography style, dramatic natural lighting, no text, no logos, no copyrighted characters.";

    console.log(
      "Generating real Gemini image..."
    );

    const result =
      await generateGeminiImage({
        prompt,
        outputDir,
        aspectRatio: "9:16"
      });

    console.log(
      "Gemini result:",
      result
    );

    assert.ok(
      result,
      "Gemini returned no result."
    );

    assert.equal(
      result.success,
      true,
      `Gemini image generation failed: ${
        result.error ||
        JSON.stringify(result)
      }`
    );

    assert.ok(
      typeof result.outputFile === "string" &&
      result.outputFile.trim().length > 0,
      "Gemini did not return an output file."
    );

    const outputFile =
      path.resolve(
        result.outputFile
      );

    const stats =
      await fs.stat(
        outputFile
      );

    assert.ok(
      stats.isFile(),
      "Generated image output is not a file."
    );

    assert.ok(
      stats.size > 0,
      "Generated image file is empty."
    );

    const extension =
      path.extname(
        outputFile
      ).toLowerCase();

    assert.ok(
      [".png", ".jpg", ".jpeg", ".webp"].includes(
        extension
      ),
      `Unexpected image format: ${extension}`
    );

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "GEMINI REAL IMAGE TEST: GREEN"
    );
    console.log(
      "========================================"
    );

    console.log(
      `Image file: ${outputFile}`
    );

    console.log(
      `File size: ${stats.size} bytes`
    );

    console.log(
      "Real Gemini API request: SUCCESS"
    );

    console.log(
      "Real image generation: SUCCESS"
    );

    console.log(
      "9:16 image request: SUCCESS"
    );

    console.log(
      "========================================"
    );
  }
);
