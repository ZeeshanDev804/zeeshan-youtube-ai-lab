import "dotenv/config";

import { getSystemStatus } from "./ceoControl.js";
import { getTrendRadar } from "./trendRadar.js";
import { getShortProductionControllerStatus } from "./shortProductionController.js";
import { getShortQualityPipelineStatus } from "./shortQualityPipeline.js";
import { getYouTubePublishGateStatus } from "./youtubePublishGate.js";
import { getFinalShortProductionStatus } from "./finalShortProductionPipeline.js";
import { getFinalShortQAStatus } from "./finalShortQAPipeline.js";
import { getYouTubeProductionStatus } from "./youtubeProductionPipeline.js";
import { getYouTubeProductionUploaderStatus } from "./youtubeProductionUploader.js";

function runCheck(name, fn) {
  try {
    const result = fn();

    return {
      name,
      status: "PASS",
      result
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      error: error?.message || String(error)
    };
  }
}

async function runAsyncCheck(name, fn) {
  try {
    const result = await fn();

    return {
      name,
      status: "PASS",
      result
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      error: error?.message || String(error)
    };
  }
}

function printResult(item) {
  const icon =
    item.status === "PASS"
      ? "PASS"
      : "FAIL";

  console.log(
    `${icon} - ${item.name}`
  );

  if (item.status === "FAIL") {
    console.log(
      `       ERROR: ${item.error}`
    );
  }
}

export async function runDeepSystemDiagnostic() {
  console.log("\n========================================");
  console.log("ZEESHAN AI LABS");
  console.log("DEEP SYSTEM DIAGNOSTIC");
  console.log("========================================");

  const checks = [];

  checks.push(
    runCheck(
      "CEO CONTROL",
      () => getSystemStatus()
    )
  );

  checks.push(
    await runAsyncCheck(
      "TREND RADAR",
      () => getTrendRadar()
    )
  );

  checks.push(
    runCheck(
      "SHORT PRODUCTION CONTROLLER",
      () =>
        getShortProductionControllerStatus()
    )
  );

  checks.push(
    runCheck(
      "SHORT QUALITY PIPELINE",
      () =>
        getShortQualityPipelineStatus()
    )
  );

  checks.push(
    runCheck(
      "FINAL SHORT PRODUCTION",
      () =>
        getFinalShortProductionStatus()
    )
  );

  checks.push(
    runCheck(
      "FINAL SHORT QA",
      () =>
        getFinalShortQAStatus()
    )
  );

  checks.push(
    runCheck(
      "YOUTUBE PRODUCTION",
      () =>
        getYouTubeProductionStatus()
    )
  );

  checks.push(
    runCheck(
      "YOUTUBE PUBLISH GATE",
      () =>
        getYouTubePublishGateStatus()
    )
  );

  checks.push(
    runCheck(
      "YOUTUBE UPLOADER",
      () =>
        getYouTubeProductionUploaderStatus()
    )
  );

  console.log("\n----------------------------------------");
  console.log("RESULTS");
  console.log("----------------------------------------");

  for (const check of checks) {
    printResult(check);
  }

  const passed =
    checks.filter(
      item => item.status === "PASS"
    ).length;

  const failed =
    checks.filter(
      item => item.status === "FAIL"
    ).length;

  console.log("\n========================================");

  console.log(
    `PASSED: ${passed}/${checks.length}`
  );

  console.log(
    `FAILED: ${failed}/${checks.length}`
  );

  console.log("========================================");

  const system =
    checks.find(
      item => item.name === "CEO CONTROL"
    );

  const uploader =
    checks.find(
      item => item.name === "YOUTUBE UPLOADER"
    );

  console.log("\nSYSTEM MODE:");

  console.log(
    system?.result?.mode ??
    "UNKNOWN"
  );

  console.log("\nYOUTUBE UPLOADER:");

  console.log(
    uploader?.result?.status ??
    "UNKNOWN"
  );

  console.log("\nIMPORTANT:");

  console.log(
    "This diagnostic does NOT upload a video."
  );

  console.log(
    "This diagnostic does NOT publish a video."
  );

  console.log(
    "This diagnostic does NOT modify production data."
  );

  console.log(
    "It only checks whether system modules can load and respond."
  );

  return {
    success: failed === 0,
    passed,
    failed,
    total: checks.length,
    checks,
    testedAt:
      new Date().toISOString()
  };
}

if (
  process.argv.includes("--deep-test")
) {
  await runDeepSystemDiagnostic();
}
