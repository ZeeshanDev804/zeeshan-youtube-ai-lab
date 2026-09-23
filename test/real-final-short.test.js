import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

import {
  produceFinalShort
} from "../src/finalShortProductionPipeline.js";

const topic =
  "3 powerful habits that can improve your life";

const script = `
Three simple habits can change the way you live.
First, start your day with a clear priority instead of checking everything at once.
Second, spend a little time every day learning something useful.
Third, protect your focus by removing unnecessary distractions.
Small actions repeated consistently can create major results over time.
`;

console.log("");
console.log("========================================");
console.log(" ZEESHAN AI LABS");
console.log(" REAL FINAL SHORT TEST");
console.log("========================================");
console.log("");

console.log("Topic:", topic);
console.log("");

try {
  const result =
    await produceFinalShort({
      topic,
      script,
      language: "en-US",
      assetsDir:
        "./storage/test-assets",
      audioDir:
        "./storage/test-audio",
      videoDir:
        "./storage/test-videos",
      finalDir:
        "./storage/test-final",
      durationPerScene: 5,
      fps: 30
    });

  console.log("");
  console.log("RESULT:");
  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  if (!result.success) {
    console.error("");
    console.error(
      "❌ REAL FINAL SHORT TEST FAILED"
    );

    console.error(
      "Stage:",
      result.stage || "UNKNOWN"
    );

    process.exit(1);
  }

  const outputFile =
    result.finalVideo?.outputFile;

  if (!outputFile) {
    console.error("");
    console.error(
      "❌ FINAL VIDEO PATH IS MISSING"
    );

    process.exit(1);
  }

  const absoluteOutput =
    path.resolve(
      outputFile
    );

  const stats =
    await fs.stat(
      absoluteOutput
    );

  if (stats.size <= 0) {
    console.error("");
    console.error(
      "❌ FINAL VIDEO IS EMPTY"
    );

    process.exit(1);
  }

  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    " ✅ REAL FINAL SHORT CREATED"
  );
  console.log(
    "========================================"
  );

  console.log("");
  console.log(
    "Final MP4:",
    absoluteOutput
  );

  console.log(
    "Size:",
    stats.size,
    "bytes"
  );

  console.log("");
  console.log(
    "Next Stage:",
    "FINAL QUALITY ASSURANCE"
  );

} catch (error) {
  console.error("");
  console.error(
    "========================================"
  );
  console.error(
    " ❌ TEST CRASHED"
  );
  console.error(
    "========================================"
  );

  console.error("");
  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  process.exit(1);
}
