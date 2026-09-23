import "dotenv/config";
import fs from "node:fs";

import {
  getGeminiImageStatus,
  generateGeminiImage
} from "../src/geminiImageProvider.js";

console.log("");
console.log("========================================");
console.log(" ZEESHAN AI LABS");
console.log(" GEMINI REAL IMAGE TEST");
console.log("========================================");
console.log("");

try {
  const status =
    getGeminiImageStatus();

  console.log("Provider status:");
  console.log(status);
  console.log("");

  if (!status.configured) {
    throw new Error(
      "AI_API_KEY is not configured."
    );
  }

  console.log("🎨 Generating real test image...");

  const result =
    await generateGeminiImage({
      prompt:
        "A powerful cinematic scene showing a person overcoming failure and achieving success, inspiring documentary style, realistic lighting, clean composition."
    });

  console.log("");
  console.log("Generation result:");
  console.log(result);
  console.log("");

  if (
    !result ||
    result.success !== true
  ) {
    throw new Error(
      result?.error ||
      "Gemini image generation failed."
    );
  }

  if (
    !result.outputFile ||
    !fs.existsSync(
      result.outputFile
    )
  ) {
    throw new Error(
      "Generated image file was not found."
    );
  }

  const stats =
    fs.statSync(
      result.outputFile
    );

  if (stats.size <= 0) {
    throw new Error(
      "Generated image file is empty."
    );
  }

  console.log(
    `🟢 PASS: Real image generated`
  );

  console.log(
    `🟢 PASS: File exists`
  );

  console.log(
    `🟢 PASS: File size ${stats.size} bytes`
  );

  console.log("");
  console.log("========================================");
  console.log(" GEMINI REAL IMAGE TEST PASSED");
  console.log("========================================");
  console.log("");

} catch (error) {
  console.error("");
  console.error(
    "🔴 FAIL:",
    error?.message ||
    String(error)
  );
  console.error("");

  process.exitCode = 1;
}
