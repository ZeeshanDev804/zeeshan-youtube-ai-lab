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

import {
  getYouTubeOAuthStatus
} from "./youtubeOAuthUploader.js";

function normalize(value) {
  return String(
    value ?? ""
  )
    .trim()
    .toUpperCase();
}

function check(name, condition, details = "") {
  return {
    name,
    passed: Boolean(condition),
    details
  };
}

function safeStatus(
  name,
  getter
) {
  try {
    return {
      name,
      data: getter(),
      error: null
    };
  } catch (error) {
    return {
      name,
      data: null,
      error:
        error?.message ||
        `${name} status check failed.`
    };
  }
}

function getRiskPolicy(
  youtube,
  publishGate
) {
  const source =
    publishGate ||
    youtube ||
    {};

  return {
    low:
      normalize(
        source.lowRisk ||
        source.policy?.low ||
        source.low
      ),

    medium:
      normalize(
        source.mediumRisk ||
        source.policy?.medium ||
        source.medium
      ),

    high:
      normalize(
        source.highRisk ||
        source.policy?.high ||
        source.high
      ),

    stop:
      normalize(
        source.stopRisk ||
        source.policy?.stop ||
        source.stop
      )
  };
}

function getDefaultPrivacy(
  youtube
) {
  return normalize(
    youtube?.defaultPrivacy ||
    youtube?.privacyStatus ||
    "private"
  );
}

function getConfigurationStatus() {
  const required = {
    Gemini:
      Boolean(
        process.env.AI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY
      ),

    ElevenLabs:
      Boolean(
        process.env.ELEVENLABS_API_KEY &&
        process.env.ELEVENLABS_VOICE_ID
      ),

    YouTubeOAuth:
      Boolean(
        process.env.YOUTUBE_CLIENT_ID &&
        process.env.YOUTUBE_CLIENT_SECRET &&
        process.env.YOUTUBE_REFRESH_TOKEN
      )
  };

  return required;
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
   * ========================================
   * 1. STATUS COLLECTION
   * ========================================
   */

  const systemResult =
    safeStatus(
      "CEO CONTROL",
      getSystemStatus
    );

  const productionResult =
    safeStatus(
      "FINAL SHORT PRODUCTION",
      getFinalShortProductionStatus
    );

  const qaResult =
    safeStatus(
      "FINAL QUALITY ASSURANCE",
      getFinalShortQAStatus
    );

  const youtubeResult =
    safeStatus(
      "YOUTUBE PRODUCTION",
      getYouTubeProductionStatus
    );

  const uploaderResult =
    safeStatus(
      "YOUTUBE PRODUCTION UPLOADER",
      getYouTubeProductionUploaderStatus
    );

  const controllerResult =
    safeStatus(
      "PRODUCTION CONTROLLER",
      getShortProductionControllerStatus
    );

  const publishGateResult =
    safeStatus(
      "YOUTUBE PUBLISH GATE",
      getYouTubePublishGateStatus
    );

  const oauthResult =
    safeStatus(
      "YOUTUBE OAUTH",
      getYouTubeOAuthStatus
    );

  const system =
    systemResult.data || {};

  const production =
    productionResult.data || {};

  const qa =
    qaResult.data || {};

  const youtube =
    youtubeResult.data || {};

  const uploader =
    uploaderResult.data || {};

  const controller =
    controllerResult.data || {};

  const publishGate =
    publishGateResult.data || {};

  const oauth =
    oauthResult.data || {};

  /*
   * ========================================
   * 2. RISK POLICY
   * ========================================
   */

  const riskPolicy =
    getRiskPolicy(
      youtube,
      publishGate
    );

  const privacy =
    getDefaultPrivacy(
      youtube
    );

  /*
   * ========================================
   * 3. ENVIRONMENT CONFIGURATION
   * ========================================
   */

  const configuration =
    getConfigurationStatus();

  /*
   * ========================================
   * 4. FOUNDATION CHECKS
   * ========================================
   */

  const checks = [
    check(
      "CEO CONTROL AVAILABLE",
      !systemResult.error &&
      system.mode !== undefined,
      systemResult.error || ""
    ),

    check(
      "FINAL SHORT PRODUCTION READY",
      !productionResult.error &&
      normalize(
        production.status
      ) === "READY",
      productionResult.error || ""
    ),

    check(
      "FINAL QUALITY ASSURANCE READY",
      !qaResult.error &&
      normalize(
        qa.status
      ) === "READY",
      qaResult.error || ""
    ),

    check(
      "YOUTUBE PRODUCTION READY",
      !youtubeResult.error &&
      normalize(
        youtube.status
      ) === "READY",
      youtubeResult.error || ""
    ),

    check(
      "YOUTUBE PRODUCTION UPLOADER AVAILABLE",
      !uploaderResult.error &&
      [
        "CONFIGURED",
        "NOT_CONFIGURED"
      ].includes(
        normalize(
          uploader.status
        )
      ),
      uploaderResult.error || ""
    ),

    check(
      "PRODUCTION CONTROLLER READY",
      !controllerResult.error &&
      normalize(
        controller.status
      ) === "READY",
      controllerResult.error || ""
    ),

    check(
      "PUBLISH GATE READY",
      !publishGateResult.error &&
      normalize(
        publishGate.status
      ) === "READY",
      publishGateResult.error || ""
    ),

    check(
      "YOUTUBE OAUTH STATUS AVAILABLE",
      !oauthResult.error &&
      [
        "CONFIGURED",
        "NOT_CONFIGURED"
      ].includes(
        normalize(
          oauth.status
        )
      ),
      oauthResult.error || ""
    ),

    /*
     * ========================================
     * RISK POLICY
     * ========================================
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
      ),
      riskPolicy.low
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
      ),
      riskPolicy.medium
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
      ),
      riskPolicy.high
    ),

    check(
      "STOP / EMERGENCY BLOCK",
      [
        "BLOCKED",
        "STOP",
        "EMERGENCY_STOP"
      ].includes(
        riskPolicy.stop
      ),
      riskPolicy.stop
    ),

    /*
     * ========================================
     * PRIVACY
     * ========================================
     */

    check(
      "DEFAULT YOUTUBE PRIVACY IS PRIVATE",
      privacy === "PRIVATE",
      privacy
    )
  ];

  /*
   * ========================================
   * 5. CONFIGURATION CHECKS
   * ========================================
   *
   * These are reported separately.
   *
   * Foundation can exist without real
   * production credentials.
   */

  const configurationChecks = [
    check(
      "GEMINI CONFIGURATION",
      configuration.Gemini
    ),

    check(
      "ELEVENLABS CONFIGURATION",
      configuration.ElevenLabs
    ),

    check(
      "YOUTUBE OAUTH CONFIGURATION",
      configuration.YouTubeOAuth
    )
  ];

  /*
   * ========================================
   * 6. RESULTS
   * ========================================
   */

  const foundationPassed =
    checks.filter(
      (item) =>
        item.passed
    ).length;

  const foundationTotal =
    checks.length;

  const foundationReady =
    foundationPassed ===
    foundationTotal;

  const configurationPassed =
    configurationChecks.filter(
      (item) =>
        item.passed
    ).length;

  const configurationTotal =
    configurationChecks.length;

  const configurationReady =
    configurationPassed ===
    configurationTotal;

  /*
   * IMPORTANT:
   *
   * This test does NOT pretend that external
   * APIs are working just because environment
   * variables exist.
   *
   * Credentials configured != real API tested.
   */

  const liveIntegrationTestsRequired = [
    "REAL_GEMINI_TEXT_TEST",
    "REAL_GEMINI_IMAGE_TEST",
    "REAL_ELEVENLABS_TTS_TEST",
    "REAL_FFMPEG_MEDIA_TEST",
    "REAL_YOUTUBE_PRIVATE_UPLOAD_TEST",
    "REAL_END_TO_END_PIPELINE_TEST"
  ];

  const finalReady =
    foundationReady &&
    configurationReady;

  /*
   * ========================================
   * 7. CONSOLE OUTPUT
   * ========================================
   */

  console.log(
    "\nFOUNDATION CHECKS:"
  );

  for (const item of checks) {
    console.log(
      `${item.passed ? "PASS" : "FAIL"} - ${item.name}`
    );

    if (item.details) {
      console.log(
        `       ${item.details}`
      );
    }
  }

  console.log(
    "\nCONFIGURATION CHECKS:"
  );

  for (const item of configurationChecks) {
    console.log(
      `${item.passed ? "PASS" : "WAIT"} - ${item.name}`
    );
  }

  console.log(
    "\n========================================"
  );

  console.log(
    `FOUNDATION: ${foundationPassed}/${foundationTotal}`
  );

  console.log(
    `CONFIGURATION: ${configurationPassed}/${configurationTotal}`
  );

  console.log(
    "========================================"
  );

  console.log(
    "\nCURRENT MODE:",
    system?.mode || "UNKNOWN"
  );

  console.log(
    "YOUTUBE OAUTH:",
    oauth?.status || "UNKNOWN"
  );

  console.log(
    "YOUTUBE UPLOADER:",
    uploader?.status || "UNKNOWN"
  );

  console.log(
    "PUBLISH GATE:",
    publishGate?.status || "UNKNOWN"
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
    "\nLIVE INTEGRATION TESTS STILL REQUIRED:"
  );

  for (
    const test of
    liveIntegrationTestsRequired
  ) {
    console.log(
      `WAIT - ${test}`
    );
  }

  console.log(
    "\n========================================"
  );

  if (finalReady) {
    console.log(
      "FINAL FOUNDATION STATUS: READY"
    );

    console.log(
      "Production configuration is present."
    );

    console.log(
      "Live external-service tests are still required before public automation."
    );
  } else if (foundationReady) {
    console.log(
      "FINAL FOUNDATION STATUS: READY"
    );

    console.log(
      "CONFIGURATION REQUIRED"
    );
  } else {
    console.log(
      "FINAL FOUNDATION STATUS: CHECK REQUIRED"
    );
  }

  console.log(
    "========================================"
  );

  /*
   * ========================================
   * 8. RETURN RESULT
   * ========================================
   */

  return {
    success:
      foundationReady,

    foundationReady,

    configurationReady,

    finalReady,

    status:
      foundationReady
        ? configurationReady
          ? "READY_FOR_LIVE_INTEGRATION_TEST"
          : "FOUNDATION_READY_CONFIGURATION_REQUIRED"
        : "CHECK_REQUIRED",

    foundation: {
      passed:
        foundationPassed,

      total:
        foundationTotal,

      checks
    },

    configuration: {
      passed:
        configurationPassed,

      total:
        configurationTotal,

      checks:
        configurationChecks
    },

    currentMode:
      system?.mode ||
      null,

    productionStatus:
      production?.status ||
      null,

    qaStatus:
      qa?.status ||
      null,

    youtubeStatus:
      youtube?.status ||
      null,

    uploaderStatus:
      uploader?.status ||
      null,

    oauthStatus:
      oauth?.status ||
      null,

    publishGateStatus:
      publishGate?.status ||
      null,

    riskPolicy,

    defaultPrivacy:
      privacy,

    liveIntegrationTestsRequired,

    important:
      [
        "This test does NOT upload a video.",
        "This test does NOT publish a video.",
        "Configured credentials do NOT prove that the external API works.",
        "A real private YouTube upload test is still required.",
        "A real end-to-end production test is still required."
      ],

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

  /*
   * Only foundation failure causes
   * the test command to fail.
   *
   * Missing real credentials are reported
   * separately and do not falsely mark the
   * code foundation as broken.
   */

  if (
    result.foundationReady !== true
  ) {
    process.exitCode = 1;
  }
}