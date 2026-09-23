import "dotenv/config";

import {
  getSystemStatus
} from "./ceoControl.js";

import {
  getFinalShortProductionStatus
} from "./finalShortProductionPipeline.js";

import {
  getFinalShortQAStatus
} from "./finalShortQAPipeline.js";

import {
  getYouTubeProductionStatus
} from "./youtubeProductionPipeline.js";

import {
  getYouTubeProductionUploaderStatus
} from "./youtubeProductionUploader.js";

import {
  getShortProductionControllerStatus
} from "./shortProductionController.js";

function check(name, condition) {
  return {
    name,
    passed: Boolean(condition)
  };
}

export function runFinalSystemTest() {
  console.log(
    "\n========================================"
  );

  console.log(
    "ZEESHAN AI YOUTUBE LAB"
  );

  console.log(
    "FINAL SYSTEM TEST"
  );

  console.log(
    "========================================"
  );

  const system =
    getSystemStatus();

  const production =
    getFinalShortProductionStatus();

  const qa =
    getFinalShortQAStatus();

  const youtube =
    getYouTubeProductionStatus();

  const uploader =
    getYouTubeProductionUploaderStatus();

  const controller =
    getShortProductionControllerStatus();

  const checks = [
    check(
      "CEO CONTROL",
      system &&
      system.mode !== undefined
    ),

    check(
      "SHORT PRODUCTION",
      production.status ===
      "READY"
    ),

    check(
      "QUALITY ASSURANCE",
      qa.status ===
      "READY"
    ),

    check(
      "YOUTUBE PIPELINE",
      youtube.status ===
      "READY"
    ),

    check(
      "YOUTUBE UPLOADER",
      uploader.status ===
      "CONFIGURED" ||
      uploader.status ===
      "NOT_CONFIGURED"
    ),

    check(
      "PRODUCTION CONTROLLER",
      controller.status ===
      "READY"
    ),

    check(
      "HIGH RISK BLOCK",
      youtube.highRisk ===
      "BLOCKED"
    ),

    check(
      "MEDIUM RISK REVIEW",
      youtube.mediumRisk ===
      "CEO_REVIEW"
    ),

    check(
      "DEFAULT PRIVATE",
      youtube.defaultPrivacy ===
      "private"
    )
  ];

  const passed =
    checks.filter(
      (item) =>
        item.passed
    ).length;

  const total =
    checks.length;

  const allPassed =
    passed === total;

  console.log(
    "\nSYSTEM CHECKS:"
  );

  for (const item of checks) {
    console.log(
      `${item.passed ? "PASS" : "FAIL"} - ${item.name}`
    );
  }

  console.log(
    "\n========================================"
  );

  console.log(
    `RESULT: ${passed}/${total} CHECKS PASSED`
  );

  console.log(
    allPassed
      ? "FINAL FOUNDATION TEST: PASS"
      : "FINAL FOUNDATION TEST: CHECK REQUIRED"
  );

  console.log(
    "========================================"
  );

  console.log(
    "\nCURRENT MODE:",
    system.mode
  );

  console.log(
    "YOUTUBE UPLOADER:",
    uploader.status
  );

  console.log(
    "\nIMPORTANT:"
  );

  console.log(
    "This test does NOT upload a video."
  );

  console.log(
    "This test does NOT publish anything."
  );

  return {
    success:
      allPassed,

    status:
      allPassed
        ? "PASS"
        : "CHECK_REQUIRED",

    passed,
    total,

    checks,

    youtubeUploader:
      uploader.status,

    currentMode:
      system.mode,

    testedAt:
      new Date().toISOString()
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  runFinalSystemTest();
}
