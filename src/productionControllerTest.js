import {
  getShortProductionControllerStatus
} from "./shortProductionController.js";

import {
  getYouTubePublishGateStatus
} from "./youtubePublishGate.js";

import {
  getShortQualityPipelineStatus
} from "./shortQualityPipeline.js";

function printResult(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log(
    JSON.stringify(result, null, 2)
  );
}

export async function runProductionControllerTest() {
  console.log(
    "\nZEESHAN AI YOUTUBE LAB"
  );

  console.log(
    "Production Controller Test"
  );

  const controllerStatus =
    getShortProductionControllerStatus();

  const qualityStatus =
    getShortQualityPipelineStatus();

  const publishGateStatus =
    getYouTubePublishGateStatus();

  printResult(
    "PRODUCTION CONTROLLER",
    controllerStatus
  );

  printResult(
    "QUALITY PIPELINE",
    qualityStatus
  );

  printResult(
    "YOUTUBE PUBLISH GATE",
    publishGateStatus
  );

  const checks = {
    controllerReady:
      controllerStatus.status === "READY",

    qualityPipelineReady:
      qualityStatus.status === "READY",

    publishGateReady:
      publishGateStatus.status === "READY",

    emergencyStopProtected:
      publishGateStatus.emergencyStop !== undefined,

    highRiskBlocked:
      publishGateStatus.highRisk ===
      "BLOCKED",

    mediumRiskReview:
      publishGateStatus.mediumRisk ===
      "CEO_REVIEW",

    lowRiskPolicy:
      publishGateStatus.lowRisk ===
      "AUTO_POLICY"
  };

  const passed =
    Object.values(checks)
      .every(Boolean);

  console.log(
    "\n=== TEST RESULT ==="
  );

  console.log(
    JSON.stringify(
      {
        passed,
        checks
      },
      null,
      2
    )
  );

  if (passed) {
    console.log(
      "\nPASS: Production controller foundation is ready."
    );
  } else {
    console.log(
      "\nFAIL: One or more production checks failed."
    );
  }

  return {
    success: passed,
    status: passed
      ? "PASS"
      : "FAIL",
    checks
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  await runProductionControllerTest();
}
