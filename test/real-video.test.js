import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  createImageVideo
} from "../src/imageVideoRenderer.js";

function pass(message) {
  console.log(`🟢 PASS: ${message}`);
}

function fail(message) {
  console.error(`🔴 FAIL: ${message}`);
  process.exitCode = 1;
}

console.log("");
console.log("========================================");
console.log(" ZEESHAN AI LABS");
console.log(" REAL MP4 VIDEO TEST");
console.log("========================================");
console.log("");

const outputDir = path.join(
  os.tmpdir(),
  "zeeshan-ai-labs-video-test"
);

const outputFile = path.join(
  outputDir,
  "test-short.mp4"
);

try {
  fs.mkdirSync(outputDir, {
    recursive: true
  });

  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  console.log("🎬 Creating test video...");
  console.log(`Output: ${outputFile}`);
  console.log("");

  const result = await createImageVideo({
    outputPath: outputFile,
    durationSeconds: 5,
    width: 1080,
    height: 1920
  });

  console.log("Renderer result:");
  console.log(result);
  console.log("");

  if (
    result?.success === false ||
    result?.status === "FAILED"
  ) {
    fail(
      result?.error ||
      result?.reason ||
      "Video renderer reported failure."
    );
    process.exit(1);
  }

  if (!fs.existsSync(outputFile)) {
    fail("MP4 file was not created.");
    process.exit(1);
  }

  pass("MP4 file was created");

  const stats = fs.statSync(outputFile);

  if (stats.size <= 0) {
    fail("MP4 file is empty.");
    process.exit(1);
  }

  pass(
    `MP4 file has valid size: ${stats.size} bytes`
  );

  console.log("");
  console.log("========================================");
  console.log(" REAL MP4 VIDEO TEST PASSED");
  console.log("========================================");
  console.log("");

} catch (error) {
  fail(
    error?.stack ||
    error?.message ||
    String(error)
  );
}
