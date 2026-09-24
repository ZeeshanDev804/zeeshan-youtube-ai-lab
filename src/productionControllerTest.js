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
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

function includesValue(
  array,
  value
) {
  return (
    Array.isArray(array) &&
    array.includes(value)
  );
}

function hasText(
  value
) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function checkRiskPolicy(
  publishGateStatus
) {
  const policy =
    publishGateStatus?.riskPolicy ||
    publishGateStatus?.policy ||
    {};

  const low =
    String(
      policy.low ||
      publishGateStatus?.lowRisk ||
      ""
    )
      .trim()
      .toUpperCase();

  const medium =
    String(
      policy.medium ||
      publishGateStatus?.mediumRisk ||
      ""
    )
      .trim()
      .toUpperCase();

  const high =
    String(
      policy.high ||
      publishGateStatus?.highRisk ||
      ""
    )
      .trim()
      .toUpperCase();

  const stop =
    String(
      policy.stop ||
      publishGateStatus?.stop ||
      ""
    )
      .trim()
      .toUpperCase();

  const emergencyStop =
    String(
      policy.emergencyStop ||
      publishGateStatus?.emergencyStopPolicy ||
      ""
    )
      .trim()
      .toUpperCase();

  return {
    lowRiskAutoPolicy:
      low === "AUTO_POLICY" ||
      low ===
        "AUTO_PUBLISH_WHEN_POLICY_ALLOWS",

    mediumRiskCEOReview:
      medium === "CEO_REVIEW" ||
      medium ===
        "CEO_REVIEW_REQUIRED",

    highRiskCEOReview:
      high === "CEO_REVIEW" ||
      high ===
        "CEO_REVIEW_REQUIRED",

    stopBlocked:
      stop === "BLOCKED",

    emergencyStopBlocked:
      emergencyStop === "BLOCKED"
  };
}

function checkControllerPipeline(
  controllerStatus
) {
  const pipeline =
    controllerStatus?.pipeline ||
    [];

  const safetyGates =
    controllerStatus?.safetyGates ||
    [];

  const publishingOrder =
    controllerStatus?.publishingOrder ||
    [];

  return {
    topicStage:
      includesValue(
        pipeline,
        "TOPIC"
      ),

    scriptStage:
      includesValue(
        pipeline,
        "SCRIPT"
      ),

    finalRenderStage:
      includesValue(
        pipeline,
        "FINAL_RENDER"
      ),

    finalValidationStage:
      includesValue(
        pipeline,
        "FINAL_OUTPUT_VALIDATION"
      ),

    qualityStage:
      includesValue(
        pipeline,
        "QUALITY_ASSURANCE"
      ),

    uploadGuardStage:
      includesValue(
        pipeline,
        "UPLOAD_GUARD"
      ),

    publishGateStage:
      includesValue(
        pipeline,
        "CEO_PUBLISH_GATE"
      ),

    youtubeStage:
      includesValue(
        pipeline,
        "YOUTUBE"
      ),

    qaRequired:
      includesValue(
        safetyGates,
        "QA_REQUIRED"
      ),

    riskCheckRequired:
      includesValue(
        safetyGates,
        "RISK_CHECK_REQUIRED"
      ),

    highRiskCEOReview:
      includesValue(
        safetyGates,
        "HIGH_RISK_CEO_REVIEW"
      ),

    mediumRiskCEOReview:
      includesValue(
        safetyGates,
        "MEDIUM_RISK_CEO_REVIEW"
      ),

    lowRiskAutoPolicy:
      includesValue(
        safetyGates,
        "LOW_RISK_AUTO_POLICY"
      ),

    emergencyStop:
      includesValue(
        safetyGates,
        "EMERGENCY_STOP"
      ),

    finalMediaFirst:
      publishingOrder.indexOf(
        "FINAL_MEDIA"
      ) !== -1,

    qaBeforeUploadGuard:
      publishingOrder.indexOf(
        "QA"
      ) <
      publishingOrder.indexOf(
        "UPLOAD_GUARD"
      ),

    uploadGuardBeforePublishGate:
      publishingOrder.indexOf(
        "UPLOAD_GUARD"
      ) <
      publishingOrder.indexOf(
        "PUBLISH_GATE"
      ),

    publishGateBeforeYouTube:
      publishingOrder.indexOf(
        "PUBLISH_GATE"
      ) <
      publishingOrder.indexOf(
        "YOUTUBE"
      )
  };
}

function checkQualityPipeline(
  qualityStatus
) {
  const validation =
    qualityStatus?.validation ||
    [];

  return {
    ready:
      qualityStatus?.status ===
      "READY",

    finalVideoRequired:
      validation.includes(
        "final video"
      ) ||
      validation.includes(
        "final video existence"
      ) ||
      validation.includes(
        "final output"
      ),

    durationCheck:
      validation.some(
        value =>
          String(value)
            .toLowerCase()
            .includes("duration")
      ),

    resolutionCheck:
      validation.some(
        value =>
          String(value)
            .toLowerCase()
            .includes("resolution")
      )
  };
}

export async function runProductionControllerTest() {
  console.log(
    "\nZEESHAN AI YOUTUBE LAB"
  );

  console.log(
    "Production Controller Integration Test"
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

  /*
   * ------------------------------------------------
   * CONTROLLER PIPELINE CHECKS
   * ------------------------------------------------
   */

  const controllerChecks =
    checkControllerPipeline(
      controllerStatus
    );

  /*
   * ------------------------------------------------
   * RISK POLICY CHECKS
   * ------------------------------------------------
   */

  const riskChecks =
    checkRiskPolicy(
      publishGateStatus
    );

  /*
   * ------------------------------------------------
   * QUALITY CHECKS
   * ------------------------------------------------
   */

  const qualityChecks =
    checkQualityPipeline(
      qualityStatus
    );

  /*
   * ------------------------------------------------
   * PUBLISH GATE FOUNDATION CHECKS
   * ------------------------------------------------
   */

  const publishGateChecks = {
    publishGateReady:
      publishGateStatus?.status ===
      "READY",

    emergencyStopDefined:
      publishGateStatus?.emergencyStop !==
      undefined,

    dailyTargetDefined:
      Number.isFinite(
        Number(
          publishGateStatus?.dailyTargetVideos
        )
      ) &&
      Number(
        publishGateStatus.dailyTargetVideos
      ) >= 1,

    noHardDailyMaximum:
      publishGateStatus?.hardDailyMaximum ===
        false ||
      publishGateStatus?.maxDailyVideos ===
        null,

    lowRiskPolicyDefined:
      riskChecks.lowRiskAutoPolicy,

    mediumRiskCEOReviewDefined:
      riskChecks.mediumRiskCEOReview,

    highRiskCEOReviewDefined:
      riskChecks.highRiskCEOReview
  };

  /*
   * ------------------------------------------------
   * COMPLETE CHECK RESULT
   * ------------------------------------------------
   */

  const checks = {
    controllerReady:
      controllerStatus?.status ===
      "READY",

    qualityPipelineReady:
      qualityStatus?.status ===
      "READY",

    publishGateReady:
      publishGateChecks.publishGateReady,

    /*
     * Controller pipeline
     */
    controllerTopic:
      controllerChecks.topicStage,

    controllerScript:
      controllerChecks.scriptStage,

    controllerFinalRender:
      controllerChecks.finalRenderStage,

    controllerFinalValidation:
      controllerChecks.finalValidationStage,

    controllerQA:
      controllerChecks.qualityStage,

    controllerUploadGuard:
      controllerChecks.uploadGuardStage,

    controllerPublishGate:
      controllerChecks.publishGateStage,

    controllerYouTube:
      controllerChecks.youtubeStage,

    /*
     * Safety
     */
    qaRequired:
      controllerChecks.qaRequired,

    riskCheckRequired:
      controllerChecks.riskCheckRequired,

    highRiskCEOReview:
      controllerChecks.highRiskCEOReview &&
      riskChecks.highRiskCEOReview,

    mediumRiskCEOReview:
      controllerChecks.mediumRiskCEOReview &&
      riskChecks.mediumRiskCEOReview,

    lowRiskAutoPolicy:
      controllerChecks.lowRiskAutoPolicy &&
      riskChecks.lowRiskAutoPolicy,

    emergencyStop:
      controllerChecks.emergencyStop,

    stopBlocked:
      riskChecks.stopBlocked,

    emergencyStopBlocked:
      riskChecks.emergencyStopBlocked,

    /*
     * Publishing order
     */
    finalMediaFirst:
      controllerChecks.finalMediaFirst,

    qaBeforeUploadGuard:
      controllerChecks.qaBeforeUploadGuard,

    uploadGuardBeforePublishGate:
      controllerChecks.uploadGuardBeforePublishGate,

    publishGateBeforeYouTube:
      controllerChecks.publishGateBeforeYouTube,

    /*
     * Quality
     */
    qualityFinalVideo:
      qualityChecks.finalVideoRequired,

    qualityDuration:
      qualityChecks.durationCheck,

    qualityResolution:
      qualityChecks.resolutionCheck,

    /*
     * System policy
     */
    dailyTargetDefined:
      publishGateChecks.dailyTargetDefined,

    noHardDailyMaximum:
      publishGateChecks.noHardDailyMaximum
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
      "\nPASS: Production controller and publishing safety architecture are ready."
    );
  } else {
    console.log(
      "\nFAIL: One or more production architecture checks failed."
    );
  }

  return {
    success:
      passed,

    status:
      passed
        ? "PASS"
        : "FAIL",

    checks,

    policy: {
      low:
        "AUTO_POLICY",

      medium:
        "CEO_REVIEW",

      high:
        "CEO_REVIEW",

      stop:
        "BLOCKED",

      emergencyStop:
        "BLOCKED"
    },

    publishingOrder: [
      "FINAL_MEDIA",
      "QA",
      "UPLOAD_GUARD",
      "PUBLISH_GATE",
      "YOUTUBE"
    ]
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  await runProductionControllerTest();
}