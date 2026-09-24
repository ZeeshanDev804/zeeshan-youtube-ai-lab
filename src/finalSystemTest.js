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

import {
  getYouTubePublishGateStatus
} from "./youtubePublishGate.js";

function check(name, condition) {
  return {
    name,
    passed: Boolean(condition)
  };
}

function normalize(value) {
  return String(
    value ?? ""
  )
    .trim()
    .toUpperCase();
}

function firstDefined(
  ...values
) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null
  );
}

function getRiskPolicy(
  youtube,
  publishGate
) {
  const source =
    publishGate ||
    youtube ||
    {};

  const policy =
    source.policy ||
    source.riskPolicy ||
    {};

  return {
    low:
      normalize(
        firstDefined(
          policy.low,
          policy.lowRisk,
          source.lowRisk,
          source.low
        )
      ),

    medium:
      normalize(
        firstDefined(
          policy.medium,
          policy.mediumRisk,
          source.mediumRisk,
          source.medium
        )
      ),

    high:
      normalize(
        firstDefined(
          policy.high,
          policy.highRisk,
          source.highRisk,
          source.high
        )
      ),

    stop:
      normalize(
        firstDefined(
          policy.stop,
          policy.stopRisk,
          source.stop,
          source.stopRisk
        )
      )
  };
}

function getPrivacy(
  youtube
) {
  return normalize(
    firstDefined(
      youtube?.defaultPrivacy,
      youtube?.privacy,
      youtube?.uploadDefaults?.privacy,
      youtube?.defaults?.privacy
    )
  );
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

  /*
   * ----------------------------------------
   * 1. SYSTEM / CEO CONTROL
   * ----------------------------------------
   */

  let system;

  try {
    system =
      getSystemStatus();
  } catch (error) {
    system = {
      status: "ERROR",
      error:
        error?.message ||
        "CEO control status failed."
    };
  }

  /*
   * ----------------------------------------
   * 2. FINAL PRODUCTION
   * ----------------------------------------
   */

  let production;

  try {
    production =
      getFinalShortProductionStatus();
  } catch (error) {
    production = {
      status: "ERROR",
      error:
        error?.message ||
        "Final production status failed."
    };
  }

  /*
   * ----------------------------------------
   * 3. FINAL QA
   * ----------------------------------------
   */

  let qa;

  try {
    qa =
      getFinalShortQAStatus();
  } catch (error) {
    qa = {
      status: "ERROR",
      error:
        error?.message ||
        "Final QA status failed."
    };
  }

  /*
   * ----------------------------------------
   * 4. YOUTUBE PRODUCTION PIPELINE
   * ----------------------------------------
   */

  let youtube;

  try {
    youtube =
      getYouTubeProductionStatus();
  } catch (error) {
    youtube = {
      status: "ERROR",
      error:
        error?.message ||
        "YouTube production status failed."
    };
  }

  /*
   * ----------------------------------------
   * 5. YOUTUBE UPLOADER
   * ----------------------------------------
   */

  let uploader;

  try {
    uploader =
      getYouTubeProductionUploaderStatus();
  } catch (error) {
    uploader = {
      status: "ERROR",
      error:
        error?.message ||
        "YouTube uploader status failed."
    };
  }

  /*
   * ----------------------------------------
   * 6. PRODUCTION CONTROLLER
   * ----------------------------------------
   */

  let controller;

  try {
    controller =
      getShortProductionControllerStatus();
  } catch (error) {
    controller = {
      status: "ERROR",
      error:
        error?.message ||
        "Production controller status failed."
    };
  }

  /*
   * ----------------------------------------
   * 7. PUBLISH GATE
   * ----------------------------------------
   */

  let publishGate;

  try {
    publishGate =
      getYouTubePublishGateStatus();
  } catch (error) {
    publishGate = {
      status: "ERROR",
      error:
        error?.message ||
        "YouTube publish gate status failed."
    };
  }

  /*
   * ----------------------------------------
   * RISK POLICY
   * ----------------------------------------
   */

  const riskPolicy =
    getRiskPolicy(
      youtube,
      publishGate
    );

  const privacy =
    getPrivacy(
      youtube
    );

  /*
   * ----------------------------------------
   * SYSTEM CHECKS
   * ----------------------------------------
   */

  const checks = [
    check(
      "CEO CONTROL",
      system &&
      system.mode !== undefined
    ),

    check(
      "FINAL SHORT PRODUCTION",
      normalize(
        production?.status
      ) === "READY"
    ),

    check(
      "FINAL QUALITY ASSURANCE",
      normalize(
        qa?.status
      ) === "READY"
    ),

    check(
      "YOUTUBE PRODUCTION PIPELINE",
      normalize(
        youtube?.status
      ) === "READY"
    ),

    check(
      "YOUTUBE UPLOADER STATUS",
      [
        "CONFIGURED",
        "NOT_CONFIGURED"
      ].includes(
        normalize(
          uploader?.status
        )
      )
    ),

    check(
      "PRODUCTION CONTROLLER",
      normalize(
        controller?.status
      ) === "READY"
    ),

    check(
      "YOUTUBE PUBLISH GATE",
      normalize(
        publishGate?.status
      ) === "READY"
    ),

    /*
     * Final risk policy:
     *
     * LOW    → Auto policy
     * MEDIUM → CEO review
     * HIGH   → CEO review
     * STOP   → Blocked
     */

    check(
      "LOW RISK AUTO POLICY",
      [
        "AUTO_PUBLISH_WHEN_POLICY_ALLOWS",
        "AUTO",
        "AUTO_PUBLISH",
        "ALLOWED"
      ].includes(
        riskPolicy.low
      )
    ),

    check(
      "MEDIUM RISK CEO REVIEW",
      [
        "CEO_REVIEW_REQUIRED",
        "CEO_REVIEW",
        "REVIEW",
        "REVIEW_REQUIRED"
      ].includes(
        riskPolicy.medium
      )
    ),

    check(
      "HIGH RISK CEO REVIEW",
      [
        "CEO_REVIEW_REQUIRED",
        "CEO_REVIEW",
        "REVIEW",
        "REVIEW_REQUIRED"
      ].includes(
        riskPolicy.high
      )
    ),

    check(
      "STOP / EMERGENCY BLOCK",
      [
        "BLOCKED",
        "STOP",
        "EMERGENCY_STOP"
      ].includes(
        riskPolicy.stop
      )
    ),

    check(
      "DEFAULT PRIVATE",
      privacy === "PRIVATE"
    )
  ];

  /*
   * ----------------------------------------
   * RESULT
   * ----------------------------------------
   */

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
    system?.mode
  );

  console.log(
    "YOUTUBE UPLOADER:",
    uploader?.status
  );

  console.log(
    "PUBLISH GATE:",
    publishGate?.status
  );

  console.log(
    "\nRISK POLICY:"
  );

  console.log(
    "LOW:",
    riskPolicy.low
  );

  console.log(
    "MEDIUM:",
    riskPolicy.medium
  );

  console.log(
    "HIGH:",
    riskPolicy.high
  );

  console.log(
    "STOP:",
    riskPolicy.stop
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

  console.log(
    "Real YouTube OAuth/upload must still be tested separately."
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

    currentMode:
      system?.mode,

    youtubeUploader:
      uploader?.status,

    publishGate:
      publishGate?.status,

    riskPolicy,

    defaultPrivacy:
      privacy,

    testedAt:
      new Date().toISOString()
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  const result =
    runFinalSystemTest();

  if (
    result.success !== true
  ) {
    process.exitCode = 1;
  }
}