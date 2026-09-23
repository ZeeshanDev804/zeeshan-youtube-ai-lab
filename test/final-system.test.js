import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  getFinalShortProductionStatus
} from "../src/finalShortProductionPipeline.js";

import {
  getFinalShortQAStatus
} from "../src/finalShortQAPipeline.js";

import {
  getYouTubeProductionStatus
} from "../src/youtubeProductionPipeline.js";

import {
  getYouTubeProductionUploaderStatus
} from "../src/youtubeProductionUploader.js";

import {
  getYouTubePublishGateStatus
} from "../src/youtubePublishGate.js";

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
console.log(" FINAL SYSTEM INTEGRATION TEST");
console.log("========================================");
console.log("");

try {
  const production =
    getFinalShortProductionStatus();

  if (production) {
    pass("Final short production pipeline loaded");
    console.log("Production status:");
    console.log(production);
  } else {
    fail("Final production status unavailable");
  }

  console.log("");

  const qa =
    getFinalShortQAStatus();

  if (qa) {
    pass("Final short QA pipeline loaded");
    console.log("QA status:");
    console.log(qa);
  } else {
    fail("Final QA status unavailable");
  }

  console.log("");

  const youtube =
    getYouTubeProductionStatus();

  if (youtube) {
    pass("YouTube production pipeline loaded");
    console.log("YouTube production status:");
    console.log(youtube);
  } else {
    fail("YouTube production status unavailable");
  }

  console.log("");

  const uploader =
    getYouTubeProductionUploaderStatus();

  if (uploader) {
    pass("YouTube uploader module loaded");
    console.log("Uploader status:");
    console.log(uploader);
  } else {
    fail("YouTube uploader status unavailable");
  }

  console.log("");

  const publishGate =
    getYouTubePublishGateStatus();

  if (publishGate) {
    pass("YouTube publish gate loaded");
    console.log("Publish gate status:");
    console.log(publishGate);
  } else {
    fail("YouTube publish gate unavailable");
  }

  console.log("");
  console.log("========================================");
  console.log(" FINAL SYSTEM INTEGRATION TEST PASSED");
  console.log("========================================");
  console.log("");

} catch (error) {
  fail(
    error?.stack ||
    error?.message ||
    String(error)
  );
}
