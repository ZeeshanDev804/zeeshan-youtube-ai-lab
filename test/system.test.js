import "dotenv/config";

import { getSystemStatus } from "../src/ceoControl.js";
import { getTrendRadar } from "../src/trendRadar.js";
import {
  getShortProductionControllerStatus
} from "../src/shortProductionController.js";
import {
  getShortQualityPipelineStatus
} from "../src/shortQualityPipeline.js";
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

function pass(name, details = "") {
  return {
    name,
    status: "PASS",
    details
  };
}

function fail(name, error) {
  return {
    name,
    status: "FAIL",
    error:
      error?.message ||
      String(error)
  };
}

async function test(name, fn) {
  try {
    const result = await fn();

    return pass(
      name,
      result
    );
  } catch (error) {
    return fail(
      name,
      error
    );
  }
}

async function runSystemTest() {
  console.log("\n========================================");
  console.log("ZEESHAN AI LABS");
  console.log("SYSTEM TEST");
  console.log("========================================");

  const results = [];

  results.push(
    await test(
      "CEO CONTROL",
      () => getSystemStatus()
    )
  );

  results.push(
    await test(
      "TREND RADAR",
      () => getTrendRadar()
    )
  );

  results.push(
    await test(
      "SHORT PRODUCTION CONTROLLER",
      () =>
        getShortProductionControllerStatus()
    )
  );

  results.push(
    await test(
      "SHORT QUALITY PIPELINE",
      () =>
        getShortQualityPipelineStatus()
    )
  );

  results.push(
    await test(
      "FINAL SHORT PRODUCTION",
      () =>
        getFinalShortProductionStatus()
    )
  );

  results.push(
    await test(
      "FINAL SHORT QA",
      () =>
        getFinalShortQAStatus()
    )
  );

  results.push(
    await test(
      "YOUTUBE PRODUCTION",
      () =>
        getYouTubeProductionStatus()
    )
  );

  results.push(
    await test(
      "YOUTUBE PUBLISH GATE",
      () =>
        getYouTubePublishGateStatus()
    )
  );

  results.push(
    await test(
      "YOUTUBE UPLOADER",
      () =>
        getYouTubeProductionUploaderStatus()
    )
  );

  console.log("\nSYSTEM RESULTS");
  console.log("----------------------------------------");

  for (const result of results) {
    console.log(
      `${result.status === "PASS" ? "PASS" : "FAIL"} - ${result.name}`
    );

    if (result.status === "FAIL") {
      console.log(
        `  ERROR: ${result.error}`
      );
    }
  }

  const passed =
    results.filter(
      item => item.status === "PASS"
    ).length;

  const failed =
    results.filter(
      item => item.status === "FAIL"
    ).length;

  console.log("\n========================================");

  console.log(
    `PASSED: ${passed}/${results.length}`
  );

  console.log(
    `FAILED: ${failed}/${results.length}`
  );

  console.log("========================================");

  return {
    success: failed === 0,
    passed,
    failed,
    total: results.length,
    results,
    testedAt:
      new Date().toISOString()
  };
}

runSystemTest();
