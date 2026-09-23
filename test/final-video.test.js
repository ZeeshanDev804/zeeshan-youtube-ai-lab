import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  createImageVideo
} from "../src/imageVideoRenderer.js";

const testDir = path.join(
  os.tmpdir(),
  "zeeshan-final-video-test"
);

const outputFile = path.join(
  testDir,
  "final-short-test.mp4"
);

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
console.log(" FINAL SHORT VIDEO TEST");
console.log("========================================");
console.log("");

try {
  fs.mkdirSync(testDir, {
    recursive: true
  });

  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  console.log("🎬 Rendering final vertical Short...");
  console.log("");

  const result =
    await createImageVideo({
      outputPath: outputFile,
      durationSeconds: 10,
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
      "Final video rendering failed."
    );

    process.exit(1);
  }

  if (!fs.existsSync(outputFile)) {
    fail(
      "Final MP4 file was not created."
    );

    process.exit(1);
  }

  const stats =
    fs.statSync(outputFile);

  if (stats.size <= 0) {
    fail(
      "Final MP4 file is empty."
    );

    process.exit(1);
  }

  pass("Final MP4 file created");

  pass(
    `Final MP4 size: ${stats.size} bytes`
  );

  console.log("");
  console.log("Output:");
  console.log(outputFile);

  console.log("");
  console.log("========================================");
  console.log(" FINAL SHORT VIDEO TEST PASSED");
  console.log("========================================");
  console.log("");

} catch (error) {
  fail(
    error?.stack ||
    error?.message ||
    String(error)
  );
}
