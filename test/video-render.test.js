import "dotenv/config";

import {
  checkFFmpeg,
  getImageVideoRendererStatus
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
console.log(" VIDEO RENDER TEST");
console.log("========================================");
console.log("");

try {
  // 1. FFmpeg availability
  const ffmpeg = await checkFFmpeg();

  if (
    ffmpeg &&
    (
      ffmpeg.available === true ||
      ffmpeg.status === "READY" ||
      ffmpeg.status === "AVAILABLE"
    )
  ) {
    pass("FFmpeg is available");
  } else {
    console.log("🟡 INFO: FFmpeg check returned:");
    console.log(ffmpeg);
  }

  // 2. Renderer status
  const rendererStatus =
    getImageVideoRendererStatus();

  if (rendererStatus) {
    pass("Video renderer module loaded");
    console.log("");
    console.log("Renderer status:");
    console.log(rendererStatus);
  } else {
    fail("Video renderer status is unavailable");
  }

  console.log("");
  console.log("========================================");
  console.log(" VIDEO RENDER ENGINE TEST COMPLETE");
  console.log("========================================");
  console.log("");

} catch (error) {
  fail(error?.message || String(error));
}
