import "dotenv/config";

import {
  getSystemStatus
} from "./ceoControl.js";

import {
  getTrendRadar
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

import {
  getConfigStatus
} from "./config.js";

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

function normalizeStatus(value) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}

function checkReady(status) {
  return (
    normalizeStatus(status) ===
    "READY"
  );
}

function checkConfigStatus(configStatus) {
  if (!configStatus) {
    return {
      available: false,
      configured: false,
      status: "NOT_AVAILABLE"
    };
  }

  const status =
    normalizeStatus(
      configStatus.status
    );

  const configured =
    configStatus.configured === true ||
    status === "READY" ||
    status === "CONFIGURED";

  return {
    available: true,
    configured,
    status:
      status ||
      (
        configured
          ? "CONFIGURED"
          : "NOT_CONFIGURED"
      )
  };
}

async function safeCall(
  label,
  callback
) {
  try {
    const result =
      await callback();

    return {
      status: "OK",
      label,
      result
    };
  } catch (error) {
    return {
      status: "ERROR",
      label,
      error:
        error?.message ||
        `${label} failed.`
    };
  }
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

  /*
   * --------------------------------
   * 1. CONFIGURATION
   * --------------------------------
   */

  let configStatus;

  try {
    configStatus =
      getConfigStatus();
  } catch (error) {
    configStatus = {
      status: "ERROR",
      configured: false,
      error:
        error?.message ||
        "Configuration status check failed."
    };
  }

  printSection(
    "CONFIGURATION",
    configStatus
  );

  /*
   * --------------------------------
   * 2. CEO CONTROL
   * --------------------------------
   */

  let systemStatus;

  try {
    systemStatus =
      getSystemStatus();
  } catch (error) {
    systemStatus = {
      status: "ERROR",
      error:
        error?.message ||
        "CEO control check failed."
    };
  }

  printSection(
    "CEO CONTROL",
    systemStatus
  );

  /*
   * --------------------------------
   * 3. TREND RADAR
   * --------------------------------
   */

  const trendCheck =
    await safeCall(
      "Trend radar",
      getTrendRadar
    );

  const trendStatus =
    trendCheck.status === "OK"
      ? trendCheck.result
      : {
          status: "ERROR",
          error:
            trendCheck.error
        };

  printSection(
    "TREND RADAR",
    trendStatus
  );

  /*
   * --------------------------------
   * 4. PRODUCTION CONTROLLER
   * --------------------------------
   */

  let productionStatus;

  try {
    productionStatus =
      getShortProductionControllerStatus();
  } catch (error) {
    productionStatus = {
      status: "ERROR",
      error:
        error?.message ||
        "Production controller check failed."
    };
  }

  printSection(
    "SHORT PRODUCTION CONTROLLER",
    productionStatus
  );

  /*
   * --------------------------------
   * 5. QUALITY PIPELINE
   * --------------------------------
   */

  let qualityStatus;

  try {
    qualityStatus =
      getShortQualityPipelineStatus();
  } catch (error) {
    qualityStatus = {
      status: "ERROR",
      error:
        error?.message ||
        "Quality pipeline check failed."
    };
  }

  printSection(
    "QUALITY PIPELINE",
    qualityStatus
  );

  /*
   * --------------------------------
   * 6. YOUTUBE PUBLISH GATE
   * --------------------------------
   */

  let publishGateStatus;

  try {
    publishGateStatus =
      getYouTubePublishGateStatus();
  } catch (error) {
    publishGateStatus = {
      status: "ERROR",
      error:
        error?.message ||
        "YouTube publish gate check failed."
    };
  }

  printSection(
    "YOUTUBE PUBLISH GATE",
    publishGateStatus
  );

  /*
   * --------------------------------
   * 7. PRODUCTION CONTROLLER TEST
   * --------------------------------
   */

  let productionTest;

  try {
    productionTest =
      await runProductionControllerTest();
  } catch (error) {
    productionTest = {
      success: false,
      status: "ERROR",
      error:
        error?.message ||
        "Production controller test failed."
    };
  }

  printSection(
    "PRODUCTION TEST",
    productionTest
  );

  /*
   * --------------------------------
   * 8. FOUNDATION CHECKS
   * --------------------------------
   */

  const foundationChecks = {
    system:
      systemStatus?.mode !== undefined,

    productionController:
      checkReady(
        productionStatus?.status
      ),

    qualityPipeline:
      checkReady(
        qualityStatus?.status
      ),

    youtubePublishGate:
      checkReady(
        publishGateStatus?.status
      ),

    productionTest:
      productionTest?.success === true
  };

  const foundationPassed =
    Object.values(
      foundationChecks
    ).every(Boolean);

  /*
   * --------------------------------
   * 9. CONFIGURATION READINESS
   * --------------------------------
   *
   * Configuration is reported
   * separately from architecture.
   *
   * A foundation PASS must not be
   * treated as proof that real
   * external services are connected.
   */

  const configuration =
    checkConfigStatus(
      configStatus
    );

  const integrationChecks = {
    configurationAvailable:
      configuration.available,

    configurationConfigured:
      configuration.configured
  };

  const integrationConfigured =
    Object.values(
      integrationChecks
    ).every(Boolean);

  /*
   * --------------------------------
   * 10. FINAL STATUS
   * --------------------------------
   */

  const finalStatus = {
    foundation:
      foundationPassed,

    integrationConfiguration:
      integrationConfigured
  };

  /*
   * The foundation system can be
   * structurally healthy even when
   * external services still need
   * credentials/configuration.
   *
   * Therefore we expose two clear
   * states instead of pretending
   * everything is production-ready.
   */

  let overallStatus;

  if (
    foundationPassed &&
    integrationConfigured
  ) {
    overallStatus =
      "PRODUCTION_CONFIGURATION_READY";
  } else if (
    foundationPassed
  ) {
    overallStatus =
      "FOUNDATION_READY_CONFIGURATION_REQUIRED";
  } else {
    overallStatus =
      "CHECK_REQUIRED";
  }

  console.log(
    "\n================================"
  );

  console.log(
    `FOUNDATION RESULT: ${
      foundationPassed
        ? "PASS"
        : "CHECK REQUIRED"
    }`
  );

  console.log(
    `CONFIGURATION RESULT: ${
      integrationConfigured
        ? "READY"
        : "CONFIGURATION REQUIRED"
    }`
  );

  console.log(
    `OVERALL RESULT: ${overallStatus}`
  );

  console.log(
    "================================"
  );

  return {
    success:
      foundationPassed,

    status:
      overallStatus,

    productionReady:
      foundationPassed &&
      integrationConfigured,

    foundationChecks,

    integrationChecks,

    checks: finalStatus,

    configuration: configStatus,

    system: systemStatus,

    trendRadar: trendStatus,

    productionController:
      productionStatus,

    qualityPipeline:
      qualityStatus,

    youtubePublishGate:
      publishGateStatus,

    productionTest
  };
}

if (
  process.argv.includes(
    "--test"
  )
) {
  const result =
    await runSystemTest();

  /*
   * Exit with failure only when
   * the actual foundation is broken.
   *
   * Missing external credentials
   * should remain visible as
   * configuration-required rather
   * than being confused with a
   * broken architecture.
   */

  if (
    result.success !== true
  ) {
    process.exitCode = 1;
  }
}

export {
  runSystemTest
};