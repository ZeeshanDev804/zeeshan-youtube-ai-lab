import "dotenv/config";

import {
  getSystemStatus
} from "./ceoControl.js";

import {
  getTrendRadarStatus
} from "./trendRadar.js";

import {
  getShortProductionControllerStatus
} from "./shortProductionController.js";

import {
  getShortQualityPipelineStatus
} from "./shortQualityPipeline.js";

import {
  getYouTubePublishGateStatus
} from "./youtubePublishGate.js";

import {
  runProductionControllerTest
} from "./productionControllerTest.js";

function printSection(title, data) {
  console.log(`\n=== ${title} ===`);
  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

async function runSystemTest() {
  console.log(
    "\n================================"
  );

  console.log(
    "ZEESHAN AI YOUTUBE LAB"
  );

  console.log(
    "SYSTEM TEST"
  );

  console.log(
    "================================"
  );

  const systemStatus =
    getSystemStatus();

  printSection(
    "CEO CONTROL",
    systemStatus
  );

  let trendStatus;

  try {
    trendStatus =
      getTrendRadarStatus();
  } catch (error) {
    trendStatus = {
      status: "ERROR",
      error:
        error?.message ||
        "Trend radar status failed."
    };
  }

  printSection(
    "TREND RADAR",
    trendStatus
  );

  const productionStatus =
    getShortProductionControllerStatus();

  printSection(
    "SHORT PRODUCTION CONTROLLER",
    productionStatus
  );

  const qualityStatus =
    getShortQualityPipelineStatus();

  printSection(
    "QUALITY PIPELINE",
    qualityStatus
  );

  const publishGateStatus =
    getYouTubePublishGateStatus();

  printSection(
    "YOUTUBE PUBLISH GATE",
    publishGateStatus
  );

  const productionTest =
    await runProductionControllerTest();

  printSection(
    "PRODUCTION TEST",
    productionTest
  );

  const finalStatus = {
    system:
      systemStatus.mode !== undefined,

    productionController:
      productionStatus.status ===
      "READY",

    qualityPipeline:
      qualityStatus.status ===
      "READY",

    youtubePublishGate:
      publishGateStatus.status ===
      "READY",

    productionTest:
      productionTest.success === true
  };

  const passed =
    Object.values(finalStatus)
      .every(Boolean);

  console.log(
    "\n================================"
  );

  console.log(
    passed
      ? "FINAL RESULT: PASS"
      : "FINAL RESULT: CHECK REQUIRED"
  );

  console.log(
    "================================"
  );

  return {
    success: passed,
    status:
      passed
        ? "PASS"
        : "CHECK_REQUIRED",
    checks:
      finalStatus
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  await runSystemTest();
}

export {
  runSystemTest
};